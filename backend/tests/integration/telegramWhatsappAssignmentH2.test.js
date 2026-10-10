/**
 * PLAN_GIAO_TK_TG_WA PR-H2 — nhân viên chỉ DÙNG tài khoản Telegram / WhatsApp (Baileys) ĐƯỢC GIAO (CSDL thật, HTTP thật):
 * trang quản lý kênh, Studio (danh sách + bật/tắt chatbot), trình dựng (danh sách + nhóm), Gửi nhanh, cài đặt gửi theo tài khoản,
 * lưu / sửa / nhân bản chiến dịch, bấm chạy (preflight) và engine chạy nền. Khuôn `campaignZaloAssignmentG3.test.js`.
 * Mọi nhóm có ca "chủ thấy hết". Engine: chỉ ca BỊ CHẶN chạy thật (dừng ngay đầu lượt, trước mọi lần gửi).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

process.env.BULLMQ_ENABLED = 'false';
process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';

const gatewayMock = {
  isConfigured: jest.fn(() => true),
  ensureHandler: jest.fn(async () => ({ data: { ok: true } })),
  deleteAccount: jest.fn(async () => ({ deleted: true })),
  // Phiên Telegram giả: không bao giờ chạm mạng.
  listAccounts: jest.fn(async () => ({ data: [] })),
};
jest.unstable_mockModule('../../src/services/chatbot/telegramGateway.client.js', () => ({ default: gatewayMock }));
jest.unstable_mockModule('../../src/services/chatbot/inProcChannelGateway/stubCheck.js', () => ({ isStubOnly: () => false }));

const realNotify = await import('../../src/utils/campaignQuotaPauseNotify.util.js');
jest.unstable_mockModule('../../src/utils/campaignQuotaPauseNotify.util.js', () => ({
  ...realNotify,
  notifyCampaignRunFailed: jest.fn().mockResolvedValue(undefined),
}));

const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');

let app;
let executeSpy;
let realExecuteCampaign;

beforeAll(() => {
  app = createApp();
  realExecuteCampaign = campaignRunService.executeCampaign.bind(campaignRunService);
  executeSpy = jest.spyOn(campaignRunService, 'executeCampaign').mockResolvedValue();
});

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM whatsapp_baileys_session_creds');
  executeSpy.mockClear();
});

afterEach(async () => {
  await db.query('DELETE FROM whatsapp_baileys_session_creds');
});

async function loginAs(user) {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) throw new Error(`Login thất bại cho ${user.username}: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

const EMPLOYEE_PERMISSIONS = {
  campaigns_view: true,
  campaigns_create: true,
  campaigns_run: true,
  chatbot_channels_manage: true,
  inbox_view: true,
};

async function addMembership(ownerId, employeeId, permissions = EMPLOYEE_PERMISSIONS) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, origin, accepted_at, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'active', 'created', NOW(), NOW(), NOW())`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
}

let telegramSeq = 900000;
async function createTelegram(ownerId, firstName) {
  telegramSeq += 1;
  const { rows } = await db.query(
    `INSERT INTO telegram_accounts (id_user, telegram_user_id, first_name, username, is_active)
     VALUES ($1, $2, $3, $4, true) RETURNING id`,
    [ownerId, telegramSeq, firstName, `u${telegramSeq}`]
  );
  return Number(rows[0].id);
}

async function createWhatsApp(ownerId, shortKey) {
  const sessionKey = `${ownerId}-${shortKey}`;
  await db.query(`INSERT INTO whatsapp_baileys_session_creds (session_key, creds) VALUES ($1, '{}'::jsonb)`, [sessionKey]);
  return sessionKey;
}

async function assign(ownerId, employeeId, channel, ref) {
  await db.query(
    `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source)
     VALUES ($1, $2, $3, $4, 'assigned')`,
    [ownerId, employeeId, channel, String(ref)]
  );
}

async function insertCampaign({ ownerId, createdBy = ownerId, type = 'telegram', name = `C ${Date.now()}${Math.random()}` }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, created_by, campaign_name, campaign_type, status)
     VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
    [createdBy, ownerId, createdBy, name, type]
  );
  return Number(rows[0].id);
}

async function insertNode(campaignId, subtype, config, order = 1) {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', $2, $2, $3::jsonb, $4) RETURNING id`,
    [campaignId, subtype, JSON.stringify(config), order]
  );
  return Number(rows[0].id);
}

/**
 * Một chủ có 2 tài khoản Telegram (t1 được giao, t2 chưa) + 2 phiên WhatsApp (w1 được giao, w2 chưa) + một nhân viên có quyền
 * quản lý kênh / chiến dịch. Chủ có quyền kênh Telegram + WhatsApp trong gói.
 */
async function setup() {
  const owner = await createUser({ username: `chu_h2_${Date.now()}`, role: 'user' });
  await db.query('UPDATE users SET max_telegram_accounts = 100, max_whatsapp_accounts = 100 WHERE id = $1', [owner.id]);
  const employee = await createUser({ username: `nv_h2_${Date.now()}`, role: 'user' });
  await addMembership(owner.id, employee.id);
  const t1 = await createTelegram(owner.id, 'TeleMot');
  const t2 = await createTelegram(owner.id, 'TeleHai');
  const w1 = await createWhatsApp(owner.id, 'mot');
  const w2 = await createWhatsApp(owner.id, 'hai');
  await assign(owner.id, employee.id, 'telegram', t1);
  await assign(owner.id, employee.id, 'whatsapp_baileys', w1);
  return { owner, employee, t1, t2, w1, w2, ownerToken: await loginAs(owner), employeeToken: await loginAs(employee) };
}

const asEmployee = (req, token, ownerId) => req.set('Authorization', `Bearer ${token}`).set('X-Owner-Context', String(ownerId));
const asOwner = (req, token) => req.set('Authorization', `Bearer ${token}`);

const telegramNodes = (accountId) => [
  { tempId: 'n1', nodeType: 'action', nodeSubtype: 'send_telegram', nodeName: 'Gửi TG', config: { telegramAccountId: accountId, recipientSource: 'telegram_conversations' } },
];
const whatsappNodes = (sessionKey) => [
  { tempId: 'n1', nodeType: 'action', nodeSubtype: 'send_whatsapp', nodeName: 'Gửi WA', config: { whatsappSessionKey: sessionKey, recipientSource: 'whatsapp_conversations' } },
];

describe('Telegram — trang quản lý kênh (HTTP)', () => {
  it('GET /ai/chatbot/telegram-accounts: nhân viên chỉ thấy tài khoản được giao; chủ thấy cả hai', async () => {
    const { owner, t1, t2, ownerToken, employeeToken } = await setup();
    const emp = await asEmployee(request(app).get('/api/ai/chatbot/telegram-accounts'), employeeToken, owner.id);
    expect(emp.status).toBe(200);
    expect(emp.body.data.map((a) => a.id)).toEqual([t1]);
    const own = await asOwner(request(app).get('/api/ai/chatbot/telegram-accounts'), ownerToken);
    expect(own.body.data.map((a) => a.id).sort((a, b) => a - b)).toEqual([t1, t2]);
  });

  it('nhân viên mới (chưa giao gì) → danh sách rỗng, không 403', async () => {
    const { owner, employeeToken, employee } = await setup();
    await db.query('DELETE FROM member_channel_accounts WHERE employee_id = $1', [employee.id]);
    const emp = await asEmployee(request(app).get('/api/ai/chatbot/telegram-accounts'), employeeToken, owner.id);
    expect(emp.status).toBe(200);
    expect(emp.body.data).toEqual([]);
  });

  it('DELETE / logout tài khoản chưa giao → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED, KHÔNG xoá / không ngắt; chủ xoá được', async () => {
    const { owner, t2, ownerToken, employeeToken } = await setup();
    const del = await asEmployee(request(app).delete(`/api/ai/chatbot/telegram-accounts/${t2}`), employeeToken, owner.id);
    expect(del.status).toBe(403);
    expect(del.body).toMatchObject({ success: false, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
    const out = await asEmployee(request(app).post(`/api/ai/chatbot/telegram-accounts/${t2}/logout`), employeeToken, owner.id);
    expect(out.status).toBe(403);
    const { rows } = await db.query('SELECT is_active FROM telegram_accounts WHERE id = $1', [t2]);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_active).toBe(true);
    expect(gatewayMock.deleteAccount).not.toHaveBeenCalled();

    const ownerDel = await asOwner(request(app).delete(`/api/ai/chatbot/telegram-accounts/${t2}`), ownerToken);
    expect(ownerDel.status).toBe(200);
  });

  it('nhân viên được giao xoá / ngắt tài khoản của mình được (quyết định 7 của Zalo): hàng giao đi theo', async () => {
    const { owner, employee, t1, employeeToken } = await setup();
    const out = await asEmployee(request(app).post(`/api/ai/chatbot/telegram-accounts/${t1}/logout`), employeeToken, owner.id);
    expect(out.status).toBe(200);
    const del = await asEmployee(request(app).delete(`/api/ai/chatbot/telegram-accounts/${t1}`), employeeToken, owner.id);
    expect(del.status).toBe(200);
    const { rows } = await db.query(`SELECT 1 FROM member_channel_accounts WHERE employee_id = $1 AND channel = 'telegram'`, [employee.id]);
    expect(rows).toHaveLength(0);
  });
});

describe('Telegram — Studio (danh sách + bật/tắt chatbot) và KHÔNG lộ tên chatbot của tài khoản chưa giao', () => {
  async function makeBots(ownerId) {
    const ids = [];
    for (const name of ['Bot Bí Mật', 'Bot B']) {
      const { rows } = await db.query(
        `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, $2, $3) RETURNING id`,
        [ownerId, name, `k_${Date.now()}_${Math.random()}`]
      );
      ids.push(Number(rows[0].id));
    }
    return ids;
  }

  it('GET telegram-accounts/chatbot: nhân viên chỉ thấy tài khoản được giao (kể cả huy hiệu bot khác); chủ thấy cả hai', async () => {
    const { owner, t1, t2, ownerToken, employeeToken } = await setup();
    const [botA, botB] = await makeBots(owner.id);
    await db.query(
      `INSERT INTO telegram_chatbot_settings (id_telegram_account, id_chatbot, is_enabled, is_enabled_dm, is_enabled_group) VALUES ($1, $2, true, true, true)`,
      [t2, botA]
    );
    const emp = await asEmployee(request(app).get(`/api/ai/chatbot/telegram-accounts/chatbot?chatbot_id=${botB}`), employeeToken, owner.id);
    expect(emp.status).toBe(200);
    expect(emp.body.data.map((a) => a.id)).toEqual([t1]);
    expect(JSON.stringify(emp.body)).not.toMatch(/Bot Bí Mật/);
    const own = await asOwner(request(app).get(`/api/ai/chatbot/telegram-accounts/chatbot?chatbot_id=${botB}`), ownerToken);
    expect(own.body.data.map((a) => a.id).sort((a, b) => a - b)).toEqual([t1, t2]);
  });

  it('toggle tài khoản chưa giao đang bật cho bot khác → 403 (KHÔNG phải 409), body KHÔNG chứa tên bot, không ghi dòng; chủ vẫn nhận 409', async () => {
    const { owner, t2, ownerToken, employeeToken } = await setup();
    const [botA, botB] = await makeBots(owner.id);
    await db.query(
      `INSERT INTO telegram_chatbot_settings (id_telegram_account, id_chatbot, is_enabled, is_enabled_dm, is_enabled_group) VALUES ($1, $2, true, true, true)`,
      [t2, botA]
    );
    const emp = await asEmployee(
      request(app).post('/api/ai/chatbot/telegram-account/chatbot/toggle').send({ enabled: true, id_account: t2, id_chatbot: botB }),
      employeeToken,
      owner.id
    );
    expect(emp.status).toBe(403);
    expect(emp.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    expect(JSON.stringify(emp.body)).not.toMatch(/Bot Bí Mật/);
    expect((await db.query('SELECT 1 FROM telegram_chatbot_settings WHERE id_telegram_account = $1', [t2])).rowCount).toBe(1);

    const own = await asOwner(
      request(app).post('/api/ai/chatbot/telegram-account/chatbot/toggle').send({ enabled: true, id_account: t2, id_chatbot: botB }),
      ownerToken
    );
    expect(own.status).toBe(409);
    expect(own.body.code).toBe('CHANNEL_ACCOUNT_BOUND_TO_OTHER_CHATBOT');
  });

  it('toggle tài khoản ĐƯỢC giao → bật được', async () => {
    const { owner, t1, employeeToken } = await setup();
    const [, botB] = await makeBots(owner.id);
    const emp = await asEmployee(
      request(app).post('/api/ai/chatbot/telegram-account/chatbot/toggle').send({ enabled: true, id_account: t1, id_chatbot: botB }),
      employeeToken,
      owner.id
    );
    expect(emp.status).toBe(200);
  });
});

describe('WhatsApp Baileys — trang quản lý kênh (HTTP)', () => {
  it('GET /whatsapp-qr/sessions: nhân viên chỉ thấy phiên được giao; chủ thấy cả hai', async () => {
    const { owner, w1, w2, ownerToken, employeeToken } = await setup();
    const emp = await asEmployee(request(app).get('/api/whatsapp-qr/sessions'), employeeToken, owner.id);
    expect(emp.status).toBe(200);
    expect(emp.body.data.map((s) => s.sessionKey)).toEqual([w1]);
    const own = await asOwner(request(app).get('/api/whatsapp-qr/sessions'), ownerToken);
    expect(own.body.data.map((s) => s.sessionKey).sort()).toEqual([w1, w2].sort());
  });

  it('status / disconnect / PATCH đổi tên / gửi thử / remove trên phiên CHƯA giao → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED; phiên không bị xoá', async () => {
    const { owner, w2, employeeToken } = await setup();
    const emp = (req) => asEmployee(req, employeeToken, owner.id);
    const status = await emp(request(app).get('/api/whatsapp-qr/sessions/hai'));
    expect(status.status).toBe(403);
    expect(status.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    expect((await emp(request(app).post('/api/whatsapp-qr/sessions/hai/disconnect'))).status).toBe(403);
    expect((await emp(request(app).patch('/api/whatsapp-qr/sessions/hai').send({ nickname: 'x' }))).status).toBe(403);
    expect((await emp(request(app).post('/api/whatsapp-qr/sessions/hai/messages').send({ to: '0912345678', text: 'hi' }))).status).toBe(403);
    expect((await emp(request(app).post('/api/whatsapp-qr/sessions/hai/_inject').send({ text: 'x' }))).status).toBe(403);
    const remove = await emp(request(app).delete('/api/whatsapp-qr/sessions/hai'));
    expect(remove.status).toBe(403);
    expect((await db.query('SELECT 1 FROM whatsapp_baileys_session_creds WHERE session_key = $1', [w2])).rowCount).toBe(1);
  });

  it('phiên ĐƯỢC giao: status qua cổng; gỡ phiên → hàng giao đi theo; chủ làm được trên mọi phiên', async () => {
    const { owner, employee, w1, ownerToken, employeeToken } = await setup();
    const status = await asEmployee(request(app).get('/api/whatsapp-qr/sessions/mot'), employeeToken, owner.id);
    expect(status.status).toBe(200);
    const ownerStatus = await asOwner(request(app).get('/api/whatsapp-qr/sessions/hai'), ownerToken);
    expect(ownerStatus.status).toBe(200);
    const remove = await asEmployee(request(app).delete('/api/whatsapp-qr/sessions/mot'), employeeToken, owner.id);
    expect(remove.status).toBe(200);
    expect((await db.query('SELECT 1 FROM whatsapp_baileys_session_creds WHERE session_key = $1', [w1])).rowCount).toBe(0);
    expect((await db.query(`SELECT 1 FROM member_channel_accounts WHERE employee_id = $1 AND channel = 'whatsapp_baileys'`, [employee.id])).rowCount).toBe(0);
  });
});

describe('WhatsApp Baileys — Studio (HTTP)', () => {
  it('GET whatsapp-accounts/chatbot: nhân viên chỉ thấy phiên Baileys được giao; chủ thấy cả hai', async () => {
    const { owner, w1, w2, ownerToken, employeeToken } = await setup();
    const emp = await asEmployee(request(app).get('/api/ai/chatbot/whatsapp-accounts/chatbot'), employeeToken, owner.id);
    expect(emp.status).toBe(200);
    expect(emp.body.data.filter((a) => a.provider === 'baileys').map((a) => a.session_key)).toEqual([w1]);
    const own = await asOwner(request(app).get('/api/ai/chatbot/whatsapp-accounts/chatbot'), ownerToken);
    expect(own.body.data.filter((a) => a.provider === 'baileys').map((a) => a.session_key).sort()).toEqual([w1, w2].sort());
  });

  it('toggle phiên chưa giao đang bật cho bot khác → 403 (KHÔNG phải 409), không lộ tên bot', async () => {
    const { owner, w2, employeeToken } = await setup();
    const bots = [];
    for (const name of ['Bot WA Bí Mật', 'Bot WA B']) {
      const { rows } = await db.query(`INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, $2, $3) RETURNING id`, [owner.id, name, `k_${Math.random()}`]);
      bots.push(Number(rows[0].id));
    }
    await db.query(
      `INSERT INTO chatbot_whatsapp_baileys_settings (id_user, session_key, id_chatbot, is_enabled) VALUES ($1, $2, $3, true)`,
      [owner.id, w2, bots[0]]
    );
    const emp = await asEmployee(
      request(app).post('/api/ai/chatbot/whatsapp-account/chatbot/toggle').send({ enabled: true, session_key: w2, id_chatbot: bots[1] }),
      employeeToken,
      owner.id
    );
    expect(emp.status).toBe(403);
    expect(emp.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    expect(JSON.stringify(emp.body)).not.toMatch(/Bí Mật/);
  });
});

describe('trình dựng + Gửi nhanh + cài đặt gửi theo tài khoản (HTTP)', () => {
  it('GET /campaigns/channels/telegram|whatsapp/accounts: nhân viên chỉ thấy tài khoản được giao; chủ thấy hết', async () => {
    const { owner, t1, t2, w1, w2, ownerToken, employeeToken } = await setup();
    const tgEmp = await asEmployee(request(app).get('/api/campaigns/channels/telegram/accounts'), employeeToken, owner.id);
    expect(tgEmp.status).toBe(200);
    expect(tgEmp.body.data.map((a) => a.id)).toEqual([t1]);
    const waEmp = await asEmployee(request(app).get('/api/campaigns/channels/whatsapp/accounts'), employeeToken, owner.id);
    expect(waEmp.body.data.map((a) => a.sessionKey)).toEqual([w1]);
    const tgOwn = await asOwner(request(app).get('/api/campaigns/channels/telegram/accounts'), ownerToken);
    expect(tgOwn.body.data.map((a) => a.id).sort((a, b) => a - b)).toEqual([t1, t2]);
    const waOwn = await asOwner(request(app).get('/api/campaigns/channels/whatsapp/accounts'), ownerToken);
    expect(waOwn.body.data.map((a) => a.sessionKey).sort()).toEqual([w1, w2].sort());
  });

  it('nhân viên 0 tài khoản được giao → danh sách RỖNG (không 403) cho cả hai kênh', async () => {
    const { owner, employee, employeeToken } = await setup();
    await db.query('DELETE FROM member_channel_accounts WHERE employee_id = $1', [employee.id]);
    const tg = await asEmployee(request(app).get('/api/campaigns/channels/telegram/accounts'), employeeToken, owner.id);
    const wa = await asEmployee(request(app).get('/api/campaigns/channels/whatsapp/accounts'), employeeToken, owner.id);
    expect([tg.status, tg.body.data]).toEqual([200, []]);
    expect([wa.status, wa.body.data]).toEqual([200, []]);
  });

  it('groups / conversations của tài khoản chưa giao → 403 + code, TRƯỚC khi chạm kênh; chủ không bị 403', async () => {
    const { owner, t2, w2, ownerToken, employeeToken } = await setup();
    const emp = (req) => asEmployee(req, employeeToken, owner.id);
    const calls = [
      emp(request(app).get(`/api/campaigns/channels/telegram/accounts/${t2}/groups`)),
      emp(request(app).get(`/api/campaigns/channels/whatsapp/accounts/${w2}/groups`)),
      emp(request(app).get(`/api/campaigns/channels/telegram/accounts/${t2}/conversations`)),
      emp(request(app).get(`/api/campaigns/channels/whatsapp/accounts/${w2}/conversations`)),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    }
    const ownerConv = await asOwner(request(app).get(`/api/campaigns/channels/telegram/accounts/${t2}/conversations`), ownerToken);
    expect(ownerConv.status).toBe(200);
  });

  it('conversations của tài khoản ĐƯỢC giao qua cổng (200)', async () => {
    const { owner, t1, employeeToken } = await setup();
    const res = await asEmployee(request(app).get(`/api/campaigns/channels/telegram/accounts/${t1}/conversations`), employeeToken, owner.id);
    expect(res.status).toBe(200);
  });

  it('send-settings GET / PATCH: tài khoản chưa giao → 403; được giao → 200; chủ → 200', async () => {
    const { owner, t1, t2, w1, w2, ownerToken, employeeToken } = await setup();
    const emp = (req) => asEmployee(req, employeeToken, owner.id);
    expect((await emp(request(app).get(`/api/campaigns/channels/telegram/accounts/${t2}/send-settings`))).status).toBe(403);
    expect((await emp(request(app).patch(`/api/campaigns/channels/telegram/accounts/${t2}/send-settings`).send({ userDailySendLimit: 50 }))).status).toBe(403);
    expect((await emp(request(app).get(`/api/campaigns/channels/whatsapp/accounts/${w2}/send-settings`))).status).toBe(403);
    expect((await emp(request(app).patch(`/api/campaigns/channels/whatsapp/accounts/${w2}/send-settings`).send({ sendSpeed: 'fast' }))).status).toBe(403);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM telegram_accounts WHERE id = $1', [t2]);
    expect(rows[0].user_daily_send_limit).toBeNull();

    expect((await emp(request(app).get(`/api/campaigns/channels/telegram/accounts/${t1}/send-settings`))).status).toBe(200);
    expect((await emp(request(app).patch(`/api/campaigns/channels/telegram/accounts/${t1}/send-settings`).send({ userDailySendLimit: 40 }))).status).toBe(200);
    expect((await emp(request(app).get(`/api/campaigns/channels/whatsapp/accounts/${w1}/send-settings`))).status).toBe(200);
    expect((await asOwner(request(app).get(`/api/campaigns/channels/telegram/accounts/${t2}/send-settings`), ownerToken)).status).toBe(200);
  });

  it('POST /campaigns/quick-send/telegram | whatsapp bằng tài khoản chưa giao → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED, không có tin nào được ghi', async () => {
    const { owner, t2, w2, employeeToken } = await setup();
    const tg = await asEmployee(request(app).post('/api/campaigns/quick-send/telegram').send({ accountId: t2, recipientKey: '123456', message: 'hello' }), employeeToken, owner.id);
    expect(tg.status).toBe(403);
    expect(tg.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    const wa = await asEmployee(request(app).post('/api/campaigns/quick-send/whatsapp').send({ sessionKey: w2, recipientKey: '84912345678', message: 'hello' }), employeeToken, owner.id);
    expect(wa.status).toBe(403);
    expect(wa.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    expect((await db.query('SELECT 1 FROM campaign_channel_messages')).rowCount).toBe(0);
  });
});

describe('lưu / sửa / nhân bản chiến dịch (HTTP)', () => {
  it('POST /campaigns node Telegram: tài khoản chưa giao → 403 + code, không có hàng chiến dịch; được giao → 201; chủ dùng tài khoản bất kỳ → 201', async () => {
    const { owner, t1, t2, ownerToken, employeeToken } = await setup();
    const denied = await asEmployee(request(app).post('/api/campaigns').send({
      campaignName: 'NV TG chưa giao', campaignType: 'telegram', nodes: telegramNodes(t2), connections: [],
    }), employeeToken, owner.id);
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ success: false, code: 'CHANNEL_ACCOUNT_NOT_ASSIGNED' });
    expect((await db.query(`SELECT id FROM campaigns WHERE campaign_name = 'NV TG chưa giao'`)).rowCount).toBe(0);
    // Câu báo lỗi không nêu tên tài khoản chưa giao.
    expect(JSON.stringify(denied.body)).not.toMatch(/TeleHai/);

    const ok = await asEmployee(request(app).post('/api/campaigns').send({
      campaignName: 'NV TG được giao', campaignType: 'telegram', nodes: telegramNodes(t1), connections: [],
    }), employeeToken, owner.id);
    expect(ok.status).toBe(201);
    const ownerRes = await asOwner(request(app).post('/api/campaigns').send({
      campaignName: 'Chủ TG hai', campaignType: 'telegram', nodes: telegramNodes(t2), connections: [],
    }), ownerToken);
    expect(ownerRes.status).toBe(201);
  });

  it('POST /campaigns node WhatsApp: phiên chưa giao → 403; được giao → 201', async () => {
    const { owner, w1, w2, employeeToken } = await setup();
    const denied = await asEmployee(request(app).post('/api/campaigns').send({
      campaignName: 'NV WA chưa giao', campaignType: 'whatsapp', nodes: whatsappNodes(w2), connections: [],
    }), employeeToken, owner.id);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    const ok = await asEmployee(request(app).post('/api/campaigns').send({
      campaignName: 'NV WA được giao', campaignType: 'whatsapp', nodes: whatsappNodes(w1), connections: [],
    }), employeeToken, owner.id);
    expect(ok.status).toBe(201);
  });

  it('PUT /campaigns/:id: nhân viên thay node bằng tài khoản chưa giao → 403 và node cũ còn nguyên', async () => {
    const { owner, employee, t1, t2, employeeToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id, createdBy: employee.id });
    await insertNode(campaignId, 'send_telegram', { telegramAccountId: t1 });
    const res = await asEmployee(request(app).put(`/api/campaigns/${campaignId}`).send({
      campaignName: 'Sửa', nodes: telegramNodes(t2), connections: [],
    }), employeeToken, owner.id);
    expect(res.status).toBe(403);
    const { rows } = await db.query('SELECT config FROM campaign_nodes WHERE id_campaign = $1', [campaignId]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].config.telegramAccountId)).toBe(t1);
  });

  it('POST /campaigns/:id/duplicate: nhân viên nhân bản chiến dịch có tài khoản chưa giao → 403, không có bản sao; chủ nhân bản được', async () => {
    const { owner, t2, ownerToken, employeeToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id, name: 'Gốc TG' });
    await insertNode(campaignId, 'send_telegram', { telegramAccountId: t2 });
    const denied = await asEmployee(request(app).post(`/api/campaigns/${campaignId}/duplicate`).send({ campaignName: 'Bản sao NV' }), employeeToken, owner.id);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    expect((await db.query(`SELECT id FROM campaigns WHERE campaign_name = 'Bản sao NV'`)).rowCount).toBe(0);
    const ok = await asOwner(request(app).post(`/api/campaigns/${campaignId}/duplicate`).send({ campaignName: 'Bản sao chủ' }), ownerToken);
    expect(ok.status).toBe(201);
  });
});

describe('chạy chiến dịch (HTTP) — preflight theo NGƯỜI BẤM CHẠY', () => {
  it('nhân viên bấm chạy chiến dịch của CHỦ dùng Telegram chưa giao → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED + câu nêu tên tài khoản và nhân viên, không có run, không gọi engine', async () => {
    const { owner, t2, employeeToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_telegram', { telegramAccountId: t2 });
    const res = await asEmployee(request(app).post(`/api/campaigns/${campaignId}/run`).send({ source: 'campaign_run' }), employeeToken, owner.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    expect(res.body.message).toMatch(/Tài khoản Telegram "TeleHai" chưa được giao cho nhân viên/);
    expect((await db.query('SELECT id FROM campaign_runs WHERE id_campaign = $1', [campaignId])).rowCount).toBe(0);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('WhatsApp chưa giao → 403 (kiểm "chưa được giao" TRƯỚC kiểm kết nối)', async () => {
    const { owner, w2, employeeToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id, type: 'whatsapp' });
    await insertNode(campaignId, 'send_whatsapp', { whatsappSessionKey: w2, recipientSource: 'whatsapp_conversations' });
    const res = await asEmployee(request(app).post(`/api/campaigns/${campaignId}/run`).send({ source: 'campaign_run' }), employeeToken, owner.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    expect(res.body.message).toMatch(/Tài khoản WhatsApp "hai" chưa được giao cho nhân viên/);
  });

  it('nhân viên bấm chạy khi tài khoản ĐÃ giao → qua cổng giao (có thể dừng ở kiểm kết nối, KHÔNG phải 403 chưa giao)', async () => {
    const { owner, t1, employeeToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_telegram', { telegramAccountId: t1, recipientSource: 'telegram_conversations' });
    const res = await asEmployee(request(app).post(`/api/campaigns/${campaignId}/run`).send({ source: 'campaign_run' }), employeeToken, owner.id);
    expect(res.body.code).not.toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
  });

  it('CHỦ bấm chạy chiến dịch do NHÂN VIÊN tạo (nhân viên đã bị gỡ tài khoản) → KHÔNG bị chặn chưa giao: chỉ kiểm theo người kích hoạt', async () => {
    const { owner, employee, t1, ownerToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id, createdBy: employee.id });
    await insertNode(campaignId, 'send_telegram', { telegramAccountId: t1, recipientSource: 'telegram_conversations' });
    await db.query('DELETE FROM member_channel_accounts WHERE employee_id = $1', [employee.id]);
    const res = await asOwner(request(app).post(`/api/campaigns/${campaignId}/run`).send({ source: 'campaign_run' }), ownerToken);
    expect(res.body.code).not.toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
  });

  it('bật lịch (POST /campaign-schedules): nhân viên + Telegram chưa giao → 403, không tạo lịch', async () => {
    const { owner, t2, employeeToken } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_telegram', { telegramAccountId: t2 });
    const res = await asEmployee(request(app).post('/api/campaign-schedules').send({
      campaignId, scheduleName: 'Lịch NV', scheduleType: 'daily', cronExpression: '0 9 * * *', enabled: true,
    }), employeeToken, owner.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    expect((await db.query('SELECT id FROM campaign_schedules WHERE id_campaign = $1', [campaignId])).rowCount).toBe(0);
  });
});

describe('engine chạy nền (CSDL thật) — dừng ngay đầu lượt, không gửi tin', () => {
  async function createRun({ campaignId, ownerId, triggeredBy = null, scheduleId = null, source = 'campaign_run' }) {
    const { rows } = await db.query(
      `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, id_schedule, run_type, status, started_at, run_metadata, triggered_by)
       VALUES ($1, $2, $3, $4, 'running', NOW(), $5::jsonb, $6) RETURNING id`,
      [campaignId, ownerId, scheduleId, scheduleId ? 'scheduled' : 'manual', JSON.stringify({ source, ...(triggeredBy ? { triggeredBy } : {}) }), triggeredBy]
    );
    return Number(rows[0].id);
  }

  it('nhân viên bấm chạy Telegram chưa giao → run failed kèm lý do nêu tên tài khoản + nhân viên, không có tin nào', async () => {
    const { owner, employee, t2 } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_telegram', { telegramAccountId: t2, recipientSource: 'telegram_conversations' });
    const runId = await createRun({ campaignId, ownerId: owner.id, triggeredBy: employee.id });

    await realExecuteCampaign(campaignId, runId, owner.id);

    const { rows } = await db.query('SELECT status, error_message FROM campaign_runs WHERE id = $1', [runId]);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error_message).toMatch(/Tài khoản Telegram "TeleHai" chưa được giao cho nhân viên "Test nv_h2_/);
    expect((await db.query('SELECT id FROM campaign_channel_messages')).rowCount).toBe(0);
  });

  it('WhatsApp chưa giao → run failed', async () => {
    const { owner, employee, w2 } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id, type: 'whatsapp' });
    await insertNode(campaignId, 'send_whatsapp', { whatsappSessionKey: w2, recipientSource: 'whatsapp_conversations' });
    const runId = await createRun({ campaignId, ownerId: owner.id, triggeredBy: employee.id });

    await realExecuteCampaign(campaignId, runId, owner.id);

    const { rows } = await db.query('SELECT status, error_message FROM campaign_runs WHERE id = $1', [runId]);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error_message).toMatch(/Tài khoản WhatsApp "hai" chưa được giao cho nhân viên/);
  });

  it('chủ GỠ giao sau khi lên lịch rồi lượt chạy lịch tới giờ → failed theo created_by của lịch (kiểm lúc CHẠY, không phải lúc lưu)', async () => {
    const { owner, employee, t1 } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id });
    await insertNode(campaignId, 'send_telegram', { telegramAccountId: t1, recipientSource: 'telegram_conversations' });
    const { rows: sched } = await db.query(
      `INSERT INTO campaign_schedules (id_campaign, schedule_name, schedule_type, cron_expression, enabled, workspace_owner_id, created_by)
       VALUES ($1, 'Lịch NV', 'daily', '0 9 * * *', TRUE, $2, $3) RETURNING id`,
      [campaignId, owner.id, employee.id]
    );
    await db.query('DELETE FROM member_channel_accounts WHERE employee_id = $1', [employee.id]); // chủ gỡ giao
    const runId = await createRun({ campaignId, ownerId: owner.id, scheduleId: Number(sched[0].id), source: 'schedule' });

    await realExecuteCampaign(campaignId, runId, owner.id, null, { isResume: true, resumedBy: 'per_minute' });

    const { rows } = await db.query('SELECT status, error_message FROM campaign_runs WHERE id = $1', [runId]);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].error_message).toMatch(/chưa được giao cho nhân viên/);
  });

  it('run cũ thiếu người kích hoạt → rơi về NGƯỜI TẠO chiến dịch, chưa được giao → failed', async () => {
    const { owner, employee, t2 } = await setup();
    const campaignId = await insertCampaign({ ownerId: owner.id, createdBy: employee.id });
    await insertNode(campaignId, 'send_telegram', { telegramAccountId: t2, recipientSource: 'telegram_conversations' });
    const runId = await createRun({ campaignId, ownerId: owner.id });

    await realExecuteCampaign(campaignId, runId, owner.id);

    const { rows } = await db.query('SELECT status, error_message FROM campaign_runs WHERE id = $1', [runId]);
    expect(rows[0].status).toBe('failed');
  });
});

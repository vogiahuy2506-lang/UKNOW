/**
 * W7a (PLAN_GUI_NHANH_TELEGRAM_2026-09-28 PR-1 + PLAN_WHATSAPP_DOT3_2026-09-29 W7a) — gửi nhanh kênh adapter.
 *
 * Telegram + WhatsApp, mỗi người một request: POST /api/campaigns/quick-send/:channel,
 * GET /api/campaigns/channels/:channel/accounts/:ref/conversations, GET /quick-send/estimate?channel=...
 * Nghiệm thu: cờ tắt 409; hội thoại chủ khác 404; gửi thành công ghi 1 dòng ccm is_preview + usage_logs +1
 * (không đếm đôi); lần 2 ngay sau -> deferred inter_message_delay; giờ nghỉ; trần giờ; FLOOD_WAIT; 400; {{ten}}.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';

process.env.BULLMQ_ENABLED = 'false';
process.env.TZ = 'UTC';

const isConfiguredMock = jest.fn(() => true);
const telegramSendMock = jest.fn();
jest.unstable_mockModule('../../src/services/chatbot/telegramGateway.client.js', () => ({
  default: { isConfigured: isConfiguredMock, sendMessage: telegramSendMock },
}));
const isStubOnlyMock = jest.fn(() => false);
jest.unstable_mockModule('../../src/services/chatbot/inProcChannelGateway/stubCheck.js', () => ({
  isStubOnly: isStubOnlyMock,
}));

const sessionsFake = new Map();
const persistedKeysFake = [];
const checkNumberExistsMock = jest.fn();
const whatsappSendMock = jest.fn();
const actualWhatsApp = await import('../../src/services/chatbot/whatsappBaileys.service.js');
jest.unstable_mockModule('../../src/services/chatbot/whatsappBaileys.service.js', () => ({
  ...actualWhatsApp,
  getSession: (key) => sessionsFake.get(key) ?? null,
  listPersistedSessions: async () => [...persistedKeysFake],
  checkNumberExists: checkNumberExistsMock,
  sendMessage: whatsappSendMock,
}));

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { createApp } = await import('../../src/app.js');
const { __recordSendForTest, __resetPerHourWindowForTest } =
  await import('../../src/services/campaign/campaignChannelRunner.service.js');
const { countAdapterSentInCycleUncached, _clearQuotaCache } = await import('../../src/utils/userSendLimit.util.js');

// P10 — hạn mức tin/tháng RIÊNG từng kênh (không còn cộng vào Zalo): đo bằng bộ đếm kênh adapter trên cửa sổ rộng.
const adapterSentCount = (channel) => countAdapterSentInCycleUncached(
  owner.id, channel, new Date(Date.now() - 24 * 3600 * 1000), new Date(Date.now() + 24 * 3600 * 1000)
);

let app;
let owner;
let token;
const ENV_KEYS = [
  'CAMPAIGN_CHANNEL_TELEGRAM_ENABLED', 'CAMPAIGN_CHANNEL_WHATSAPP_ENABLED',
  'TELEGRAM_OUTBOUND_INTER_MESSAGE_MIN_MS', 'TELEGRAM_OUTBOUND_INTER_MESSAGE_MAX_MS',
  'TELEGRAM_OUTBOUND_QUIET_HOURS_START', 'TELEGRAM_OUTBOUND_QUIET_HOURS_END', 'TELEGRAM_OUTBOUND_PER_HOUR_LIMIT',
  'WHATSAPP_OUTBOUND_INTER_MESSAGE_MIN_MS', 'WHATSAPP_OUTBOUND_INTER_MESSAGE_MAX_MS',
  'WHATSAPP_OUTBOUND_QUIET_HOURS_START', 'WHATSAPP_OUTBOUND_QUIET_HOURS_END', 'WHATSAPP_OUTBOUND_PER_HOUR_LIMIT',
  'SEND_QUOTA_RESERVATION_MODE',
];

function clearEnv() {
  ENV_KEYS.forEach((k) => delete process.env[k]);
}

/** Tắt khung giờ nghỉ (START=END) để test không phụ thuộc đồng hồ máy; nhịp mặc định GIỮ NGUYÊN. */
function disableQuietHours() {
  process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_START = '12';
  process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_END = '12';
  process.env.WHATSAPP_OUTBOUND_QUIET_HOURS_START = '12';
  process.env.WHATSAPP_OUTBOUND_QUIET_HOURS_END = '12';
}

beforeEach(async () => {
  await truncateAll();
  clearEnv();
  process.env.SEND_QUOTA_RESERVATION_MODE = 'off';
  disableQuietHours();
  isConfiguredMock.mockReset().mockReturnValue(true);
  isStubOnlyMock.mockReset().mockReturnValue(false);
  telegramSendMock.mockReset().mockResolvedValue({ data: { messageId: 'tg-msg-1' } });
  checkNumberExistsMock.mockReset().mockResolvedValue(true);
  whatsappSendMock.mockReset().mockResolvedValue({ key: { id: 'wa-msg-1' } });
  sessionsFake.clear();
  persistedKeysFake.length = 0;
  __resetPerHourWindowForTest();
  _clearQuotaCache();
  app = createApp();
  owner = await createUser({ username: `w7a_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` });
  token = await loginAs(owner);
});

afterEach(() => {
  clearEnv();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function insertTelegramAccount(userId, telegramUserId = '111') {
  const { rows } = await db.query(
    `INSERT INTO telegram_accounts (id_user, telegram_user_id, phone, first_name, is_active)
     VALUES ($1, $2, '+84900000000', 'Bot', true) RETURNING *`,
    [userId, telegramUserId]
  );
  // Phiên còn khoá đăng nhập — checkReadiness đọc getSessionString; test mock hasPermanentAuthKey qua repo bên dưới.
  return rows[0];
}

/** Đặt phiên Telegram "còn khoá" bằng cách giả lập repo (chỉ đọc CSDL, không dựng client). */
const chatbotTelegramRepository = (await import('../../src/repositories/chatbot/chatbotTelegram.repository.js')).default;
beforeEach(() => {
  jest.spyOn(chatbotTelegramRepository, 'getSessionString')
    .mockResolvedValue({ authKeys: { permanent: { dc2: 'fake-key' } } });
});
afterEach(() => {
  jest.restoreAllMocks();
});

async function insertTgConversation(userId, accountId, externalId, displayName, status = 'open') {
  await db.query(
    `INSERT INTO telegram_personal_conversations (id_user, id_telegram_account, external_id, display_name, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, accountId, externalId, displayName, status]
  );
}

function openWaSession(key, userName = 'Phúc') {
  sessionsFake.set(key, { sessionKey: key, status: 'open', userName });
  persistedKeysFake.push(key);
}

async function insertWaConversation({ userId, sessionKey, chatbotId = 1, phone, name = null, status = 'active' }) {
  const { rows } = await db.query(
    `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name, is_active, settings)
     VALUES ($1, 'whatsapp_baileys', $2, $2, true, '{}'::jsonb)
     ON CONFLICT DO NOTHING RETURNING id`,
    [userId, `${sessionKey}-${chatbotId}`]
  );
  const connectionId = rows[0]?.id
    ?? (await db.query(`SELECT id FROM channel_connections WHERE external_channel_id = $1`, [`${sessionKey}-${chatbotId}`])).rows[0].id;
  await db.query(
    `INSERT INTO channel_conversations (id_user, id_channel, channel, external_id, visitor_name, status)
     VALUES ($1, $2, 'whatsapp_baileys', $3, $4, $5)`,
    [userId, connectionId, `baileys:${sessionKey}:${chatbotId}:${phone}`, name, status]
  );
}

const post = (channel, body, { key, auth = token, headers = {} } = {}) => {
  const req = request(app)
    .post(`/api/campaigns/quick-send/${channel}`)
    .set('Authorization', `Bearer ${auth}`);
  if (key) req.set('Idempotency-Key', key);
  Object.entries(headers).forEach(([k, v]) => req.set(k, v));
  return req.send(body);
};

async function ccmRows(channel) {
  const { rows } = await db.query(
    `SELECT * FROM campaign_channel_messages WHERE channel = $1 ORDER BY id`,
    [channel]
  );
  return rows;
}

async function directUsage(source) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(delta), 0)::int AS total FROM usage_logs
     WHERE id_user = $1 AND resource_type = $3 AND metadata->>'source' = $2`,
    [owner.id, source, source.replace('_preview', '_direct_send')]
  );
  return rows[0].total;
}

describe('W7a — cờ kênh', () => {
  it('cờ tắt: gửi -> 409 CHANNEL_DISABLED; ước tính -> 409; kênh lạ -> 404; chưa đăng nhập -> 401', async () => {
    const account = await insertTelegramAccount(owner.id);
    const send = await post('telegram', { accountId: account.id, recipientKey: '123', message: 'hi' });
    expect(send.status).toBe(409);
    expect(send.body.code).toBe('CHANNEL_DISABLED');
    expect(telegramSendMock).not.toHaveBeenCalled();

    const est = await request(app)
      .get('/api/campaigns/quick-send/estimate?channel=whatsapp&recipients=5')
      .set('Authorization', `Bearer ${token}`);
    expect(est.status).toBe(409);

    const unknown = await post('facebook', { recipientKey: '1', message: 'hi' });
    expect(unknown.status).toBe(404);

    const anon = await request(app).post('/api/campaigns/quick-send/telegram').send({});
    expect(anon.status).toBe(401);
  });

  it('POST /quick-send/test-send vẫn tới đúng handler cũ (không bị :channel nuốt)', async () => {
    const res = await post('test-send', { channel: 'email', recipient: 'not-an-email' });
    // Handler CŨ trả 404 vì thiếu cấu hình email — khác 404 "kênh không hỗ trợ" của handler mới.
    expect(res.body.code).not.toBe('CHANNEL_UNSUPPORTED');
    expect(res.body.message).toMatch(/email/i);
  });
});

describe('W7a — Telegram', () => {
  beforeEach(() => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
  });

  it('ước tính: 50 người = 367,5s; 100 người = 742,5s', async () => {
    const r50 = await request(app)
      .get('/api/campaigns/quick-send/estimate?channel=telegram&recipients=50')
      .set('Authorization', `Bearer ${token}`);
    expect(r50.status).toBe(200);
    expect(r50.body.data.estimatedMs).toBe(367_500);
    const r100 = await request(app)
      .get('/api/campaigns/quick-send/estimate?channel=telegram&recipients=100')
      .set('Authorization', `Bearer ${token}`);
    expect(r100.body.data.estimatedMs).toBe(742_500);
  });

  describe('GET conversations', () => {
    it('chỉ trả { recipientKey, name } của hội thoại MỞ, chat id hợp lệ', async () => {
      const account = await insertTelegramAccount(owner.id);
      await insertTgConversation(owner.id, account.id, '1001', 'An');
      await insertTgConversation(owner.id, account.id, '-100777', 'Nhóm B');
      await insertTgConversation(owner.id, account.id, '1002', 'Đã đóng', 'closed');
      await insertTgConversation(owner.id, account.id, 'abc', 'Sai định dạng');

      const res = await request(app)
        .get(`/api/campaigns/channels/telegram/accounts/${account.id}/conversations`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const sorted = [...res.body.data].sort((a, b) => a.recipientKey.localeCompare(b.recipientKey));
      expect(sorted).toEqual([
        { recipientKey: '-100777', name: 'Nhóm B' },
        { recipientKey: '1001', name: 'An' },
      ]);
    });

    it('tài khoản của chủ khác -> 404', async () => {
      const other = await createUser({ username: `w7a_other_${Date.now()}` });
      const foreign = await insertTelegramAccount(other.id, '999');
      await insertTgConversation(other.id, foreign.id, '5005', 'Khách của người khác');
      const res = await request(app)
        .get(`/api/campaigns/channels/telegram/accounts/${foreign.id}/conversations`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('5005');
    });

    it('nhân viên có campaigns_create của chủ A -> thấy hội thoại của A', async () => {
      const employee = await createUser({ username: `w7a_emp_${Date.now()}` });
      await db.query(
        `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
        [owner.id, employee.id, JSON.stringify({ campaigns_create: true })]
      );
      const account = await insertTelegramAccount(owner.id);
      // PLAN_GIAO_TK_TG_WA H2 (10/10/2026): nhân viên chỉ thấy/dùng tài khoản Telegram/WhatsApp ĐƯỢC GIAO — giao tài khoản này để giữ ý định của ca.
      await db.query(
        `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source) VALUES ($1, $2, 'telegram', $3, 'assigned')`,
        [owner.id, employee.id, String(account.id)]
      );
      await insertTgConversation(owner.id, account.id, '2001', 'Khách A');
      const empToken = await loginAs(employee);
      const res = await request(app)
        .get(`/api/campaigns/channels/telegram/accounts/${account.id}/conversations`)
        .set('Authorization', `Bearer ${empToken}`)
        .set('X-Owner-Context', String(owner.id));
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ recipientKey: '2001', name: 'Khách A' }]);
    });
  });

  describe('POST quick-send/telegram', () => {
    it('gửi thành công: 1 dòng ccm is_preview/sent, usage_logs telegram_direct_send +1, hạn mức Telegram +1 (không +2), Zalo không đổi', async () => {
      const account = await insertTelegramAccount(owner.id);
      const before = await adapterSentCount('telegram');
      _clearQuotaCache();

      const res = await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'Xin chào' }, { key: 'k-tg-1' });
      expect(res.status).toBe(200);
      expect(res.body.data.item).toMatchObject({ recipientKey: '1001', status: 'success', messageId: 'tg-msg-1' });
      expect(telegramSendMock).toHaveBeenCalledTimes(1);
      expect(telegramSendMock).toHaveBeenCalledWith('111', 1001, 'Xin chào');

      const rows = await ccmRows('telegram');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        is_preview: true,
        channel: 'telegram',
        status: 'sent',
        recipient_key: '1001',
        account_key: String(account.id),
        id_campaign: null,
        id_run: null,
        id_node: null,
        provider_message_id: 'tg-msg-1',
      });
      expect(await directUsage('telegram_preview')).toBe(1);
      _clearQuotaCache();
      expect(await adapterSentCount('telegram')).toBe(before + 1);
      expect(await adapterSentCount('whatsapp')).toBe(0);
    });

    it('gửi lần 2 ngay sau, cùng tài khoản -> deferred inter_message_delay waitMs [5000,10000]; không dòng nhật ký / usage_logs mới', async () => {
      const account = await insertTelegramAccount(owner.id);
      await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'A' }, { key: 'k-a' });
      const res = await post('telegram', { accountId: account.id, recipientKey: '1002', message: 'B' }, { key: 'k-b' });
      expect(res.status).toBe(200);
      const item = res.body.data.item;
      expect(item.status).toBe('deferred');
      expect(item.reason).toBe('inter_message_delay');
      expect(item.retryAfterMs).toBeGreaterThan(4000);
      expect(item.retryAfterMs).toBeLessThanOrEqual(10000);
      expect(item.resumeAt).toBeGreaterThan(Date.now());
      expect(telegramSendMock).toHaveBeenCalledTimes(1);
      expect(await ccmRows('telegram')).toHaveLength(1);
      expect(await directUsage('telegram_preview')).toBe(1);
    });

    it('hai request ĐỒNG THỜI cùng tài khoản (hai tab) -> chỉ MỘT gửi, một bị hoãn (lần thử ghi TRƯỚC khi gửi)', async () => {
      const account = await insertTelegramAccount(owner.id);
      telegramSendMock.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: { messageId: 'slow' } }), 150))
      );
      const [a, b] = await Promise.all([
        post('telegram', { accountId: account.id, recipientKey: '1001', message: 'A' }, { key: 'k-par-a' }),
        post('telegram', { accountId: account.id, recipientKey: '1002', message: 'B' }, { key: 'k-par-b' }),
      ]);
      const statuses = [a.body.data.item.status, b.body.data.item.status].sort();
      expect(statuses).toEqual(['deferred', 'success']);
      expect(telegramSendMock).toHaveBeenCalledTimes(1);
      expect(await ccmRows('telegram')).toHaveLength(1);
    });

    it('trong giờ nghỉ -> deferred quiet_hours, không giữ chỗ/ghi gì', async () => {
      const account = await insertTelegramAccount(owner.id);
      const hourVn = (new Date().getUTCHours() + 7) % 24;
      process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_START = String(hourVn);
      process.env.TELEGRAM_OUTBOUND_QUIET_HOURS_END = String((hourVn + 1) % 24);
      const res = await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'A' });
      expect(res.status).toBe(200);
      expect(res.body.data.item.status).toBe('deferred');
      expect(res.body.data.item.reason).toBe('quiet_hours');
      expect(res.body.data.item.retryAfterMs).toBeGreaterThan(0);
      expect(res.body.data.item.retryAfterMs).toBeLessThanOrEqual(3_600_000);
      expect(telegramSendMock).not.toHaveBeenCalled();
      expect(await ccmRows('telegram')).toHaveLength(0);
      expect(await directUsage('telegram_preview')).toBe(0);
    });

    it('100 dấu thời gian trong giờ qua (lượt chạy chiến dịch giả lập) -> deferred rate_limited', async () => {
      const account = await insertTelegramAccount(owner.id);
      for (let i = 0; i < 100; i += 1) {
        __recordSendForTest(`telegram::${account.id}`, Date.now() - 20 * 60 * 1000 - i);
      }
      const res = await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'A' });
      expect(res.body.data.item.status).toBe('deferred');
      expect(res.body.data.item.reason).toBe('rate_limited');
      expect(telegramSendMock).not.toHaveBeenCalled();
      expect(await ccmRows('telegram')).toHaveLength(0);
    });

    it('gateway ném FLOOD_WAIT_1800 -> deferred provider_rate_limit retryAfterMs 1.800.000; ccm failed/rate_limit; không usage', async () => {
      const account = await insertTelegramAccount(owner.id);
      telegramSendMock.mockRejectedValue(new Error(
        'sendMessage: MtProtoTelegramClient.sendMessage failed: Telegram API error 420: FLOOD_WAIT_1800'
      ));
      const res = await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'A' });
      expect(res.status).toBe(200);
      expect(res.body.data.item).toMatchObject({
        status: 'deferred',
        reason: 'provider_rate_limit',
        retryAfterMs: 1_800_000,
      });
      const rows = await ccmRows('telegram');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'failed', error_category: 'rate_limit', is_preview: true });
      expect(await directUsage('telegram_preview')).toBe(0);
    });

    it('lỗi hết phiên (AUTH_KEY_UNREGISTERED) -> failed errorCategory auth, dòng ccm failed', async () => {
      const account = await insertTelegramAccount(owner.id);
      telegramSendMock.mockRejectedValue(new Error('MtProtoTelegramClient.sendMessage failed: AUTH_KEY_UNREGISTERED'));
      const res = await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'A' });
      expect(res.body.data.item).toMatchObject({ status: 'failed', errorCategory: 'auth' });
      expect((await ccmRows('telegram'))[0].status).toBe('failed');
      expect(await directUsage('telegram_preview')).toBe(0);
    });

    it.each([
      [{ recipientKey: 'abc', message: 'hi' }],
      [{ recipientKey: '12;34', message: 'hi' }],
      [{ recipientKey: '123', message: '   ' }],
      [{ recipientKey: '123', message: 'x'.repeat(4001) }],
    ])('dữ liệu sai %j -> 400, không gọi gateway', async (body) => {
      const account = await insertTelegramAccount(owner.id);
      const res = await post('telegram', { accountId: account.id, ...body });
      expect(res.status).toBe(400);
      expect(telegramSendMock).not.toHaveBeenCalled();
      expect(await ccmRows('telegram')).toHaveLength(0);
    });

    it('tài khoản của chủ khác -> 409 TELEGRAM_ACCOUNT_NOT_READY, KHÔNG gửi', async () => {
      const other = await createUser({ username: `w7a_other2_${Date.now()}` });
      const foreign = await insertTelegramAccount(other.id, '998');
      const res = await post('telegram', { accountId: foreign.id, recipientKey: '1001', message: 'A' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TELEGRAM_ACCOUNT_NOT_READY');
      expect(telegramSendMock).not.toHaveBeenCalled();
    });

    it('transport stub -> 409 TELEGRAM_STUB_TRANSPORT (giữ mã của adapter)', async () => {
      const account = await insertTelegramAccount(owner.id);
      isStubOnlyMock.mockReturnValue(true);
      const res = await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'A' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('TELEGRAM_STUB_TRANSPORT');
    });

    it('{{ten}}: chat id có trong hội thoại mở -> thay bằng tên; chat id nhập tay -> rỗng, KHÔNG còn chữ {{ten}}', async () => {
      const account = await insertTelegramAccount(owner.id);
      await insertTgConversation(owner.id, account.id, '1001', 'Lan');
      await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'Chào {{ten}}!' }, { key: 'k-1' });
      expect(telegramSendMock).toHaveBeenLastCalledWith('111', 1001, 'Chào Lan!');

      __resetPerHourWindowForTest();
      await post('telegram', { accountId: account.id, recipientKey: '9999', message: 'Chào {{ten}}!' }, { key: 'k-2' });
      const lastText = telegramSendMock.mock.calls.at(-1)[2];
      expect(lastText).not.toContain('{{');
      expect(lastText).not.toContain('ten}}');
    });

    it('tên khách chứa cú pháp {{...}} (dữ liệu do khách điền) -> bị trung hoà, tin gửi đi không còn "{{"', async () => {
      const account = await insertTelegramAccount(owner.id);
      await insertTgConversation(owner.id, account.id, '1001', '{{ten}}');
      await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'Chào {{ten}}!' }, { key: 'k-evil' });
      expect(telegramSendMock).toHaveBeenLastCalledWith('111', 1001, 'Chào bạn!');
    });

    it('chế độ enforce: có quota_reservation_id, reservation consumed, hạn mức +1; gửi lại cùng Idempotency-Key -> success isReplay, không gửi lần hai', async () => {
      process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';
      const account = await insertTelegramAccount(owner.id);
      const first = await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'A' }, { key: 'k-enf' });
      expect(first.body.data.item.status).toBe('success');
      const rows = await ccmRows('telegram');
      expect(rows).toHaveLength(1);
      expect(rows[0].quota_reservation_id).not.toBeNull();
      const { rows: resv } = await db.query(
        `SELECT status, source_type FROM send_quota_reservations WHERE id = $1`, [rows[0].quota_reservation_id]
      );
      expect(resv[0]).toMatchObject({ status: 'consumed', source_type: 'telegram_preview' });
      // Chế độ enforce tính hạn mức qua sổ giữ chỗ (đã consumed ở trên), KHÔNG qua usage_logs -> không đếm đôi.
      expect(await directUsage('telegram_preview')).toBe(0);

      __resetPerHourWindowForTest();
      const replay = await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'A' }, { key: 'k-enf' });
      expect(replay.body.data.item).toMatchObject({ status: 'success', isReplay: true });
      expect(telegramSendMock).toHaveBeenCalledTimes(1);
    });

    it('chế độ enforce, gửi lỗi: giữ chỗ được NHẢ (released), hạn mức không đổi', async () => {
      process.env.SEND_QUOTA_RESERVATION_MODE = 'enforce';
      const account = await insertTelegramAccount(owner.id);
      telegramSendMock.mockRejectedValue(new Error('MtProtoTelegramClient.sendMessage failed: PEER_ID_INVALID'));
      _clearQuotaCache();
      const before = await adapterSentCount('telegram');
      const res = await post('telegram', { accountId: account.id, recipientKey: '1001', message: 'A' }, { key: 'k-enf2' });
      expect(res.body.data.item).toMatchObject({ status: 'failed', errorCategory: 'hard' });
      const { rows: resv } = await db.query(`SELECT status FROM send_quota_reservations WHERE user_id = $1`, [owner.id]).catch(() => ({ rows: [] }));
      if (resv.length > 0) expect(resv.every((r) => r.status !== 'consumed')).toBe(true);
      _clearQuotaCache();
      expect(await adapterSentCount('telegram')).toBe(before);
    });
  });
});

describe('W7a — WhatsApp', () => {
  let sessionKey;
  beforeEach(() => {
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    sessionKey = `${owner.id}-default`;
  });

  it('ước tính: 50 người = 686s', async () => {
    const res = await request(app)
      .get('/api/campaigns/quick-send/estimate?channel=whatsapp&recipients=50')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.estimatedMs).toBe(686_000);
  });

  describe('GET conversations', () => {
    it('khử trùng theo SĐT (2 chatbot cùng khách), bỏ hội thoại closed, chỉ { recipientKey, name }', async () => {
      openWaSession(sessionKey);
      await insertWaConversation({ userId: owner.id, sessionKey, chatbotId: 1, phone: '84912345678', name: 'Lan' });
      await insertWaConversation({ userId: owner.id, sessionKey, chatbotId: 2, phone: '84912345678', name: 'Lan' });
      await insertWaConversation({ userId: owner.id, sessionKey, chatbotId: 1, phone: '84913456789', name: 'Minh' });
      await insertWaConversation({ userId: owner.id, sessionKey, chatbotId: 1, phone: '84914567890', status: 'closed' });
      const res = await request(app)
        .get(`/api/campaigns/channels/whatsapp/accounts/${sessionKey}/conversations`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const sorted = [...res.body.data].sort((a, b) => a.recipientKey.localeCompare(b.recipientKey));
      expect(sorted).toEqual([
        { recipientKey: '84912345678', name: 'Lan' },
        { recipientKey: '84913456789', name: 'Minh' },
      ]);
    });

    it('sessionKey của chủ khác -> 404', async () => {
      const other = await createUser({ username: `w7a_other3_${Date.now()}` });
      const res = await request(app)
        .get(`/api/campaigns/channels/whatsapp/accounts/${other.id}-default/conversations`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST quick-send/whatsapp', () => {
    it('gửi thành công (SĐT nhập 0912 345 678 -> 84912345678): ccm is_preview/sent channel whatsapp, usage_logs +1', async () => {
      openWaSession(sessionKey);
      const before = await adapterSentCount('whatsapp');
      _clearQuotaCache();
      const res = await post('whatsapp', { sessionKey, recipientKey: '0912 345 678', message: 'Xin chào' }, { key: 'k-wa-1' });
      expect(res.status).toBe(200);
      expect(res.body.data.item).toMatchObject({ recipientKey: '84912345678', status: 'success', messageId: 'wa-msg-1' });
      expect(checkNumberExistsMock).toHaveBeenCalledWith(sessionKey, '84912345678');
      expect(whatsappSendMock).toHaveBeenCalledWith(sessionKey, '84912345678', 'Xin chào');
      const rows = await ccmRows('whatsapp');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        is_preview: true, channel: 'whatsapp', status: 'sent', recipient_key: '84912345678',
        account_key: sessionKey, id_campaign: null, provider_message_id: 'wa-msg-1',
      });
      expect(await directUsage('whatsapp_preview')).toBe(1);
      _clearQuotaCache();
      expect(await adapterSentCount('whatsapp')).toBe(before + 1);
    });

    it('lần 2 ngay sau -> deferred inter_message_delay waitMs [8000,20000]', async () => {
      openWaSession(sessionKey);
      await post('whatsapp', { sessionKey, recipientKey: '0912345678', message: 'A' }, { key: 'k-a' });
      const res = await post('whatsapp', { sessionKey, recipientKey: '0913456789', message: 'B' }, { key: 'k-b' });
      const item = res.body.data.item;
      expect(item.status).toBe('deferred');
      expect(item.reason).toBe('inter_message_delay');
      expect(item.retryAfterMs).toBeGreaterThan(7000);
      expect(item.retryAfterMs).toBeLessThanOrEqual(20000);
      expect(whatsappSendMock).toHaveBeenCalledTimes(1);
      expect(await ccmRows('whatsapp')).toHaveLength(1);
    });

    it('trần giờ WhatsApp 60: 60 dấu thời gian -> rate_limited', async () => {
      openWaSession(sessionKey);
      for (let i = 0; i < 60; i += 1) __recordSendForTest(`whatsapp::${sessionKey}`, Date.now() - 20 * 60 * 1000 - i);
      const res = await post('whatsapp', { sessionKey, recipientKey: '0912345678', message: 'A' });
      expect(res.body.data.item).toMatchObject({ status: 'deferred', reason: 'rate_limited' });
    });

    it('số không dùng WhatsApp -> failed hard, KHÔNG gọi sendMessage, ccm failed, không usage', async () => {
      openWaSession(sessionKey);
      checkNumberExistsMock.mockResolvedValue(false);
      const res = await post('whatsapp', { sessionKey, recipientKey: '0912345678', message: 'A' });
      expect(res.body.data.item).toMatchObject({ status: 'failed', errorCategory: 'hard' });
      expect(whatsappSendMock).not.toHaveBeenCalled();
      expect((await ccmRows('whatsapp'))[0].status).toBe('failed');
      expect(await directUsage('whatsapp_preview')).toBe(0);
    });

    it('phiên không mở -> 409 WHATSAPP_ACCOUNT_NOT_READY; phiên của chủ khác -> 409, không gửi', async () => {
      const notOpen = await post('whatsapp', { sessionKey, recipientKey: '0912345678', message: 'A' });
      expect(notOpen.status).toBe(409);
      expect(notOpen.body.code).toBe('WHATSAPP_ACCOUNT_NOT_READY');
      const other = await createUser({ username: `w7a_other4_${Date.now()}` });
      openWaSession(`${other.id}-default`);
      const foreign = await post('whatsapp', { sessionKey: `${other.id}-default`, recipientKey: '0912345678', message: 'A' });
      expect(foreign.status).toBe(409);
      expect(whatsappSendMock).not.toHaveBeenCalled();
    });

    it.each([
      [{ recipientKey: '1234567', message: 'hi' }],
      [{ recipientKey: 'abc', message: 'hi' }],
      [{ recipientKey: '0912345678', message: ' ' }],
    ])('dữ liệu sai %j -> 400', async (body) => {
      openWaSession(sessionKey);
      const res = await post('whatsapp', { sessionKey, ...body });
      expect(res.status).toBe(400);
      expect(whatsappSendMock).not.toHaveBeenCalled();
    });

    it('{{ten}} lấy tên khách từ hội thoại mở khớp SĐT', async () => {
      openWaSession(sessionKey);
      await insertWaConversation({ userId: owner.id, sessionKey, phone: '84912345678', name: 'Lan' });
      await post('whatsapp', { sessionKey, recipientKey: '0912345678', message: 'Chào {{ten}}!' }, { key: 'k-ten' });
      expect(whatsappSendMock).toHaveBeenLastCalledWith(sessionKey, '84912345678', 'Chào Lan!');
    });

    it('WhatsApp và Telegram có cửa sổ nhịp RIÊNG (gửi WA không làm TG bị hoãn)', async () => {
      process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
      openWaSession(sessionKey);
      const tg = await insertTelegramAccount(owner.id);
      await post('whatsapp', { sessionKey, recipientKey: '0912345678', message: 'A' }, { key: 'k-w' });
      const res = await post('telegram', { accountId: tg.id, recipientKey: '1001', message: 'B' }, { key: 'k-t' });
      expect(res.body.data.item.status).toBe('success');
    });
  });
});

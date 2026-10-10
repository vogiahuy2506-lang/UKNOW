/**
 * PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4a — Adapter WhatsApp cho chiến dịch (sau cờ, TẮT mặc định).
 *
 * a) cờ tắt: preflight node send_whatsapp -> 400 UNSUPPORTED_SEND_NODE; getAdapterChannelKeysByQuotaChannel('whatsapp')
 *    vẫn có 'whatsapp' (cờ chỉ chặn GỬI, không chặn ĐẾM; P10: hạn mức riêng, Zalo không nhận); campaign_type='whatsapp' được CHECK chấp nhận.
 * b) cờ bật: phiên không mở / khác chủ / 0 hội thoại -> preflight 400 đúng mã.
 * c) nguồn whatsapp_conversations: 2 chatbot cùng 1 khách + 2 khách khác + 1 hội thoại closed + 1 của phiên khác ->
 *    đúng 3 lần sendMessage; 3 dòng ccm sent (channel='whatsapp'); hạn mức whatsapp +3.
 * d) exists=false ở người 2 -> người 2 failed (hard), người 3 vẫn gửi, run completed.
 * e) sendMessage ném "is not connected" -> run failed CHANNEL_AUTH (không đốt danh sách).
 * f) GET /api/campaigns/channels(/whatsapp/accounts): cờ bật liệt kê whatsapp; chỉ phiên của chủ; 401/403.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';

process.env.BULLMQ_ENABLED = 'false';
process.env.TZ = 'UTC';

const sessionsFake = new Map();
const persistedKeysFake = [];
const checkNumberExistsMock = jest.fn();
const sendMessageMock = jest.fn();

const actualWhatsApp = await import('../../src/services/chatbot/whatsappBaileys.service.js');
jest.unstable_mockModule('../../src/services/chatbot/whatsappBaileys.service.js', () => ({
  ...actualWhatsApp,
  getSession: (key) => sessionsFake.get(key) ?? null,
  listPersistedSessions: async () => [...persistedKeysFake],
  checkNumberExists: checkNumberExistsMock,
  sendMessage: sendMessageMock,
}));

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { createApp } = await import('../../src/app.js');
const campaignRunService = (await import('../../src/services/campaign/campaignRun.service.js')).default;
const { validateCampaignPreflight } = await import('../../src/services/campaign/campaignPreflight.service.js');
const campaignChannelRegistry = (await import('../../src/services/campaign/campaignChannelRegistry.service.js')).default;
const { countAdapterSentInCycleUncached, _clearQuotaCache } = await import('../../src/utils/userSendLimit.util.js');

// P10 — tin whatsapp có hạn mức tin/tháng RIÊNG (không còn cộng vào Zalo): đo bằng bộ đếm kênh adapter trên cửa sổ rộng.
const adapterSentCount = () => countAdapterSentInCycleUncached(
  owner.id, 'whatsapp', new Date(Date.now() - 24 * 3600 * 1000), new Date(Date.now() + 24 * 3600 * 1000)
);

const SUBTYPE = 'send_whatsapp';
let owner;
let app;

beforeEach(async () => {
  await truncateAll();
  owner = await createUser({
    email: `w4a_owner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
  });
  app = createApp();
  sessionsFake.clear();
  persistedKeysFake.length = 0;
  checkNumberExistsMock.mockReset().mockResolvedValue(true);
  sendMessageMock.mockReset();
  // Trung hoà nhịp gửi/giờ yên lặng mặc định (23-6 VN) để test xác định, không phụ thuộc đồng hồ máy.
  process.env.WHATSAPP_OUTBOUND_INTER_MESSAGE_MIN_MS = '1';
  process.env.WHATSAPP_OUTBOUND_INTER_MESSAGE_MAX_MS = '1';
  process.env.WHATSAPP_OUTBOUND_QUIET_HOURS_START = '12';
  process.env.WHATSAPP_OUTBOUND_QUIET_HOURS_END = '12';
  delete process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
  _clearQuotaCache();
});

afterEach(async () => {
  delete process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED;
  delete process.env.WHATSAPP_OUTBOUND_INTER_MESSAGE_MIN_MS;
  delete process.env.WHATSAPP_OUTBOUND_INTER_MESSAGE_MAX_MS;
  delete process.env.WHATSAPP_OUTBOUND_QUIET_HOURS_START;
  delete process.env.WHATSAPP_OUTBOUND_QUIET_HOURS_END;
  campaignRunService.activeRunIds.clear();
  campaignRunService.continuousRunIds.clear();
});

function openSession(key, userName = 'Phúc') {
  sessionsFake.set(key, { sessionKey: key, status: 'open', userName, userId: '84900000000:1@s.whatsapp.net' });
  persistedKeysFake.push(key);
}

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function insertCampaign() {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, 'W4a whatsapp test', 'whatsapp', 'active') RETURNING id`,
    [owner.id]
  );
  return rows[0].id;
}

async function insertNode({ campaignId, config }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, config, execution_order)
     VALUES ($1, 'action', $2, $2, $3::jsonb, 1) RETURNING id`,
    [campaignId, SUBTYPE, JSON.stringify(config)]
  );
  return rows[0].id;
}

async function insertRun({ campaignId }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, run_metadata)
     VALUES ($1, $2, 'manual', 'running', '{}'::jsonb) RETURNING *`,
    [campaignId, owner.id]
  );
  return rows[0];
}

async function getRunRow(runId) {
  const { rows } = await db.query('SELECT * FROM campaign_runs WHERE id = $1', [runId]);
  return rows[0];
}

async function insertConnection(userId, sessionKey) {
  const { rows } = await db.query(
    `INSERT INTO channel_connections (id_user, channel, external_channel_id, display_name, is_active, settings)
     VALUES ($1, 'whatsapp_baileys', $2, $2, true, '{}'::jsonb) RETURNING id`,
    [userId, sessionKey]
  );
  return rows[0].id;
}

async function insertConversation({ userId, connectionId, sessionKey, chatbotId, phone, name = null, status = 'active' }) {
  await db.query(
    `INSERT INTO channel_conversations (id_user, id_channel, channel, external_id, visitor_name, status)
     VALUES ($1, $2, 'whatsapp_baileys', $3, $4, $5)`,
    [userId, connectionId, `baileys:${sessionKey}:${chatbotId}:${phone}`, name, status]
  );
}

describe('W4a — Adapter WhatsApp cho chiến dịch (sau cờ, TẮT mặc định)', () => {
  it('(a) cờ tắt: UNSUPPORTED_SEND_NODE; đếm quota kênh whatsapp vẫn có whatsapp; campaign_type whatsapp hợp lệ', async () => {
    const campaignId = await insertCampaign();
    await insertNode({
      campaignId,
      config: { whatsappSessionKey: `${owner.id}-default`, recipientSource: 'manual', recipientKeys: '0912345678', steps: [{ message: 'B1' }] },
    });
    await expect(
      validateCampaignPreflight({ campaignId, workspaceOwnerId: owner.id })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_SEND_NODE', statusCode: 400 });
    expect(campaignChannelRegistry.getAdapterChannelKeysByQuotaChannel('whatsapp')).toContain('whatsapp');
    expect(campaignChannelRegistry.getAdapterChannelKeysByQuotaChannel('zalo')).toEqual([]);
  });

  it('(b) cờ bật: phiên không mở / phiên của chủ khác / 0 hội thoại -> preflight 400 đúng mã', async () => {
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    const key = `${owner.id}-default`;
    const campaignId = await insertCampaign();
    const nodeId = await insertNode({
      campaignId,
      config: { whatsappSessionKey: key, recipientSource: 'whatsapp_conversations', steps: [{ message: 'B1' }] },
    });

    // 1) không có phiên
    await expect(
      validateCampaignPreflight({ campaignId, workspaceOwnerId: owner.id })
    ).rejects.toMatchObject({ code: 'WHATSAPP_ACCOUNT_NOT_READY', statusCode: 400 });

    // 2) phiên đang connecting
    sessionsFake.set(key, { sessionKey: key, status: 'connecting', userName: 'Phúc' });
    await expect(
      validateCampaignPreflight({ campaignId, workspaceOwnerId: owner.id })
    ).rejects.toMatchObject({ code: 'WHATSAPP_ACCOUNT_NOT_READY', statusCode: 400 });

    // 3) phiên mở nhưng chưa có hội thoại
    openSession(key);
    await expect(
      validateCampaignPreflight({ campaignId, workspaceOwnerId: owner.id })
    ).rejects.toMatchObject({ code: 'WHATSAPP_NO_RECIPIENTS', statusCode: 400 });

    // 4) khoá phiên của chủ khác (cùng phiên đang mở) -> coi như không sẵn sàng
    const other = await createUser({ email: `w4a_other_${Date.now()}@example.com` });
    const foreignKey = `${other.id}-default`;
    openSession(foreignKey);
    await db.query('UPDATE campaign_nodes SET config = $2::jsonb WHERE id = $1', [
      nodeId,
      JSON.stringify({ whatsappSessionKey: foreignKey, recipientSource: 'manual', recipientKeys: '0912345678', steps: [{ message: 'B1' }] }),
    ]);
    await expect(
      validateCampaignPreflight({ campaignId, workspaceOwnerId: owner.id })
    ).rejects.toMatchObject({ code: 'WHATSAPP_ACCOUNT_NOT_READY', statusCode: 400 });
  });

  it('(c) nguồn hội thoại: 3 khách (1 khách ở 2 chatbot) + 1 closed + 1 phiên khác -> đúng 3 lần sendMessage; 3 ccm sent; hạn mức whatsapp +3', async () => {
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    const key = `${owner.id}-default`;
    openSession(key);
    const otherKey = `${owner.id}-second`;
    const connId = await insertConnection(owner.id, key);
    const otherConnId = await insertConnection(owner.id, otherKey);
    const base = { userId: owner.id, connectionId: connId, sessionKey: key };
    await insertConversation({ ...base, chatbotId: 59, phone: '84911111111', name: 'Lan' });
    await insertConversation({ ...base, chatbotId: 72, phone: '84911111111', name: 'Lan' });
    await insertConversation({ ...base, chatbotId: 59, phone: '84922222222' });
    await insertConversation({ ...base, chatbotId: 59, phone: '84933333333' });
    await insertConversation({ ...base, chatbotId: 59, phone: '84944444444', status: 'closed' });
    await insertConversation({ userId: owner.id, connectionId: otherConnId, sessionKey: otherKey, chatbotId: 59, phone: '84955555555' });

    sendMessageMock.mockImplementation(async (_key, phone) => ({ key: { id: `wa_${phone}` } }));

    const campaignId = await insertCampaign();
    const nodeId = await insertNode({
      campaignId,
      config: { whatsappSessionKey: key, recipientSource: 'whatsapp_conversations', steps: [{ message: 'Xin chào từ chiến dịch' }] },
    });
    await validateCampaignPreflight({ campaignId, workspaceOwnerId: owner.id });
    const run = await insertRun({ campaignId });

    const before = await adapterSentCount();
    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);
    _clearQuotaCache();
    const after = await adapterSentCount();

    expect(sendMessageMock).toHaveBeenCalledTimes(3);
    const phones = sendMessageMock.mock.calls.map(([, phone]) => phone).sort();
    expect(phones).toEqual(['84911111111', '84922222222', '84933333333']);
    for (const [sessionKey, , text] of sendMessageMock.mock.calls) {
      expect(sessionKey).toBe(key);
      expect(text).toBe('Xin chào từ chiến dịch');
    }
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM campaign_channel_messages
       WHERE id_node = $1 AND channel = 'whatsapp' AND status = 'sent'`,
      [nodeId]
    );
    expect(rows[0].n).toBe(3);
    expect(after - before).toBe(3);
    expect((await getRunRow(run.id)).status).toBe('completed');
  });

  it('(d) số không dùng WhatsApp ở người 2 -> người 2 failed (hard), người 3 vẫn gửi, run completed', async () => {
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    const key = `${owner.id}-default`;
    openSession(key);
    checkNumberExistsMock.mockImplementation(async (_key, phone) => phone !== '84922222222');
    sendMessageMock.mockImplementation(async (_key, phone) => ({ key: { id: `wa_${phone}` } }));

    const campaignId = await insertCampaign();
    const nodeId = await insertNode({
      campaignId,
      config: {
        whatsappSessionKey: key,
        recipientSource: 'manual',
        recipientKeys: '0911111111, 0922222222\n84933333333, abc',
        steps: [{ message: 'B1' }],
      },
    });
    const run = await insertRun({ campaignId });

    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    const runRow = await getRunRow(run.id);
    expect(runRow.status).toBe('completed');
    expect(runRow.successful_sends).toBe(2);
    expect(runRow.failed_sends).toBe(1);
    expect(sendMessageMock.mock.calls.map(([, phone]) => phone)).toEqual(['84911111111', '84933333333']);
    const { rows: ledgerRows } = await db.query(
      `SELECT is_fully_completed, meta FROM campaign_run_recipient_steps
       WHERE id_run = $1 AND id_node = $2 AND recipient_key = '84922222222'`,
      [run.id, String(nodeId)]
    );
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].is_fully_completed).toBe(true);
    expect(ledgerRows[0].meta.lastFailureReason).toBe('hard');
  });

  it('(e) mất kết nối giữa chừng ("is not connected") -> run failed + chiến dịch TẠM DỪNG (P2), không đốt danh sách', async () => {
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    const key = `${owner.id}-default`;
    openSession(key);
    sendMessageMock.mockImplementation(async () => {
      throw new Error(`WhatsApp session ${key} is not connected`);
    });

    const campaignId = await insertCampaign();
    await insertNode({
      campaignId,
      config: { whatsappSessionKey: key, recipientSource: 'manual', recipientKeys: '0911111111,0922222222', steps: [{ message: 'B1' }] },
    });
    const run = await insertRun({ campaignId });

    await campaignRunService.executeCampaign(campaignId, run.id, owner.id);

    const runRow = await getRunRow(run.id);
    expect(runRow.status).toBe('failed');
    expect(String(runRow.error_message || '')).toContain('is not connected');
    // P2 — mất phiên tài khoản gửi: chiến dịch bị tạm dừng (không còn 'active' để lịch chạy lại vô ích).
    expect(String(runRow.error_message || '')).toContain('Tài khoản WhatsApp đã mất phiên đăng nhập');
    const { rows: campaignRows } = await db.query('SELECT status FROM campaigns WHERE id = $1', [campaignId]);
    expect(campaignRows[0].status).toBe('paused');
    expect(runRow.failed_sends).toBe(0);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });
});

describe('W4a — loại chiến dịch whatsapp', () => {
  it("POST /api/campaigns campaignType 'whatsapp' -> 201, đọc lại đúng loại (API + cột DB); loại lạ -> 400", async () => {
    const token = await loginAs(owner);
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ campaignName: 'WhatsApp thử', campaignType: 'whatsapp' });
    expect(res.status).toBe(201);
    expect(res.body.data.campaignType).toBe('whatsapp');
    const { rows } = await db.query('SELECT campaign_type FROM campaigns WHERE id = $1', [res.body.data.id]);
    expect(rows[0].campaign_type).toBe('whatsapp');

    const bad = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({ campaignName: 'Loại lạ', campaignType: 'whatsapp_group' });
    expect(bad.status).toBe(400);
  });
});

describe('W4a — API cho trình dựng', () => {
  it('GET /channels: cờ bật -> có whatsapp đúng hợp đồng, không lộ policy', async () => {
    process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED = 'true';
    const token = await loginAs(owner);
    const res = await request(app).get('/api/campaigns/channels').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.channels).toEqual([
      { key: 'whatsapp', sendNodeSubtype: 'send_whatsapp', label: 'WhatsApp' },
    ]);
  });

  it('GET /channels/whatsapp/accounts: chỉ phiên của chủ, kèm đếm hội thoại khử trùng, không lộ SĐT chủ', async () => {
    const token = await loginAs(owner);
    const key = `${owner.id}-default`;
    openSession(key, 'Phúc');
    const other = await createUser({ email: `w4a_other2_${Date.now()}@example.com` });
    openSession(`${other.id}-default`, 'Khách khác');
    const connId = await insertConnection(owner.id, key);
    const base = { userId: owner.id, connectionId: connId, sessionKey: key };
    await insertConversation({ ...base, chatbotId: 59, phone: '84911111111' });
    await insertConversation({ ...base, chatbotId: 72, phone: '84911111111' });
    await insertConversation({ ...base, chatbotId: 59, phone: '84922222222' });
    await insertConversation({ ...base, chatbotId: 59, phone: '84933333333', status: 'closed' });

    const res = await request(app)
      .get('/api/campaigns/channels/whatsapp/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: [{ sessionKey: key, display: 'Phúc', status: 'open', openConversationCount: 2 }],
    });
    expect(JSON.stringify(res.body)).not.toContain('84900000000');
  });

  it('chưa đăng nhập -> 401; nhân viên không có quyền chiến dịch -> 403; có campaigns_create -> thấy phiên của chủ', async () => {
    const unauth = await request(app).get('/api/campaigns/channels/whatsapp/accounts');
    expect(unauth.status).toBe(401);

    const employee = await createUser({ email: `w4a_emp_${Date.now()}@example.com` });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
      [owner.id, employee.id, JSON.stringify({})]
    );
    const empToken = await loginAs(employee);
    const denied = await request(app)
      .get('/api/campaigns/channels/whatsapp/accounts')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id));
    expect(denied.status).toBe(403);

    await db.query(
      `UPDATE user_members SET permissions = $3::jsonb WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, employee.id, JSON.stringify({ campaigns_create: true })]
    );
    // PLAN_GIAO_TK_TG_WA H2 (10/10/2026): nhân viên chỉ thấy/dùng tài khoản Telegram/WhatsApp ĐƯỢC GIAO — giao tài khoản này để giữ ý định của ca.
    await db.query(
      `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source) VALUES ($1, $2, 'whatsapp_baileys', $3, 'assigned')`,
      [owner.id, employee.id, `${owner.id}-default`]
    );
    openSession(`${owner.id}-default`, 'Phúc');
    const allowed = await request(app)
      .get('/api/campaigns/channels/whatsapp/accounts')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id));
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.map((a) => a.sessionKey)).toEqual([`${owner.id}-default`]);
  });
});

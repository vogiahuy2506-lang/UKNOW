/**
 * PLAN_WHATSAPP_DOT3_2026-09-29 W5 — hạn mức số tài khoản WhatsApp + Telegram theo gói.
 *
 * a) Admin tạo/sửa gói qua API ghi + đọc lại đúng maxWhatsappAccounts / maxTelegramAccounts.
 * b) activateUserPlan đồng bộ plans -> users.max_whatsapp_accounts / max_telegram_accounts.
 * c) WhatsApp (POST /api/whatsapp-qr/sessions): trần 1 -> phiên 1 OK, phiên 2 -> 400 RESOURCE_LIMIT_EXCEEDED,
 *    kết nối lại phiên 1 OK; NULL không chặn; 0 chặn ngay "không được hỗ trợ"; admin bỏ qua.
 * d) Telegram (telegramPersonalService.checkLoginStatus): cùng bộ ca; đăng nhập lại tài khoản cũ không bị đếm.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';

process.env.BULLMQ_ENABLED = 'false';

// WhatsApp: giả connectSession — ghi dòng creds như Baileys làm khi tạo phiên mới; phần còn lại dùng bản thật
// (listPersistedSessions đọc DB thật).
const actualWhatsApp = await import('../../src/services/chatbot/whatsappBaileys.service.js');
const connectSessionFake = jest.fn();
jest.unstable_mockModule('../../src/services/chatbot/whatsappBaileys.service.js', () => ({
  ...actualWhatsApp,
  getSession: () => null,
  connectSession: connectSessionFake,
}));

// Telegram: giả gateway (không mở MTProto).
const gatewayMock = {
  isConfigured: jest.fn(() => true),
  createSession: jest.fn(),
  getStatus: jest.fn(),
  cancelSession: jest.fn(async () => ({})),
  listAccounts: jest.fn(async () => ({ data: [] })),
  bindAccount: jest.fn(async () => ({ ok: true })),
  ensureHandler: jest.fn(async () => ({ data: { ok: true } })),
};
jest.unstable_mockModule('../../src/services/chatbot/telegramGateway.client.js', () => ({ default: gatewayMock }));

const db = (await import('../../src/config/database.js')).default;
const { createApp } = await import('../../src/app.js');
const { truncateAll, createUser } = await import('./helpers/db.js');
const { activateUserPlan } = await import('../../src/repositories/payment/payment.repository.js');
const telegramPersonalService = (await import('../../src/services/chatbot/telegramPersonal.service.js')).default;

let app;
beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  // truncateAll không dọn bảng phiên WhatsApp; user id lặp lại sau RESTART IDENTITY nên phải xoá tay.
  await db.query('DELETE FROM whatsapp_baileys_session_creds');
  jest.clearAllMocks();
  connectSessionFake.mockImplementation(async (sessionKey) => {
    await db.query(
      `INSERT INTO whatsapp_baileys_session_creds (session_key, creds) VALUES ($1, '{}'::jsonb)
       ON CONFLICT (session_key) DO NOTHING`,
      [sessionKey]
    );
    return { status: 'qr', lastQr: null };
  });
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status} ${res.body.message}`);
  return res.body.data.accessToken;
}

async function createPlanViaApi(adminToken, code, limits) {
  const res = await request(app)
    .post('/api/admin/plans')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ code, name: `Plan ${code}`, price: 1000, maxEmployees: 1, storageLimitBytes: 100 * 1024 * 1024, ...limits });
  expect(res.status).toBe(201);
  return res.body.data;
}

/** Tạo user thường đã kích hoạt gói có trần WA/TG cho trước (qua đúng đường activateUserPlan production). */
async function userWithPlanLimits(name, limits) {
  const admin = await createUser({ role: 'admin', username: `adm_${name}` });
  const token = await loginAs(admin);
  const plan = await createPlanViaApi(token, `w5_${name}`, limits);
  const user = await createUser({ username: `usr_${name}`, withPlan: false });
  await activateUserPlan(user.id, plan.id);
  return { user, plan, userToken: await loginAs(user), adminToken: token };
}

const connectWa = (token, sessionKey) => request(app)
  .post('/api/whatsapp-qr/sessions')
  .set('Authorization', `Bearer ${token}`)
  .send({ sessionKey });

const tgLogin = async (userId, roleCode, sid, telegramUserId) => {
  gatewayMock.createSession.mockResolvedValueOnce({ data: { session_id: sid, qr_image_base64: 'A', expires_at: 1 } });
  await telegramPersonalService.startLogin(userId, roleCode);
  gatewayMock.getStatus.mockResolvedValueOnce({
    data: { status: 'success', user: { telegram_user_id: telegramUserId, first_name: 'T' } },
  });
  return telegramPersonalService.checkLoginStatus(sid);
};

const countTg = async (userId) => Number(
  (await db.query('SELECT COUNT(*)::int AS n FROM telegram_accounts WHERE id_user = $1', [userId])).rows[0].n
);

describe('W5 (a) admin plans API ghi/đọc 2 cột mới', () => {
  it('POST + PATCH + GET trả đúng maxWhatsappAccounts/maxTelegramAccounts; thiếu -> null', async () => {
    const admin = await createUser({ role: 'admin', username: 'adm_api' });
    const token = await loginAs(admin);
    const created = await createPlanViaApi(token, 'w5_api', { maxWhatsappAccounts: 3, maxTelegramAccounts: 0 });
    expect(created.max_whatsapp_accounts).toBe(3);
    expect(created.max_telegram_accounts).toBe(0);

    const patched = await request(app)
      .patch(`/api/admin/plans/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Plan w5_api', price: 1000, maxEmployees: 1, storageLimitBytes: 100 * 1024 * 1024,
        maxWhatsappAccounts: 5, maxTelegramAccounts: 2,
      });
    expect(patched.status).toBe(200);

    const list = await request(app).get('/api/admin/plans').set('Authorization', `Bearer ${token}`);
    const row = list.body.data.find((p) => p.id === created.id);
    expect(row.maxWhatsappAccounts).toBe(5);
    expect(row.maxTelegramAccounts).toBe(2);

    const bare = await createPlanViaApi(token, 'w5_bare', {});
    expect(bare.max_whatsapp_accounts).toBeNull();
    expect(bare.max_telegram_accounts).toBeNull();
  });
});

describe('W5 (b) activateUserPlan đồng bộ plans -> users', () => {
  it('users.max_whatsapp_accounts / max_telegram_accounts theo gói; gói NULL -> NULL', async () => {
    const { user } = await userWithPlanLimits('sync', { maxWhatsappAccounts: 1, maxTelegramAccounts: 2 });
    const { rows } = await db.query('SELECT max_whatsapp_accounts, max_telegram_accounts FROM users WHERE id = $1', [user.id]);
    expect(rows[0]).toEqual({ max_whatsapp_accounts: 1, max_telegram_accounts: 2 });

    const { user: u2 } = await userWithPlanLimits('sync_null', {});
    const r2 = await db.query('SELECT max_whatsapp_accounts, max_telegram_accounts FROM users WHERE id = $1', [u2.id]);
    expect(r2.rows[0]).toEqual({ max_whatsapp_accounts: null, max_telegram_accounts: null });
  });
});

describe('W5 (c) WhatsApp connect', () => {
  it('trần 1: phiên 1 OK, phiên 2 -> 400 RESOURCE_LIMIT_EXCEEDED (không gọi connectSession), kết nối lại phiên 1 OK', async () => {
    const { userToken } = await userWithPlanLimits('wa1', { maxWhatsappAccounts: 1 });
    const r1 = await connectWa(userToken, 'a');
    expect(r1.status).toBe(200);
    expect(connectSessionFake).toHaveBeenCalledTimes(1);

    const r2 = await connectWa(userToken, 'b');
    expect(r2.status).toBe(400);
    expect(r2.body.code).toBe('RESOURCE_LIMIT_EXCEEDED');
    expect(r2.body.limitReached).toBe(true);
    expect(connectSessionFake).toHaveBeenCalledTimes(1);

    const r3 = await connectWa(userToken, 'a');
    expect(r3.status).toBe(200);
    expect(connectSessionFake).toHaveBeenCalledTimes(2);
  });

  it('NULL = không chặn (3 phiên liên tiếp)', async () => {
    const { userToken } = await userWithPlanLimits('wa_null', {});
    for (const k of ['a', 'b', 'c']) {
      expect((await connectWa(userToken, k)).status).toBe(200);
    }
  });

  it('0 = không hỗ trợ: chặn ngay ở phiên đầu, thông báo "không được hỗ trợ"', async () => {
    const { userToken } = await userWithPlanLimits('wa0', { maxWhatsappAccounts: 0 });
    const res = await connectWa(userToken, 'a');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('RESOURCE_LIMIT_EXCEEDED');
    expect(res.body.message).toMatch(/không được hỗ trợ/);
    expect(connectSessionFake).not.toHaveBeenCalled();
  });

  it('phiên của chủ khác không tính vào hạn mức của mình', async () => {
    const { userToken } = await userWithPlanLimits('wa_own', { maxWhatsappAccounts: 1 });
    await db.query(`INSERT INTO whatsapp_baileys_session_creds (session_key, creds) VALUES ('999999-x', '{}'::jsonb)`);
    expect((await connectWa(userToken, 'a')).status).toBe(200);
  });

  it('admin bỏ qua hạn mức', async () => {
    const admin = await createUser({ role: 'admin', username: 'adm_wa' });
    await db.query('UPDATE users SET max_whatsapp_accounts = 0 WHERE id = $1', [admin.id]);
    const token = await loginAs(admin);
    expect((await connectWa(token, 'a')).status).toBe(200);
  });
});

describe('W5 (d) Telegram createAccount sau QR', () => {
  it('trần 1: tài khoản 1 OK, tài khoản 2 -> RESOURCE_LIMIT_EXCEEDED (không thêm dòng, không bind), đăng nhập lại tài khoản 1 OK', async () => {
    const { user } = await userWithPlanLimits('tg1', { maxTelegramAccounts: 1 });
    const a = await tgLogin(user.id, 'user', 'tg-s1', 7001);
    expect(a.status).toBe('success');
    expect(await countTg(user.id)).toBe(1);

    await expect(tgLogin(user.id, 'user', 'tg-s2', 7002)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
    expect(await countTg(user.id)).toBe(1);
    expect(gatewayMock.bindAccount).toHaveBeenCalledTimes(1);

    const again = await tgLogin(user.id, 'user', 'tg-s3', 7001);
    expect(again.status).toBe('success');
    expect(await countTg(user.id)).toBe(1);
  });

  it('NULL không chặn; 0 chặn ngay; admin bỏ qua', async () => {
    const { user: unlimited } = await userWithPlanLimits('tg_null', {});
    expect((await tgLogin(unlimited.id, 'user', 'tg-n1', 7101)).status).toBe('success');
    expect((await tgLogin(unlimited.id, 'user', 'tg-n2', 7102)).status).toBe('success');
    expect(await countTg(unlimited.id)).toBe(2);

    const { user: zero } = await userWithPlanLimits('tg_zero', { maxTelegramAccounts: 0 });
    await expect(tgLogin(zero.id, 'user', 'tg-z1', 7201)).rejects.toThrow(/không được hỗ trợ/);
    expect(await countTg(zero.id)).toBe(0);

    await db.query('UPDATE users SET max_telegram_accounts = 0 WHERE id = $1', [zero.id]);
    expect((await tgLogin(zero.id, 'admin', 'tg-z2', 7202)).status).toBe('success');
  });
});

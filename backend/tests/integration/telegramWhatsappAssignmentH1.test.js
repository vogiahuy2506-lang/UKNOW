/**
 * PLAN_GIAO_TK_TG_WA PR-H1 — giao tài khoản Telegram / WhatsApp (Baileys) cho nhân viên (CSDL thật).
 *
 * Gồm: migration 290 (legacy + chạy lại không cấp lại + bỏ `zalo_settings`), API giao `GET/PUT /api/employees/:id/channel-accounts`
 * mở rộng ba kênh (KHOÁ VẮNG = GIỮ NGUYÊN, id/khoá của chủ khác bị loại, audit từng kênh), dọn việc giao khi xoá tài khoản
 * Telegram / phiên WhatsApp (khoá WhatsApp dùng lại được), nhân viên nối lại khoá WhatsApp chưa được giao → 403, FAIL-CLOSED.
 * H1 KHÔNG lọc danh sách nào khác (đó là H2-H4).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

process.env.BULLMQ_ENABLED = 'false';

const gatewayMock = {
  isConfigured: jest.fn(() => true),
  ensureHandler: jest.fn(async () => ({ data: { ok: true } })),
  deleteAccount: jest.fn(async () => ({ deleted: true })),
};
jest.unstable_mockModule('../../src/services/chatbot/telegramGateway.client.js', () => ({ default: gatewayMock }));

const db = (await import('../../src/config/database.js')).default;
const { createApp } = await import('../../src/app.js');
const { createUser, truncateAll } = await import('./helpers/db.js');
const { getAccessibleChannelAccountRefs } = await import('../../src/services/user/memberChannelAccess.service.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(path.resolve(__dirname, '../../migrations/290_member_channel_accounts_telegram_whatsapp.sql'), 'utf8');

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  // `whatsapp_baileys_session_creds` không FK tới users nên truncateAll không dọn.
  await db.query('DELETE FROM whatsapp_baileys_session_creds');
});

afterEach(async () => {
  await db.query('DELETE FROM whatsapp_baileys_session_creds');
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) throw new Error(`Login thất bại cho ${user.username}: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function addMembership(ownerId, employeeId, { permissions = { chatbot_channels_manage: true }, status = 'active', acceptedAt = new Date() } = {}) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, origin, accepted_at, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, 'created', $5, NOW(), NOW())`,
    [ownerId, employeeId, JSON.stringify(permissions), status, acceptedAt]
  );
}

let telegramSeq = 800000;
async function createTelegram(ownerId, { username = null, isActive = true } = {}) {
  telegramSeq += 1;
  const { rows } = await db.query(
    `INSERT INTO telegram_accounts (id_user, telegram_user_id, username, first_name, is_active)
     VALUES ($1, $2, $3, 'Tele', $4) RETURNING id`,
    [ownerId, telegramSeq, username, isActive]
  );
  return Number(rows[0].id);
}

/** Phiên WhatsApp = một dòng creds (khoá "<idChủ>-<khoáNgắn>"). */
async function createWhatsApp(ownerId, shortKey) {
  const sessionKey = `${ownerId}-${shortKey}`;
  await db.query(`INSERT INTO whatsapp_baileys_session_creds (session_key, creds) VALUES ($1, '{}'::jsonb)`, [sessionKey]);
  return sessionKey;
}

async function assign(ownerId, employeeId, channel, ref, source = 'assigned') {
  await db.query(
    `INSERT INTO member_channel_accounts (owner_id, employee_id, channel, account_ref, source)
     VALUES ($1, $2, $3, $4, $5)`,
    [ownerId, employeeId, channel, String(ref), source]
  );
}

async function refsOf(employeeId, channel) {
  const { rows } = await db.query(
    `SELECT account_ref FROM member_channel_accounts WHERE employee_id = $1 AND channel = $2 ORDER BY account_ref`,
    [employeeId, channel]
  );
  return rows.map((r) => r.account_ref);
}

/** Một chủ có 3 tài khoản Telegram + 2 phiên WhatsApp + một nhân viên có quyền quản lý kênh. */
async function setupWorkspace() {
  const owner = await createUser({ username: `chu_tgwa_${Date.now()}`, role: 'user' });
  const employee = await createUser({ username: `nv_tgwa_${Date.now()}`, role: 'user' });
  await addMembership(owner.id, employee.id, { permissions: { chatbot_channels_manage: true, inbox_view: true, campaigns_create: true } });
  const t1 = await createTelegram(owner.id, { username: 'shop_vn' });
  const t2 = await createTelegram(owner.id);
  const t3 = await createTelegram(owner.id);
  const w1 = await createWhatsApp(owner.id, 'default');
  const w2 = await createWhatsApp(owner.id, 'shop_2');
  return {
    owner, employee, t1, t2, t3, w1, w2,
    ownerToken: await loginAs(owner),
    employeeToken: await loginAs(employee),
  };
}

const asEmployee = (req, token, ownerId) => req.set('Authorization', `Bearer ${token}`).set('X-Owner-Context', String(ownerId));
const asOwner = (req, token) => req.set('Authorization', `Bearer ${token}`);
const put = (employeeId, token, body) => asOwner(request(app).put(`/api/employees/${employeeId}/channel-accounts`), token).send(body);

describe('migration 290 — legacy Telegram / WhatsApp + chạy lại không cấp lại', () => {
  async function seed() {
    const owner = await createUser({ username: 'chu_mig290', role: 'user' });
    const otherOwner = await createUser({ username: 'chu_khac_mig290', role: 'user' });
    const t1 = await createTelegram(owner.id);
    const t2 = await createTelegram(owner.id);
    const tOther = await createTelegram(otherOwner.id);
    const w1 = await createWhatsApp(owner.id, 'default');
    const w2 = await createWhatsApp(owner.id, 'shop');
    // Khoá "trông giống" tiền tố nhưng KHÔNG phải của chủ này (owner.id + '1' là tiền tố khác).
    const wLookalike = `${owner.id}1-evil`;
    await db.query(`INSERT INTO whatsapp_baileys_session_creds (session_key, creds) VALUES ($1, '{}'::jsonb)`, [wLookalike]);
    const wOther = await createWhatsApp(otherOwner.id, 'x');

    const empChannels = await createUser({ username: 'nv290_kenh', role: 'user' });
    const empInbox = await createUser({ username: 'nv290_inbox', role: 'user' });
    const empAi = await createUser({ username: 'nv290_ai', role: 'user' });
    const empZaloOnly = await createUser({ username: 'nv290_zalo_only', role: 'user' });
    const empReadOnly = await createUser({ username: 'nv290_chi_xem', role: 'user' });
    const empInactive = await createUser({ username: 'nv290_khoa', role: 'user' });
    const empPending = await createUser({ username: 'nv290_cho', role: 'user' });
    const empOtherWs = await createUser({ username: 'nv290_chu_khac', role: 'user' });

    await addMembership(owner.id, empChannels.id, { permissions: { chatbot_channels_manage: true } });
    await addMembership(owner.id, empInbox.id, { permissions: { inbox_reply: true } });
    await addMembership(owner.id, empAi.id, { permissions: { ai_assistant_use: true } });
    // `zalo_settings` là quyền RIÊNG của Zalo: không đủ để nhận hàng Telegram / WhatsApp.
    await addMembership(owner.id, empZaloOnly.id, { permissions: { zalo_settings: true } });
    await addMembership(owner.id, empReadOnly.id, { permissions: { campaigns_view: true, reports_view: true } });
    await addMembership(owner.id, empInactive.id, { permissions: { chatbot_channels_manage: true }, status: 'inactive' });
    await addMembership(owner.id, empPending.id, { permissions: { chatbot_channels_manage: true }, acceptedAt: null });
    await addMembership(otherOwner.id, empOtherWs.id, { permissions: { inbox_view: true } });
    return {
      owner, otherOwner, t1, t2, tOther, w1, w2, wLookalike, wOther,
      empChannels, empInbox, empAi, empZaloOnly, empReadOnly, empInactive, empPending, empOtherWs,
    };
  }

  const rowsOf = async (channel) => (await db.query(
    `SELECT owner_id, employee_id, account_ref, source FROM member_channel_accounts WHERE channel = $1 ORDER BY employee_id, account_ref`,
    [channel]
  )).rows.map((r) => ({ ...r, owner_id: Number(r.owner_id), employee_id: Number(r.employee_id) }));
  const byEmployee = (rows, id) => rows.filter((r) => r.employee_id === Number(id)).map((r) => r.account_ref);

  it('chèn legacy cho nhân viên ĐANG HOẠT ĐỘNG có quyền chạm kênh x mọi tài khoản của chủ; bỏ qua người không đủ điều kiện, chủ, khoá giống tiền tố, chủ khác', async () => {
    const s = await seed();
    await db.query(`DELETE FROM member_channel_accounts WHERE channel IN ('telegram', 'whatsapp_baileys')`);
    await db.query(MIGRATION_SQL);

    const tg = await rowsOf('telegram');
    const wa = await rowsOf('whatsapp_baileys');
    const tgIds = [String(s.t1), String(s.t2)];
    const waKeys = [s.w1, s.w2].sort();

    for (const emp of [s.empChannels, s.empInbox, s.empAi]) {
      expect(byEmployee(tg, emp.id).sort()).toEqual(tgIds);
      expect(byEmployee(wa, emp.id).sort()).toEqual(waKeys);
    }
    expect(byEmployee(tg, s.empOtherWs.id)).toEqual([String(s.tOther)]);
    expect(byEmployee(wa, s.empOtherWs.id)).toEqual([s.wOther]);
    for (const emp of [s.empZaloOnly, s.empReadOnly, s.empInactive, s.empPending]) {
      expect(byEmployee(tg, emp.id)).toEqual([]);
      expect(byEmployee(wa, emp.id)).toEqual([]);
    }
    // Chủ không nhận hàng; khoá giống tiền tố không bị gán cho ai.
    expect(tg.some((r) => r.employee_id === Number(s.owner.id))).toBe(false);
    expect(wa.some((r) => r.account_ref === s.wLookalike)).toBe(false);
    expect([...tg, ...wa].every((r) => r.source === 'legacy')).toBe(true);
    // Không có hàng nào chéo chủ.
    expect(tg.filter((r) => r.owner_id === Number(s.owner.id)).every((r) => tgIds.includes(r.account_ref))).toBe(true);
    expect(wa.filter((r) => r.owner_id === Number(s.owner.id)).every((r) => waKeys.includes(r.account_ref))).toBe(true);
  });

  it('chạy lại sau khi chủ gỡ bớt KHÔNG cấp lại, không nhân đôi; không đụng hàng Zalo', async () => {
    const s = await seed();
    await assign(s.owner.id, s.empChannels.id, 'zalo_personal', 999, 'legacy');
    await db.query(`DELETE FROM member_channel_accounts WHERE channel IN ('telegram', 'whatsapp_baileys')`);
    await db.query(MIGRATION_SQL);

    await db.query(`DELETE FROM member_channel_accounts WHERE employee_id = $1 AND channel = 'telegram' AND account_ref = $2`, [s.empChannels.id, String(s.t2)]);
    const before = [await rowsOf('telegram'), await rowsOf('whatsapp_baileys')];
    await db.query(MIGRATION_SQL);
    const after = [await rowsOf('telegram'), await rowsOf('whatsapp_baileys')];
    expect(after).toEqual(before);
    expect(byEmployee(after[0], s.empChannels.id)).toEqual([String(s.t1)]);
    expect(await refsOf(s.empChannels.id, 'zalo_personal')).toEqual(['999']);
  });

  it('nhân viên MỚI (thêm sau migration) và tài khoản chủ thêm SAU migration mặc định không có hàng nào', async () => {
    const s = await seed();
    await db.query(`DELETE FROM member_channel_accounts WHERE channel IN ('telegram', 'whatsapp_baileys')`);
    await db.query(MIGRATION_SQL);
    const newcomer = await createUser({ username: 'nv290_moi', role: 'user' });
    await addMembership(s.owner.id, newcomer.id, { permissions: { chatbot_channels_manage: true } });
    const later = await createTelegram(s.owner.id);
    expect(await refsOf(newcomer.id, 'telegram')).toEqual([]);
    expect(await refsOf(s.empChannels.id, 'telegram')).not.toContain(String(later));
  });
});

describe('API giao: GET /api/employees/:id/channel-accounts — ba kênh', () => {
  it('chủ xem: đủ Telegram + phiên WhatsApp của CHỦ (không lẫn chủ khác), nhân viên mới chưa giao gì', async () => {
    const { employee, ownerToken, t1, t2, t3, w1, w2 } = await setupWorkspace();
    const stranger = await createUser({ username: 'chu_la_tgwa', role: 'user' });
    await createTelegram(stranger.id);
    await createWhatsApp(stranger.id, 'default');

    const res = await asOwner(request(app).get(`/api/employees/${employee.id}/channel-accounts`), ownerToken);
    expect(res.status).toBe(200);
    expect(res.body.data.telegramAccounts.map((x) => x.id).sort((a, b) => a - b)).toEqual([t1, t2, t3]);
    expect(res.body.data.whatsappAccounts.map((x) => x.sessionKey).sort()).toEqual([w1, w2].sort());
    expect([...res.body.data.telegramAccounts, ...res.body.data.whatsappAccounts].every((x) => x.assigned === false && x.source === null)).toBe(true);
    const shop = res.body.data.telegramAccounts.find((x) => x.id === t1);
    expect(shop).toMatchObject({ username: 'shop_vn', displayName: 'Tele' });
    expect(res.body.data.whatsappAccounts.find((x) => x.sessionKey === w2)).toMatchObject({ shortKey: 'shop_2' });
  });

  it('cờ đã giao + nguồn phản ánh bảng giao; hàng WhatsApp trỏ sang khoá chủ khác KHÔNG hiện là đã giao', async () => {
    const { owner, employee, ownerToken, t1, w1 } = await setupWorkspace();
    await assign(owner.id, employee.id, 'telegram', t1, 'legacy');
    await assign(owner.id, employee.id, 'whatsapp_baileys', w1, 'self_login');
    await assign(owner.id, employee.id, 'whatsapp_baileys', '99999-khac', 'assigned');
    const res = await asOwner(request(app).get(`/api/employees/${employee.id}/channel-accounts`), ownerToken);
    const tg = res.body.data.telegramAccounts.filter((x) => x.assigned);
    expect(tg.map((x) => [x.id, x.source])).toEqual([[t1, 'legacy']]);
    const wa = res.body.data.whatsappAccounts.filter((x) => x.assigned);
    expect(wa.map((x) => [x.sessionKey, x.source])).toEqual([[w1, 'self_login']]);
  });

  it('nhân viên gọi GET → 403 OWNER_ONLY', async () => {
    const { owner, employee, employeeToken } = await setupWorkspace();
    const res = await asEmployee(request(app).get(`/api/employees/${employee.id}/channel-accounts`), employeeToken, owner.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OWNER_ONLY');
  });
});

describe('API giao: PUT /api/employees/:id/channel-accounts — ba kênh, khoá vắng = giữ nguyên', () => {
  it('giao Telegram + WhatsApp: hàng source=assigned, created_by = chủ, bump user_members.updated_at, audit MỖI kênh', async () => {
    const { owner, employee, ownerToken, t1, t2, w1 } = await setupWorkspace();
    const rev0 = (await db.query(`SELECT updated_at FROM user_members WHERE employee_id = $1`, [employee.id])).rows[0].updated_at;
    await new Promise((r) => setTimeout(r, 20));

    const res = await put(employee.id, ownerToken, { telegramAccountIds: [t1, t2], whatsappSessionKeys: [w1] });

    expect(res.status).toBe(200);
    expect(await refsOf(employee.id, 'telegram')).toEqual([String(t1), String(t2)].sort());
    expect(await refsOf(employee.id, 'whatsapp_baileys')).toEqual([w1]);
    expect(res.body.data.telegramAccounts.filter((x) => x.assigned).map((x) => x.id).sort((a, b) => a - b)).toEqual([t1, t2]);
    expect(res.body.data.whatsappAccounts.filter((x) => x.assigned).map((x) => x.sessionKey)).toEqual([w1]);
    const { rows } = await db.query(`SELECT source, created_by FROM member_channel_accounts WHERE employee_id = $1 AND channel IN ('telegram', 'whatsapp_baileys')`, [employee.id]);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.source === 'assigned' && Number(r.created_by) === Number(owner.id))).toBe(true);

    const rev1 = (await db.query(`SELECT updated_at FROM user_members WHERE employee_id = $1`, [employee.id])).rows[0].updated_at;
    expect(new Date(rev1).getTime()).toBeGreaterThan(new Date(rev0).getTime());

    const audit = await db.query(`SELECT details FROM audit_logs WHERE action = 'EMPLOYEE_CHANNEL_ACCOUNTS_UPDATED' AND entity_id = $1 ORDER BY id`, [employee.id]);
    expect(audit.rows.map((r) => r.details.channel).sort()).toEqual(['telegram', 'whatsapp_baileys']);
    const tgAudit = audit.rows.find((r) => r.details.channel === 'telegram').details;
    expect(tgAudit).toMatchObject({ before: [], after: [String(t1), String(t2)].sort() });
  });

  it('KHOÁ VẮNG = GIỮ NGUYÊN: PUT chỉ có zaloAccountIds (bản FE cũ) KHÔNG làm mất việc giao Telegram / WhatsApp', async () => {
    const { owner, employee, ownerToken, t1, w1 } = await setupWorkspace();
    await assign(owner.id, employee.id, 'telegram', t1, 'legacy');
    await assign(owner.id, employee.id, 'whatsapp_baileys', w1, 'self_login');

    const res = await put(employee.id, ownerToken, { zaloAccountIds: [] });

    expect(res.status).toBe(200);
    expect(await refsOf(employee.id, 'telegram')).toEqual([String(t1)]);
    expect(await refsOf(employee.id, 'whatsapp_baileys')).toEqual([w1]);
    // Chỉ kênh có gửi mới ghi audit.
    const audit = await db.query(`SELECT details FROM audit_logs WHERE action = 'EMPLOYEE_CHANNEL_ACCOUNTS_UPDATED' AND entity_id = $1`, [employee.id]);
    expect(audit.rows.map((r) => r.details.channel)).toEqual(['zalo_personal']);
  });

  it('chỉ gửi telegramAccountIds → Zalo và WhatsApp giữ nguyên; danh sách rỗng thu hồi ĐÚNG kênh đó', async () => {
    const { owner, employee, ownerToken, t1, w1 } = await setupWorkspace();
    await assign(owner.id, employee.id, 'telegram', t1);
    await assign(owner.id, employee.id, 'whatsapp_baileys', w1);
    await db.query(
      `INSERT INTO zalo_settings (id_user, display_name, status, is_active) VALUES ($1, 'Z', 'disconnected', TRUE) RETURNING id`,
      [owner.id]
    ).then(async ({ rows }) => assign(owner.id, employee.id, 'zalo_personal', rows[0].id));

    const res = await put(employee.id, ownerToken, { telegramAccountIds: [] });

    expect(res.status).toBe(200);
    expect(await refsOf(employee.id, 'telegram')).toEqual([]);
    expect(await refsOf(employee.id, 'whatsapp_baileys')).toEqual([w1]);
    expect(await refsOf(employee.id, 'zalo_personal')).toHaveLength(1);
  });

  it('thay toàn bộ từng kênh: giao lại chỉ t2 → t1 bị thu hồi; hàng legacy / self_login còn trong danh sách mới GIỮ nguồn', async () => {
    const { owner, employee, ownerToken, t1, t2, w1, w2 } = await setupWorkspace();
    await assign(owner.id, employee.id, 'telegram', t1, 'legacy');
    await assign(owner.id, employee.id, 'whatsapp_baileys', w1, 'self_login');
    await put(employee.id, ownerToken, { telegramAccountIds: [t1, t2] });
    await put(employee.id, ownerToken, { telegramAccountIds: [t2], whatsappSessionKeys: [w1, w2] });

    expect(await refsOf(employee.id, 'telegram')).toEqual([String(t2)]);
    const wa = await db.query(`SELECT account_ref, source FROM member_channel_accounts WHERE employee_id = $1 AND channel = 'whatsapp_baileys' ORDER BY account_ref`, [employee.id]);
    expect(wa.rows.find((r) => r.account_ref === w1).source).toBe('self_login');
    expect(wa.rows.find((r) => r.account_ref === w2).source).toBe('assigned');
  });

  it('id / khoá của chủ KHÁC, khoá không có creds, khoá sai tiền tố bị loại, không báo lỗi', async () => {
    const { employee, ownerToken, t1, w1 } = await setupWorkspace();
    const stranger = await createUser({ username: 'chu_la_put', role: 'user' });
    const foreignTg = await createTelegram(stranger.id);
    const foreignWa = await createWhatsApp(stranger.id, 'default');

    const res = await put(employee.id, ownerToken, {
      telegramAccountIds: [t1, foreignTg, 987654],
      whatsappSessionKeys: [w1, foreignWa, `${stranger.id}-khong-co`, 'khong-co-tien-to'],
    });

    expect(res.status).toBe(200);
    expect(await refsOf(employee.id, 'telegram')).toEqual([String(t1)]);
    expect(await refsOf(employee.id, 'whatsapp_baileys')).toEqual([w1]);
  });

  it('khoá WhatsApp của CHỦ nhưng chưa có creds → bị loại (không giao khoá ma)', async () => {
    const { owner, employee, ownerToken } = await setupWorkspace();
    const res = await put(employee.id, ownerToken, { whatsappSessionKeys: [`${owner.id}-chua-quet`] });
    expect(res.status).toBe(200);
    expect(await refsOf(employee.id, 'whatsapp_baileys')).toEqual([]);
  });

  it('body sai → 400 (không phải mảng / phần tử sai), DB không đổi; không có khoá nào → 400', async () => {
    const { employee, ownerToken } = await setupWorkspace();
    expect((await put(employee.id, ownerToken, { telegramAccountIds: ['x'] })).status).toBe(400);
    expect((await put(employee.id, ownerToken, { telegramAccountIds: 'abc' })).status).toBe(400);
    expect((await put(employee.id, ownerToken, { whatsappSessionKeys: ['a b'] })).status).toBe(400);
    expect((await put(employee.id, ownerToken, { whatsappSessionKeys: [5] })).status).toBe(400);
    const none = await put(employee.id, ownerToken, {});
    expect(none.status).toBe(400);
    expect(await db.query('SELECT 1 FROM audit_logs WHERE action = $1', ['EMPLOYEE_CHANNEL_ACCOUNTS_UPDATED']).then((r) => r.rowCount)).toBe(0);
  });

  it('nhân viên gọi PUT → 403 OWNER_ONLY, DB không đổi; nhân viên của chủ khác → 404', async () => {
    const { owner, employee, employeeToken, ownerToken, t1 } = await setupWorkspace();
    const res = await asEmployee(request(app).put(`/api/employees/${employee.id}/channel-accounts`), employeeToken, owner.id).send({ telegramAccountIds: [t1] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OWNER_ONLY');
    expect(await refsOf(employee.id, 'telegram')).toEqual([]);

    const outsider = await createUser({ username: 'ngoai_nhom_tgwa', role: 'user' });
    const out = await put(outsider.id, ownerToken, { telegramAccountIds: [t1] });
    expect(out.status).toBe(404);
    expect(await refsOf(outsider.id, 'telegram')).toEqual([]);
  });

  it('một giao dịch: lỗi ở kênh sau → KHÔNG kênh nào đổi (đổi tên tạm bảng creds làm kênh WhatsApp lỗi)', async () => {
    const { owner, employee, ownerToken, t1, t2, w1 } = await setupWorkspace();
    await assign(owner.id, employee.id, 'telegram', t1);
    await db.query('ALTER TABLE whatsapp_baileys_session_creds RENAME TO whatsapp_baileys_session_creds_tmp_broken');
    try {
      const res = await put(employee.id, ownerToken, { telegramAccountIds: [t2], whatsappSessionKeys: [w1] });
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      await db.query('ALTER TABLE whatsapp_baileys_session_creds_tmp_broken RENAME TO whatsapp_baileys_session_creds');
    }
    expect(await refsOf(employee.id, 'telegram')).toEqual([String(t1)]);
  });
});

describe('dọn việc giao khi xoá tài khoản / phiên / nhân viên (R1)', () => {
  it('xoá tài khoản Telegram (chủ) → dọn hàng giao của nó cho MỌI nhân viên, giữ hàng của tài khoản khác', async () => {
    const { owner, employee, ownerToken, t1, t2 } = await setupWorkspace();
    const other = await createUser({ username: 'nv_khac_tg', role: 'user' });
    await addMembership(owner.id, other.id);
    await assign(owner.id, employee.id, 'telegram', t1);
    await assign(owner.id, employee.id, 'telegram', t2);
    await assign(owner.id, other.id, 'telegram', t1);

    const del = await asOwner(request(app).delete(`/api/ai/chatbot/telegram-accounts/${t1}`), ownerToken);
    expect(del.status).toBe(200);
    expect(await refsOf(employee.id, 'telegram')).toEqual([String(t2)]);
    expect(await refsOf(other.id, 'telegram')).toEqual([]);
  });

  it('xoá phiên WhatsApp → dọn hàng giao; tạo lại ĐÚNG khoá đó thì nhân viên KHÔNG thấy lại quyền cũ', async () => {
    const { owner, employee, ownerToken, w1, w2 } = await setupWorkspace();
    await assign(owner.id, employee.id, 'whatsapp_baileys', w1);
    await assign(owner.id, employee.id, 'whatsapp_baileys', w2);

    const del = await asOwner(request(app).delete(`/api/whatsapp-qr/sessions/default`), ownerToken);
    expect(del.status).toBe(200);
    expect(await refsOf(employee.id, 'whatsapp_baileys')).toEqual([w2]);

    // Khoá dùng lại: chủ quét lại phiên "default".
    await createWhatsApp(owner.id, 'default');
    expect(await getAccessibleChannelAccountRefs(
      { actorUserId: Number(employee.id), workspaceOwnerId: Number(owner.id), contextType: 'employee', isSuperAdmin: false },
      'whatsapp_baileys'
    )).toEqual([w2]);
  });

  it('gỡ nhân viên khỏi nhóm → mất mọi việc giao ở cả ba kênh', async () => {
    const { owner, employee, ownerToken, t1, w1 } = await setupWorkspace();
    await assign(owner.id, employee.id, 'telegram', t1);
    await assign(owner.id, employee.id, 'whatsapp_baileys', w1);
    const del = await asOwner(request(app).delete(`/api/employees/${employee.id}`), ownerToken);
    expect(del.status).toBe(200);
    expect(await refsOf(employee.id, 'telegram')).toEqual([]);
    expect(await refsOf(employee.id, 'whatsapp_baileys')).toEqual([]);
  });
});

describe('WhatsApp: nhân viên nối lại khoá ĐÃ TỒN TẠI mà chưa được giao → 403 (lỗ cũ: sessionKey "default" nối lại phiên của chủ)', () => {
  it('POST /api/whatsapp-qr/sessions {sessionKey: "default"} bởi nhân viên chưa được giao → 403 CHANNEL_ACCOUNT_NOT_ASSIGNED; phiên và bảng giao không đổi', async () => {
    const { owner, employee, employeeToken, w1 } = await setupWorkspace();
    const res = await asEmployee(request(app).post('/api/whatsapp-qr/sessions'), employeeToken, owner.id).send({ sessionKey: 'default' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CHANNEL_ACCOUNT_NOT_ASSIGNED');
    expect(await refsOf(employee.id, 'whatsapp_baileys')).toEqual([]);
    expect((await db.query('SELECT 1 FROM whatsapp_baileys_session_creds WHERE session_key = $1', [w1])).rowCount).toBe(1);
  });

  it('được giao khoá KHÁC vẫn 403 với khoá "default" (giao theo từng khoá, không theo kênh)', async () => {
    const { owner, employee, employeeToken, w2 } = await setupWorkspace();
    await assign(owner.id, employee.id, 'whatsapp_baileys', w2);
    const res = await asEmployee(request(app).post('/api/whatsapp-qr/sessions'), employeeToken, owner.id).send({ sessionKey: 'default' });
    expect(res.status).toBe(403);
  });
});

describe('getAccessibleChannelAccountRefs — dữ liệu thật + FAIL-CLOSED', () => {
  const ctxOf = (owner, employee) => ({ actorUserId: Number(employee.id), workspaceOwnerId: Number(owner.id), contextType: 'employee', isSuperAdmin: false });

  it('nhân viên: đúng ref được giao ở từng kênh; chủ: null; hàng trỏ tài khoản đã xoá / chủ khác không cho thêm quyền', async () => {
    const { owner, employee, t1, w1 } = await setupWorkspace();
    const stranger = await createUser({ username: 'chu_la_ctx', role: 'user' });
    const foreignTg = await createTelegram(stranger.id);
    await assign(owner.id, employee.id, 'telegram', t1);
    await assign(owner.id, employee.id, 'telegram', foreignTg); // hàng lệch: tài khoản của chủ khác
    await assign(owner.id, employee.id, 'telegram', 424242); // hàng lệch: tài khoản không tồn tại
    await assign(owner.id, employee.id, 'whatsapp_baileys', w1);
    await assign(owner.id, employee.id, 'whatsapp_baileys', `${stranger.id}-default`); // hàng lệch: khoá chủ khác

    expect(await getAccessibleChannelAccountRefs(ctxOf(owner, employee), 'telegram')).toEqual([String(t1)]);
    expect(await getAccessibleChannelAccountRefs(ctxOf(owner, employee), 'whatsapp_baileys')).toEqual([w1]);
    expect(await getAccessibleChannelAccountRefs({ actorUserId: Number(owner.id), workspaceOwnerId: Number(owner.id), contextType: 'self', isSuperAdmin: false }, 'telegram')).toBeNull();
  });

  it('FAIL-CLOSED: bảng giao hỏng (đổi tên tạm) → [] cho nhân viên, KHÔNG BAO GIỜ null', async () => {
    const { owner, employee, t1, w1 } = await setupWorkspace();
    await assign(owner.id, employee.id, 'telegram', t1);
    await assign(owner.id, employee.id, 'whatsapp_baileys', w1);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await db.query('ALTER TABLE member_channel_accounts RENAME TO member_channel_accounts_tmp_broken');
    try {
      expect(await getAccessibleChannelAccountRefs(ctxOf(owner, employee), 'telegram')).toEqual([]);
      expect(await getAccessibleChannelAccountRefs(ctxOf(owner, employee), 'whatsapp_baileys')).toEqual([]);
    } finally {
      await db.query('ALTER TABLE member_channel_accounts_tmp_broken RENAME TO member_channel_accounts');
      console.error.mockRestore?.();
    }
  });
});

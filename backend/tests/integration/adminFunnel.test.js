/**
 * PR-9 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — Phễu kích hoạt dựng từ bảng `users` theo cohort tháng đăng ký, CHỈ tính
 * khách; mỗi bước là tập con của bước trước; không dựa vào audit `USER_REGISTERED` (id_user NULL).
 *
 * Bảng chân lý (đếm tay) ở `seedFunnel()`. Người KHÔNG phải khách nhưng có đủ kênh + tin + đơn (nội bộ, nhân viên thuần,
 * đã xoá, khách đăng ký trước cửa sổ) nằm trong dữ liệu để đột biến "bước sau không giao với bước trước" đỏ.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, createVerificationCode } from './helpers/db.js';
import { insertOrder, addMembership, setCreatedAt, vnMonthStart } from './helpers/adminCustomers.js';

let app;
const originalInternalIds = process.env.INTERNAL_USER_IDS;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM whatsapp_baileys_session_creds');
});

afterEach(async () => {
  await db.query('DELETE FROM whatsapp_baileys_session_creds');
  if (originalInternalIds === undefined) delete process.env.INTERNAL_USER_IDS;
  else process.env.INTERNAL_USER_IDS = originalInternalIds;
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) {
    throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

// ── dựng dữ liệu ─────────────────────────────────────────────────────────────
const addEmailAccount = (userId) => db.query(
  `INSERT INTO email_settings (id_user, name, email) VALUES ($1, 'Mail', $2)`, [userId, `mail${userId}@brand.test`]
);
const addZaloAccount = (userId) => db.query(
  `INSERT INTO zalo_settings (id_user, display_name) VALUES ($1, 'Zalo')`, [userId]
);
const addTelegramAccount = (userId) => db.query(
  `INSERT INTO telegram_accounts (id_user, telegram_user_id) VALUES ($1, $2)`, [userId, 900000 + Number(userId)]
);
const addWhatsappAccount = (userId) => db.query(
  `INSERT INTO whatsapp_baileys_session_creds (session_key, creds) VALUES ($1, '{}'::jsonb)`, [`${userId}-main`]
);

/** Tin email; sent_at = giờ VN của lúc đăng ký + `minutesAfter` phút (cột naive chứa GIỜ VN). */
const addEmail = (ownerId, { status = 'sent', minutesAfter = 5, preview = false } = {}) => db.query(
  `INSERT INTO email_messages (workspace_owner_id, recipient_email, status, is_preview, sent_at)
   SELECT $1, 'to@x.test', $2, $3, (u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') + ($4::int * INTERVAL '1 minute')
     FROM users u WHERE u.id = $1`,
  [ownerId, status, preview, minutesAfter]
);
let zaloToken = 0;
const addZalo = (ownerId, { status = 'sent', minutesAfter = 5 } = {}) => {
  zaloToken += 1;
  return db.query(
    `INSERT INTO zalo_messages (workspace_owner_id, tracking_token, channel, status, sent_at)
     SELECT $1, $2, 'zalo_personal', $3, (u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') + ($4::int * INTERVAL '1 minute')
       FROM users u WHERE u.id = $1`,
    [ownerId, `funnel-z-${zaloToken}`, status, minutesAfter]
  );
};
const addTelegramMessage = (ownerId, { minutesAfter = 5 } = {}) => db.query(
  `INSERT INTO campaign_channel_messages (workspace_owner_id, channel, recipient_key, status, sent_at)
   SELECT $1, 'telegram', 'tg-user', 'sent', u.created_at + ($2::int * INTERVAL '1 minute') FROM users u WHERE u.id = $1`,
  [ownerId, minutesAfter]
);

/**
 * Khách (cửa sổ mặc định 12 tháng), 6 người:
 *   tháng TRƯỚC — a1: nối Email, gửi email (status 'opened' vẫn là đã gửi) sau 5 phút, đã trả tiền      → qua cả 4 bước
 *                 a2: nối Zalo, gửi Zalo sau 30 phút, chưa trả                                              → 3 bước
 *                 a3: chỉ nối Telegram; có một email 'failed' (không phải đã gửi)                            → 2 bước
 *   tháng NÀY   — a4: không nối kênh; chỉ có email GỬI THỬ (is_preview)                                    → 1 bước
 *                 a5: không còn tài khoản kênh nào nhưng đã gửi Telegram sau 120 phút                       → 3 bước
 *                 a6: đã trả tiền nhưng chưa nối kênh / chưa gửi                                             → 1 bước, "trả tiền không qua bước trước"
 * KHÔNG phải khách nhưng có đủ kênh + tin + đơn trả tiền: nội bộ, nhân viên thuần của a1, đã xoá, và một khách đăng ký
 * 14 tháng trước (ngoài cửa sổ).
 */
async function seedFunnel() {
  const paid = await createPlan({ code: 'funnel-pro', price: 299000 });
  const mk = (username, extra = {}) => createUser({ username, email: `${username}@funnel.test`, withPlan: false, ...extra });
  const lastMonth = await vnMonthStart(-1);
  const registeredLastMonth = new Date(lastMonth.getTime() + 2 * 86400000);

  const admin = await createUser({ role: 'admin', username: 'funnel_admin' });
  const a1 = await mk('f_a1'); const a2 = await mk('f_a2'); const a3 = await mk('f_a3');
  const a4 = await mk('f_a4'); const a5 = await mk('f_a5'); const a6 = await mk('f_a6');
  const internal = await mk('f_internal');
  const staff = await mk('f_staff');
  const deleted = await mk('f_deleted', { status: 'deleted' });
  const old = await mk('f_old');
  for (const u of [a1, a2, a3]) await setCreatedAt(u.id, registeredLastMonth);
  await setCreatedAt(old.id, new Date(Date.now() - 14 * 31 * 86400000));
  await addMembership(a1.id, staff.id);
  process.env.INTERNAL_USER_IDS = String(internal.id);

  await addEmailAccount(a1.id); await addEmail(a1.id, { status: 'opened', minutesAfter: 5 });
  await insertOrder({ userId: a1.id, planId: paid.id, amount: 299000, paidAt: new Date() });
  await addZaloAccount(a2.id); await addZalo(a2.id, { minutesAfter: 30 });
  await addTelegramAccount(a3.id); await addEmail(a3.id, { status: 'failed' });
  await addEmail(a4.id, { preview: true });
  await addTelegramMessage(a5.id, { minutesAfter: 120 });
  await insertOrder({ userId: a6.id, planId: paid.id, amount: 299000, paidAt: new Date() });

  // Người ngoài phễu: có đủ mọi thứ.
  for (const outsider of [internal, staff, deleted, old]) {
    await addEmailAccount(outsider.id);
    await addWhatsappAccount(outsider.id);
    await addEmail(outsider.id, { minutesAfter: 1 });
    await insertOrder({ userId: outsider.id, planId: paid.id, amount: 299000, paidAt: new Date() });
  }
  const token = await loginAs(admin);
  const get = (query = '') => request(app).get(`/api/admin/funnel/overview${query}`).set('Authorization', `Bearer ${token}`);
  return { admin, get, users: { a1, a2, a3, a4, a5, a6, internal, staff, deleted, old } };
}

const stepOf = (data, key) => data.steps.find((s) => s.key === key);

describe('Authorization — /api/admin/funnel/overview', () => {
  it('không token → 401; user thường → 403', async () => {
    expect((await request(app).get('/api/admin/funnel/overview')).status).toBe(401);
    const user = await createUser({ username: 'plain' });
    const token = await loginAs(user);
    const res = await request(app).get('/api/admin/funnel/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('phễu dựng từ users', () => {
  it('bốn bước khớp tay: 6 → 4 → 3 → 1, kèm "% so với bước trước" và "mất ở bước này"', async () => {
    const { get } = await seedFunnel();
    const res = await get();
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.steps.map((s) => s.key)).toEqual(['registered', 'channelConnected', 'firstSend', 'paid']);
    expect(data.steps.map((s) => s.count)).toEqual([6, 4, 3, 1]);
    expect(data.steps.map((s) => s.pctOfPrevious)).toEqual([null, 66.7, 75, 33.3]);
    expect(data.steps.map((s) => s.lost)).toEqual([null, 2, 1, 2]);
    // a6 đã trả tiền nhưng chưa gửi tin: không lọt bước 4 (không là tập con của bước 3), hiện riêng.
    expect(data.paidWithoutSend).toBe(1);
  });

  it('mỗi bước là TẬP CON của bước trước — kể cả cohort; người ngoài phễu (nội bộ, nhân viên, đã xoá, trước cửa sổ) không lọt bước nào', async () => {
    const { get } = await seedFunnel();
    const data = (await get()).body.data;
    const counts = data.steps.map((s) => s.count);
    for (let i = 1; i < counts.length; i += 1) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    for (const c of data.cohorts) {
      expect(c.channelConnected).toBeLessThanOrEqual(c.registered);
      expect(c.firstSend).toBeLessThanOrEqual(c.channelConnected);
      expect(c.paid).toBeLessThanOrEqual(c.firstSend);
    }
    // Tổng các cohort = số của phễu.
    const sum = (key) => data.cohorts.reduce((acc, c) => acc + c[key], 0);
    expect(sum('registered')).toBe(counts[0]);
    expect(sum('channelConnected')).toBe(counts[1]);
    expect(sum('firstSend')).toBe(counts[2]);
    expect(sum('paid')).toBe(counts[3]);
  });

  it('cohort theo tháng đăng ký (giờ VN): tháng trước 3/3/2/1, tháng này 3/1/1/0', async () => {
    const { get } = await seedFunnel();
    const data = (await get()).body.data;
    const { rows } = await db.query(
      `SELECT to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS cur,
              to_char((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '1 month', 'YYYY-MM') AS prev`
    );
    const byKey = Object.fromEntries(data.cohorts.map((c) => [c.cohortKey, c]));
    expect(byKey[rows[0].prev]).toMatchObject({ registered: 3, channelConnected: 3, firstSend: 2, paid: 1, paidWithoutSend: 0 });
    expect(byKey[rows[0].cur]).toMatchObject({ registered: 3, channelConnected: 1, firstSend: 1, paid: 0, paidWithoutSend: 1 });
    // Khách đăng ký 14 tháng trước nằm ngoài cửa sổ 12 tháng → không có cohort của họ.
    expect(data.cohorts).toHaveLength(2);
  });

  it('"đã gửi" theo định nghĩa chung: email opened tính, gửi thử và email failed thì không; Zalo / Telegram tính', async () => {
    const { get } = await seedFunnel();
    const data = (await get()).body.data;
    // a1 (opened), a2 (Zalo), a5 (Telegram) = 3; a3 (chỉ failed) và a4 (chỉ gửi thử) không có tin đã gửi.
    expect(stepOf(data, 'firstSend').count).toBe(3);
    expect(data.timeToFirstSend.sentCount).toBe(3);
  });

  it('nối kênh gồm cả Telegram và WhatsApp; người đã gửi được tin thì chắc chắn từng nối kênh (kể cả đã gỡ tài khoản)', async () => {
    const { get, users } = await seedFunnel();
    const before = stepOf((await get()).body.data, 'channelConnected').count;
    // a4 chỉ nối WhatsApp → thêm 1 vào bước 2.
    await addWhatsappAccount(users.a4.id);
    const after = stepOf((await get()).body.data, 'channelConnected').count;
    expect(after).toBe(before + 1);
    // a5 không có tài khoản kênh nào nhưng đã gửi Telegram → vẫn nằm trong bước 2 (đã tính ở 4).
    expect(before).toBe(4);
  });

  it('thời gian tới tin đầu: trung vị 30 phút, 33,3% trong ≤ 10 phút; 33,3% khách ≥ 7 ngày chưa gửi trong 7 ngày đầu', async () => {
    const { get } = await seedFunnel();
    const t = (await get()).body.data.timeToFirstSend;
    expect(t.totalCustomers).toBe(6);
    expect(t.sentCount).toBe(3);
    expect(t.medianMinutes).toBe(30); // 5, 30, 120
    expect(t.pctUnder10).toBe(33.3); // chỉ a1 (5 phút)
    expect(t.eligibleAfter7d).toBe(3); // a1 a2 a3 (đăng ký tháng trước)
    expect(t.notSentAfter7d).toBe(1); // a3
    expect(t.pctNotSentAfter7d).toBe(33.3);
  });

  it('không có khách nào → mọi số 0, không lỗi', async () => {
    const admin = await createUser({ role: 'admin', username: 'empty_admin' });
    const token = await loginAs(admin);
    const res = await request(app).get('/api/admin/funnel/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.steps.map((s) => s.count)).toEqual([0, 0, 0, 0]);
    expect(res.body.data.steps.map((s) => s.pctOfPrevious)).toEqual([null, null, null, null]);
    expect(res.body.data.cohorts).toEqual([]);
    expect(res.body.data.timeToFirstSend).toMatchObject({ totalCustomers: 0, sentCount: 0, medianMinutes: null, pctUnder10: null });
  });

  it('?since= thu hẹp cửa sổ; sai định dạng → 400', async () => {
    const { get } = await seedFunnel();
    const { rows } = await db.query(
      `SELECT to_char(date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS m0`
    );
    const thisMonthOnly = (await get(`?since=${rows[0].m0}`)).body.data;
    expect(thisMonthOnly.steps.map((s) => s.count)).toEqual([3, 1, 1, 0]);
    expect((await get('?since=2026-13-40')).status).toBe(400);
    expect((await get('?since=abc')).status).toBe(400);
  });

  it('KHÔNG phụ thuộc audit USER_REGISTERED: dòng audit id_user NULL (như production) không làm bước "Đăng ký" về 1', async () => {
    const { get, users } = await seedFunnel();
    await db.query(
      `INSERT INTO audit_logs (id_user, owner_id, category, action, entity_type, entity_id)
       VALUES (NULL, NULL, 'system', 'USER_REGISTERED', 'user', $1)`,
      [users.a1.id]
    );
    expect(stepOf((await get()).body.data, 'registered').count).toBe(6);
  });
});

describe('ghi USER_REGISTERED có id_user (email và Google)', () => {
  let fetchSpy;
  afterEach(() => {
    fetchSpy?.mockRestore?.();
  });

  it('đăng ký bằng email: audit USER_REGISTERED có id_user = người vừa đăng ký', async () => {
    const email = 'audit_reg@test.local';
    await createVerificationCode({ email, code: '123456' });
    const res = await request(app).post('/api/auth/register').send({
      username: 'auditreg01',
      email,
      password: 'Passw0rd!',
      fullName: 'Audit Reg',
      phone: '0911000777',
      emailVerificationCode: '123456',
      consents: { terms: true, privacy: true, dpa: true },
    });
    expect(res.status).toBe(201);
    const userId = res.body.data.user.id;
    const { rows } = await db.query(
      `SELECT id_user, entity_id, details FROM audit_logs WHERE action = 'USER_REGISTERED' AND entity_id = $1`, [userId]
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id_user)).toBe(Number(userId));
    expect(rows[0].details).toMatchObject({ username: 'auditreg01', provider: 'local' });
  });

  it('đăng ký lần đầu bằng Google ghi USER_REGISTERED có id_user; đăng nhập lại lần 2 không ghi thêm', async () => {
    await createPlan({ code: 'trial', name: 'Gói dùng thử', price: 0, durationDays: 10, isActive: true });
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ email: 'audit_google@test.local', email_verified: true, name: 'Audit Google' }),
    });
    const body = { access_token: 'fake_google_access_token', consents: { terms: true, privacy: true, dpa: true } };
    const first = await request(app).post('/api/auth/google-login').send(body);
    expect(first.status).toBe(200);
    const userId = first.body.data.user.id;
    const rows = (await db.query(
      `SELECT id_user, details FROM audit_logs WHERE action = 'USER_REGISTERED' AND entity_id = $1`, [userId]
    )).rows;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].id_user)).toBe(Number(userId));
    expect(rows[0].details).toMatchObject({ provider: 'google' });

    const second = await request(app).post('/api/auth/google-login').send(body);
    expect(second.status).toBe(200);
    const again = await db.query(`SELECT 1 FROM audit_logs WHERE action = 'USER_REGISTERED' AND entity_id = $1`, [userId]);
    expect(again.rows).toHaveLength(1);
  });
});

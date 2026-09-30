/**
 * PR-9 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — trang Thành viên theo MỘT định nghĩa "khách".
 *
 * Bộ dữ liệu hỗn hợp ở helpers/adminCustomers.js (đã đếm tay từng dòng), dùng chung với test Tổng quan
 * (adminStats.test.js) nên file này kiểm luôn "các màn khớp nhau". Hợp đồng cũ của /api/admin/members (lọc theo gói,
 * hạn, SĐT, thao tác) vẫn ở adminMembers.test.js.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan } from './helpers/db.js';
import { seedCustomerMix, setPlan, daysFromNow } from './helpers/adminCustomers.js';

let app;
const originalInternalIds = process.env.INTERNAL_USER_IDS;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
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

const usernames = (res) => res.body.data.map((m) => m.username).sort();

describe('danh sách mặc định chỉ có KHÁCH, đầu trang khớp tay', () => {
  async function seedAndLogin() {
    const seed = await seedCustomerMix();
    process.env.INTERNAL_USER_IDS = String(seed.internal.id);
    const token = await loginAs(seed.admin);
    const get = (query = '') => request(app).get(`/api/admin/members${query}`).set('Authorization', `Bearer ${token}`);
    return { seed, get, token };
  }

  it('mặc định: 8 khách — không nhân viên thuần, không nội bộ, không đã xoá, không admin', async () => {
    const { seed, get } = await seedAndLogin();
    const res = await get();
    expect(res.status).toBe(200);
    expect(usernames(res)).toEqual(
      [seed.c1, seed.c2, seed.c3, seed.c4, seed.c5, seed.c6, seed.c7, seed.e2].map((u) => u.username).sort()
    );
  });

  it('nhân viên có gói trả tiền RIÊNG vẫn là khách (e2); nhân viên thuần thì không (e1)', async () => {
    const { seed, get } = await seedAndLogin();
    const customers = usernames(await get());
    expect(customers).toContain(seed.e2.username);
    expect(customers).not.toContain(seed.e1.username);
    expect(usernames(await get('?segment=employee'))).toEqual([seed.e1.username]);
  });

  it('segment=internal / deleted / all; giá trị lạ về mặc định', async () => {
    const { seed, get } = await seedAndLogin();
    expect(usernames(await get('?segment=internal'))).toEqual([seed.internal.username]);
    expect(usernames(await get('?segment=deleted'))).toEqual([seed.deleted.username]);
    const all = usernames(await get('?segment=all'));
    // 8 khách + e1 + nội bộ + đã xoá = 11; admin có tab riêng nên không nằm trong "all".
    expect(all).toHaveLength(11);
    expect(all).not.toContain(seed.admin.username);
    expect(usernames(await get('?segment=banana'))).toHaveLength(8);
  });

  it('mỗi dòng mang nhóm (segment) và trạng thái gói (planState) đúng', async () => {
    const { seed, get } = await seedAndLogin();
    const res = await get('?segment=all');
    const by = Object.fromEntries(res.body.data.map((m) => [m.username, m]));
    expect(by[seed.c1.username]).toMatchObject({ segment: 'customer', planState: 'paying' });
    expect(by[seed.c4.username]).toMatchObject({ segment: 'customer', planState: 'trial' });
    expect(by[seed.c5.username]).toMatchObject({ segment: 'customer', planState: 'trial' });
    expect(by[seed.c7.username]).toMatchObject({ segment: 'customer', planState: 'expired' });
    expect(by[seed.e1.username]).toMatchObject({ segment: 'employee' });
    expect(by[seed.internal.username]).toMatchObject({ segment: 'internal' });
    expect(by[seed.deleted.username]).toMatchObject({ segment: 'deleted' });
  });

  it('GET /summary: Khách · Đang trả tiền · Đang dùng thử · Sắp hết hạn 7 ngày · Đã hết hạn 30 ngày', async () => {
    const { seed, get } = await seedAndLogin();
    const res = await get('/summary');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      customers: 8,
      paying: seed.expected.payingCustomers,
      trial: seed.expected.trialCustomers,
      expiring7d: 1, // c1 (còn 3 ngày)
      expiring7dPaying: seed.expected.expiringPaid7d,
      expired30d: 1, // c7 (hết hạn 5 ngày trước)
      employees: 1,
      internal: 1,
      deleted: 1,
    });
  });

  it('/summary cần quyền admin', async () => {
    const user = await createUser({ role: 'user', username: 'plain_user' });
    const token = await loginAs(user);
    const res = await request(app).get('/api/admin/members/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('bấm thẻ (planState) ra ĐÚNG số dòng đã đếm ở đầu trang', async () => {
    const { get } = await seedAndLogin();
    const summary = (await get('/summary')).body.data;
    expect((await get('?planState=paying')).body.data).toHaveLength(summary.paying);
    expect((await get('?planState=trial')).body.data).toHaveLength(summary.trial);
    expect((await get('?planState=expiring')).body.data).toHaveLength(summary.expiring7d);
    expect((await get('?planState=expired30')).body.data).toHaveLength(summary.expired30d);
  });

  it('khớp Tổng quan: khách / trả tiền / dùng thử / sắp hết hạn ở Thành viên = ở Tổng quan', async () => {
    const { seed, get, token } = await seedAndLogin();
    const summary = (await get('/summary')).body.data;
    const overview = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${token}`);
    expect(overview.body.data.kpi.totalCustomers).toBe(summary.customers);
    expect(overview.body.data.kpi.payingCustomers).toBe(summary.paying);
    expect(overview.body.data.kpi.trialCustomers).toBe(summary.trial);
    expect(overview.body.data.kpi.expiringPaid7d).toBe(summary.expiring7dPaying);
    expect(summary.paying).toBe(seed.expected.payingCustomers);
  });

  it('đã bỏ cột "% AI" và "Gửi lỗi 30 ngày" (số sai kỳ/sai nguồn, đã có ở trang AI và Giám sát)', async () => {
    const { get } = await seedAndLogin();
    const row = (await get()).body.data[0];
    expect(row).not.toHaveProperty('aiCreditsUsedThisMonth');
    expect(row).not.toHaveProperty('aiCreditsLimit');
    expect(row).not.toHaveProperty('failedSends30d');
  });

  it('employeeCount đếm như cổng thêm nhân viên: chỉ active và tài khoản chưa xoá', async () => {
    const { seed, get } = await seedAndLogin();
    const inactiveStaff = await createUser({ username: 'inactive_staff', withPlan: false });
    const removedStaff = await createUser({ username: 'removed_staff', withPlan: false, status: 'deleted' });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, status) VALUES ($1, $2, 'inactive'), ($1, $3, 'active')`,
      [seed.c1.id, inactiveStaff.id, removedStaff.id]
    );
    const row = (await get()).body.data.find((m) => m.username === seed.c1.username);
    // c1 có e1, e2 (active, chưa xoá) → 2; nhân viên inactive và tài khoản đã xoá không tính.
    expect(Number(row.employeeCount)).toBe(2);
  });

  it('role không còn nội suy vào SQL: role=admin trả admin, giá trị khác trả danh sách khách', async () => {
    const { seed, get } = await seedAndLogin();
    expect(usernames(await get('?role=admin'))).toEqual([seed.admin.username]);
    const injected = await get("?role=user' OR '1'='1");
    expect(injected.status).toBe(200);
    expect(usernames(injected)).toHaveLength(8);
  });
});

describe('"Hoạt động gần nhất" và lý do "nguy cơ rời bỏ"', () => {
  async function setLastLogin(userId, daysAgo) {
    await db.query(`UPDATE users SET last_login_at = $1 WHERE id = $2`, [daysFromNow(-daysAgo), userId]);
  }
  async function addRefreshToken(userId, daysAgo) {
    await db.query(
      `INSERT INTO refresh_tokens (id_user, token_hash, expires_at, created_at) VALUES ($1, $2, NOW() + INTERVAL '7 days', $3)`,
      [userId, `hash-${userId}-${daysAgo}`, daysFromNow(-daysAgo)]
    );
  }

  it('đăng nhập bằng mật khẩu cách đây 40 ngày nhưng refresh token cách đây 2 ngày → còn hoạt động, KHÔNG nguy cơ', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const steady = await createUser({ username: 'steady', withPlan: false });
    await setLastLogin(steady.id, 40);
    await addRefreshToken(steady.id, 2);
    const idle = await createUser({ username: 'idle', withPlan: false });
    await setLastLogin(idle.id, 40);
    const token = await loginAs(admin);
    const res = await request(app).get('/api/admin/members').set('Authorization', `Bearer ${token}`);
    const by = Object.fromEntries(res.body.data.map((m) => [m.username, m]));

    expect(by.steady.churnRisk).toBe(false);
    expect(by.steady.churnRiskReason).toBeNull();
    expect(new Date(by.steady.lastActivityAt).getTime()).toBeGreaterThan(Date.now() - 3 * 86400000);
    expect(by.idle.churnRisk).toBe(true);
    expect(by.idle.churnRiskReason).toBe('inactive_21d');
  });

  it('lý do bằng mã: chưa từng hoạt động / sắp hết hạn; người còn hoạt động không bị gắn nguy cơ', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'churn-plan', price: 299000 });
    await createUser({ username: 'never_seen', withPlan: false });
    const expiring = await createUser({ username: 'about_to_expire', withPlan: false });
    await setPlan(expiring.id, plan.id, daysFromNow(3));
    await setLastLogin(expiring.id, 1);
    const fine = await createUser({ username: 'all_good', withPlan: false });
    await setLastLogin(fine.id, 1);
    const token = await loginAs(admin);
    const res = await request(app).get('/api/admin/members').set('Authorization', `Bearer ${token}`);
    const by = Object.fromEntries(res.body.data.map((m) => [m.username, m]));

    expect(by.never_seen.churnRiskReason).toBe('never_active');
    expect(by.about_to_expire.churnRiskReason).toBe('expiring_7d');
    expect(by.all_good.churnRisk).toBe(false);
  });
});

/**
 * Integration tests cho `/api/admin/stats/overview` — Tổng quan admin.
 *
 * PR-9 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30): 6 số theo MỘT định nghĩa "khách" (customerDefinitions.js) và MỘT
 * định nghĩa doanh thu (revenueDefinitions.js). Bộ dữ liệu ở helpers/adminCustomers.js, đã đếm tay từng dòng; các số
 * mong đợi nằm trong `seed.expected` chứ không tính từ mã đang test.
 *
 * Bug cũ mà test này ghim:
 *   - Repo từng query `status = 'completed'` (schema thật dùng 'success') → doanh thu luôn 0.
 *   - "Đăng ký mới" / "tổng thành viên" gồm nhân viên, tài khoản nội bộ, tài khoản đã xoá (C-07).
 *   - "Đơn hoàn thành" đếm cả đơn dùng thử 0đ; "Paying" gồm dùng thử (C-05, C-06).
 *   - Doanh thu theo `created_at` thay vì lúc trả tiền (C-13); biểu đồ 6 tháng cuộn theo NOW() (C-09).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan } from './helpers/db.js';
import { seedCustomerMix, insertOrder, setPlan, vnMonthStart, daysFromNow } from './helpers/adminCustomers.js';

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

async function getOverview(admin) {
  const t = await loginAs(admin);
  const res = await request(app).get('/api/admin/stats/overview').set('Authorization', `Bearer ${t}`);
  expect(res.status).toBe(200);
  return res.body.data;
}

describe('Authorization — /api/admin/stats/overview', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/admin/stats/overview');
    expect(res.status).toBe(401);
  });

  it('user/employee → 403', async () => {
    const u = await createUser({ role: 'user', username: 'u1' });
    const e = await createUser({ role: 'employee', username: 'e1' });
    const r1 = await request(app)
      .get('/api/admin/stats/overview')
      .set('Authorization', `Bearer ${await loginAs(u)}`);
    const r2 = await request(app)
      .get('/api/admin/stats/overview')
      .set('Authorization', `Bearer ${await loginAs(e)}`);
    expect(r1.status).toBe(403);
    expect(r2.status).toBe(403);
  });

  it('admin → 200, payload gồm kpi + biểu đồ + 2 bảng, KHÔNG còn biểu đồ tròn / ghi chú migration', async () => {
    const a = await createUser({ role: 'admin', username: 'sa' });
    const data = await getOverview(a);
    expect(data).toHaveProperty('kpi');
    expect(data).toHaveProperty('monthlyRevenue');
    expect(data).toHaveProperty('recentOrders');
    expect(data).toHaveProperty('recentMembers');
    expect(data).not.toHaveProperty('planDistribution');
    expect(data).not.toHaveProperty('dataSince');
    expect(data).not.toHaveProperty('dataSinceNote');
    for (const removed of ['activeMembers', 'totalMembers', 'totalEmployees', 'payingActiveMembers', 'activationRate', 'churnRate']) {
      expect(data.kpi).not.toHaveProperty(removed);
    }
  });
});

describe('6 số Tổng quan khớp tay (bộ dữ liệu hỗn hợp)', () => {
  it('doanh thu, đơn đã trả, khách trả tiền, dùng thử, đăng ký mới, sắp hết hạn', async () => {
    const seed = await seedCustomerMix();
    process.env.INTERNAL_USER_IDS = String(seed.internal.id);

    const { kpi } = await getOverview(seed.admin);
    const x = seed.expected;

    // 1. Doanh thu tháng này (đã trừ hoàn) + nguồn.
    expect(kpi.revenueThisMonth).toBe(x.revenueThisMonth);
    expect(kpi.revenueBySource).toEqual(x.revenueBySource);
    expect(kpi.revenueBySource.plan + kpi.revenueBySource.topup + kpi.revenueBySource.manual).toBe(kpi.revenueThisMonth);
    expect(kpi.refundedThisMonth).toBe(x.refundedThisMonth);
    // 2. Đơn đã trả: amount > 0 — không có đơn free 0đ / voucher 0đ / hoàn / huỷ.
    expect(kpi.paidOrdersThisMonth).toBe(x.paidOrdersThisMonth);
    // 3. Khách trả tiền + dùng thử: loại nhân viên thuần (e1), nội bộ, đã xoá, admin.
    expect(kpi.totalCustomers).toBe(x.totalCustomers);
    expect(kpi.payingCustomers).toBe(x.payingCustomers);
    expect(kpi.trialCustomers).toBe(x.trialCustomers);
    // 4. Đăng ký mới tháng này: c1 c2 c3 c4 c5 e2 (c6, c7 tạo cách đây 40 ngày; e1 / nội bộ / đã xoá / admin không phải khách).
    expect(kpi.newCustomersThisMonth).toBe(6);
    // 5. Sắp hết hạn 7 ngày: chỉ khách TRẢ TIỀN (c1); c4 (dùng thử, còn 10 ngày) và e1 không tính.
    expect(kpi.expiringPaid7d).toBe(x.expiringPaid7d);
    // 6. Cần xử lý: đơn huỷ-nhưng-đã-trả chưa xử lý (đơn đã bấm "đã xử lý" không tính).
    expect(kpi.attention.paidAfterCancelled).toEqual({
      count: x.paidAfterCancelledCount,
      amount: x.paidAfterCancelledAmount,
    });
  });

  it('nhãn kỳ + phần trăm so kỳ trước: kỳ trước = 0 → null (không còn +100% giả)', async () => {
    const seed = await seedCustomerMix();
    process.env.INTERNAL_USER_IDS = String(seed.internal.id);
    const { kpi } = await getOverview(seed.admin);
    expect(kpi.monthKey).toMatch(/^\d{4}-\d{2}$/);
    expect(kpi.monthLabel).toMatch(/^\d{2}\/\d{4}$/);
    // Kỳ trước (đầu tháng trước → cùng ngày giờ) không có đơn nào → không có phần trăm hợp lệ.
    expect(kpi.revenueMomPct === null || typeof kpi.revenueMomPct === 'number').toBe(true);
  });

  it('danh sách tài khoản nội bộ đọc từ env INTERNAL_USER_IDS (đổi env → số khách đổi)', async () => {
    const seed = await seedCustomerMix();
    process.env.INTERNAL_USER_IDS = String(seed.internal.id);
    const withInternal = (await getOverview(seed.admin)).kpi;

    // Coi c4 là nội bộ: khách giảm 1 và dùng thử giảm 1.
    process.env.INTERNAL_USER_IDS = `${seed.internal.id},${seed.c4.id}`;
    const also = (await getOverview(seed.admin)).kpi;
    expect(also.totalCustomers).toBe(withInternal.totalCustomers - 1);
    expect(also.trialCustomers).toBe(withInternal.trialCustomers - 1);
    expect(also.payingCustomers).toBe(withInternal.payingCustomers);
  });

  it('không có khách nào → mọi số = 0 (không phải 1 do LEFT JOIN)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const { kpi } = await getOverview(admin);
    expect(kpi.totalCustomers).toBe(0);
    expect(kpi.payingCustomers).toBe(0);
    expect(kpi.trialCustomers).toBe(0);
    expect(kpi.newCustomersThisMonth).toBe(0);
    expect(kpi.expiringPaid7d).toBe(0);
    expect(kpi.revenueThisMonth).toBe(0);
    expect(kpi.paidOrdersThisMonth).toBe(0);
    expect(kpi.attention).toMatchObject({ paidAfterCancelled: { count: 0, amount: 0 }, stuckEinvoices: 0, overdueWithdrawals: 0, total: 0 });
  });
});

describe('khách trả tiền — định nghĩa theo ĐƠN, không chỉ theo giá gói', () => {
  it('gói có giá nhưng chỉ có đơn "gán miễn phí" 0đ → dùng thử; có đơn thu tiền → trả tiền', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p299', price: 299000 });
    const free = await createUser({ username: 'granted', withPlan: false });
    const paid = await createUser({ username: 'buyer', withPlan: false });
    await setPlan(free.id, plan.id, daysFromNow(30));
    await setPlan(paid.id, plan.id, daysFromNow(30));
    await insertOrder({ userId: free.id, planId: plan.id, amount: 0, paymentMethod: 'free', paidAt: new Date() });
    await insertOrder({ userId: paid.id, planId: plan.id, amount: 299000, paidAt: new Date() });

    const { kpi } = await getOverview(admin);
    expect(kpi.payingCustomers).toBe(1);
    expect(kpi.trialCustomers).toBe(1);
  });

  it('đơn gói GẦN NHẤT quyết định: mới nhất là "gán miễn phí" thì không còn tính là trả tiền', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p299b', price: 299000 });
    const u = await createUser({ username: 'was_paying', withPlan: false });
    await setPlan(u.id, plan.id, daysFromNow(30));
    await insertOrder({ userId: u.id, planId: plan.id, amount: 299000, paidAt: daysFromNow(-40), createdAt: daysFromNow(-40) });
    await insertOrder({ userId: u.id, planId: plan.id, amount: 0, paymentMethod: 'free', paidAt: daysFromNow(-1), createdAt: daysFromNow(-1) });

    const { kpi } = await getOverview(admin);
    expect(kpi.payingCustomers).toBe(0);
    expect(kpi.trialCustomers).toBe(1);
  });

  it('gói hết hạn không còn là trả tiền / dùng thử (kể cả còn active_plan_id trong ân hạn)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p299c', price: 299000 });
    const u = await createUser({ username: 'grace', withPlan: false });
    await setPlan(u.id, plan.id, daysFromNow(-1));
    await insertOrder({ userId: u.id, planId: plan.id, amount: 299000, paidAt: daysFromNow(-31), createdAt: daysFromNow(-31) });

    const { kpi } = await getOverview(admin);
    expect(kpi.totalCustomers).toBe(1);
    expect(kpi.payingCustomers).toBe(0);
    expect(kpi.trialCustomers).toBe(0);
  });
});

describe('doanh thu theo MỐC TRẢ TIỀN, đơn hoàn tự rơi khỏi tổng', () => {
  it('đơn tạo cuối tháng trước, trả đầu tháng này → thuộc tháng này (không theo created_at)', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'pb', price: 100000 });
    const u = await createUser({ username: 'edge', withPlan: false });
    const thisMonth = await vnMonthStart(0);
    await insertOrder({
      userId: u.id, planId: plan.id, amount: 123000,
      createdAt: new Date(thisMonth.getTime() - 10 * 60000), paidAt: new Date(thisMonth.getTime() + 5 * 60000),
    });

    const data = await getOverview(admin);
    expect(data.kpi.revenueThisMonth).toBe(123000);
    const months = data.monthlyRevenue;
    expect(months[months.length - 1].revenue).toBe(123000);
    expect(months[months.length - 2].revenue).toBe(0);
  });

  it('đơn chưa có paid_at (dữ liệu cũ) rơi về created_at', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'pc', price: 100000 });
    const u = await createUser({ username: 'legacy', withPlan: false });
    const lastMonth = await vnMonthStart(-1);
    await insertOrder({ userId: u.id, planId: plan.id, amount: 77000, createdAt: new Date(lastMonth.getTime() + 3600000), paidAt: null });

    const data = await getOverview(admin);
    expect(data.kpi.revenueThisMonth).toBe(0);
    expect(data.monthlyRevenue[data.monthlyRevenue.length - 2].revenue).toBe(77000);
  });

  it('đơn 0đ (free / voucher 100%) không phải "đơn đã trả" dù status = success', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'pd', price: 100000 });
    const u = await createUser({ username: 'zero', withPlan: false });
    await insertOrder({ userId: u.id, planId: plan.id, amount: 0, paymentMethod: 'free', paidAt: new Date() });
    await insertOrder({ userId: u.id, planId: plan.id, amount: 0, paymentMethod: 'voucher', paidAt: new Date() });
    await insertOrder({ userId: u.id, planId: plan.id, amount: 40000, paidAt: new Date() });

    const { kpi } = await getOverview(admin);
    expect(kpi.paidOrdersThisMonth).toBe(1);
    expect(kpi.revenueThisMonth).toBe(40000);
  });
});

describe('biểu đồ 6 tháng dương lịch đầy đủ', () => {
  it('luôn đúng 6 cột liên tiếp (tháng này + 5 tháng trước), tháng không có đơn = 0', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'pe', price: 100000 });
    const u = await createUser({ username: 'chart', withPlan: false });
    // Chỉ 1 đơn 3 tháng trước; các tháng còn lại phải hiện 0 thay vì biến mất.
    const threeAgo = await vnMonthStart(-3);
    await insertOrder({ userId: u.id, planId: plan.id, amount: 55000, paidAt: new Date(threeAgo.getTime() + 86400000) });
    // Đơn 7 tháng trước nằm NGOÀI cửa sổ.
    const sevenAgo = await vnMonthStart(-7);
    await insertOrder({ userId: u.id, planId: plan.id, amount: 999000, paidAt: new Date(sevenAgo.getTime() + 86400000) });

    const { monthlyRevenue: months } = await getOverview(admin);
    expect(months).toHaveLength(6);
    expect(months.map((m) => m.revenue)).toEqual([0, 0, 55000, 0, 0, 0]);
    expect(months.map((m) => m.paidOrders)).toEqual([0, 0, 1, 0, 0, 0]);
    // 6 khoá tháng liên tiếp, cột cuối là tháng này.
    const keys = months.map((m) => m.monthKey);
    expect(new Set(keys).size).toBe(6);
    const { rows } = await db.query(`SELECT to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS k`);
    expect(keys[5]).toBe(rows[0].k);
  });
});

describe('Cần xử lý — hoá đơn kẹt + rút tiền quá hạn', () => {
  it('đếm hoá đơn kẹt (theo định nghĩa của cảnh báo) và yêu cầu rút quá 7 ngày làm việc', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'pf', price: 100000 });
    const buyer = await createUser({ username: 'attention', withPlan: false });
    const order = await insertOrder({ userId: buyer.id, planId: plan.id, amount: 100000, paidAt: new Date() });
    // Hoá đơn lỗi hẳn (mã lỗi không nằm trong danh sách thử lại) → "kẹt"; hoá đơn đã phát hành thì không.
    await db.query(
      `INSERT INTO einvoices (order_id, ma_tra_cuu, mtchieu, status, error_code) VALUES ($1, 'STUCK1', 'MT', 'failed', 'BAD_TAX_CODE')`,
      [order.id]
    );
    const okOrder = await insertOrder({ userId: buyer.id, planId: plan.id, amount: 100000, paidAt: new Date() });
    await db.query(
      `INSERT INTO einvoices (order_id, ma_tra_cuu, mtchieu, status, so_hdon) VALUES ($1, 'OKINV', 'MT', 'issued', '0000001')`,
      [okOrder.id]
    );

    // Mỗi người chỉ được có MỘT yêu cầu pending (idx_affiliate_withdrawals_one_pending) → mỗi ca một người.
    const insertWithdrawal = (userId, status, requestedAt) => db.query(
      `INSERT INTO affiliate_withdrawals (user_id, amount_gross, tax_amount, amount_net, full_name, bank_name,
                                          bank_account_number, bank_account_name, status, requested_at)
       VALUES ($1, 1000000, 100000, 900000, 'A', 'B', '1', 'A', $2, $3)`,
      [userId, status, requestedAt]
    );
    const partner2 = await createUser({ username: 'partner2', withPlan: false });
    const partner3 = await createUser({ username: 'partner3', withPlan: false });
    await insertWithdrawal(buyer.id, 'pending', daysFromNow(-30)); // quá hạn
    await insertWithdrawal(partner2.id, 'pending', daysFromNow(-1)); // còn hạn
    await insertWithdrawal(partner3.id, 'paid', daysFromNow(-30)); // đã chi — không phải việc cần xử lý

    const { kpi } = await getOverview(admin);
    expect(kpi.attention.stuckEinvoices).toBe(1);
    expect(kpi.attention.overdueWithdrawals).toBe(1);
    expect(kpi.attention.total).toBe(2);
  });
});

describe('bảng "Thành viên mới" chỉ có khách; "Đơn hàng gần nhất" tối đa 10', () => {
  it('recentMembers loại nhân viên thuần, nội bộ, đã xoá, admin', async () => {
    const seed = await seedCustomerMix();
    process.env.INTERNAL_USER_IDS = String(seed.internal.id);
    const { recentMembers } = await getOverview(seed.admin);
    const emails = recentMembers.map((m) => m.email).sort();
    expect(emails).toEqual(
      [seed.c1, seed.c2, seed.c3, seed.c4, seed.c5, seed.c6, seed.c7, seed.e2].map((u) => u.email).sort()
    );
  });

  it('recentOrders trả tối đa 10, sort created_at DESC', async () => {
    const admin = await createUser({ role: 'admin', username: 'sa' });
    const plan = await createPlan({ code: 'p' });
    const u = await createUser({ role: 'user', username: 'u1', email: 'u@b.com' });
    for (let i = 0; i < 12; i += 1) {
      await insertOrder({ userId: u.id, planId: plan.id, amount: 1000, email: u.email });
    }
    const { recentOrders } = await getOverview(admin);
    expect(recentOrders).toHaveLength(10);
  });
});

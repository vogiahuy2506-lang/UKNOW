/**
 * PR-9 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — trang Đơn hàng: KPI THEO BỘ LỌC, mốc kỳ = ngày trả tiền,
 * "Đến ngày" gồm trọn ngày cuối, lọc "Thất bại" và "cần chú ý"; danh sách Hoá đơn dùng cùng cách tính "đến ngày".
 *
 * Bộ dữ liệu dựng với mốc GHI CỨNG (giờ VN) và khoảng lọc 01/09–30/09/2026, nên kết quả không phụ thuộc hôm nay là
 * ngày nào (riêng ca "pending quá hạn" dùng mốc tương đối và tự dựng dữ liệu). Bảng chân lý đếm tay nằm cạnh từng đơn.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan } from './helpers/db.js';
import { insertOrder } from './helpers/adminCustomers.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
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

const vn = (iso) => new Date(`${iso}+07:00`);

/**
 * 9 đơn quanh ranh giới tháng 9/2026 (giờ VN):
 *   o1 100k  trả 31/08 23:30                → NGOÀI kỳ (tháng 8)
 *   o2 200k  trả 01/09 00:10                → trong kỳ (đầu kỳ)
 *   o3 300k  trả 30/09 23:59                → trong kỳ, NGÀY CUỐI (mất nếu "đến ngày" loại ngày cuối)
 *   o4 400k  trả 01/10 00:01                → NGOÀI kỳ (tháng 10)
 *   o5  50k  hoàn — trả 10/09, hoàn 15/09    → "Đã hoàn" tháng 9
 *   o6   0đ  free — trả 15/09               → không phải đơn đã trả
 *   o7  70k  failed — tạo 20/09             → cần xử lý
 *   o8  90k  huỷ nhưng tiền đã vào (chưa xử lý) — tạo 21/09 → cần xử lý
 *   o9  25k  hoàn — trả 20/08, hoàn 05/09    → "Đã hoàn" tháng 9 dù trả từ tháng 8
 */
async function seed() {
  const admin = await createUser({ role: 'admin', username: 'orders_admin' });
  const plan = await createPlan({ code: 'kpi-plan', price: 100000 });
  const a = await createUser({ username: 'buyer_a', email: 'buyer_a@kpi.test', withPlan: false });
  const b = await createUser({ username: 'buyer_b', email: 'buyer_b@kpi.test', withPlan: false });
  const mk = (user, fields) => insertOrder({ userId: user.id, planId: plan.id, email: user.email, ...fields });

  const o1 = await mk(a, { amount: 100000, paidAt: vn('2026-08-31T23:30:00'), createdAt: vn('2026-08-31T23:00:00') });
  const o2 = await mk(a, { amount: 200000, paidAt: vn('2026-09-01T00:10:00'), createdAt: vn('2026-08-31T23:58:00') });
  const o3 = await mk(b, { amount: 300000, paidAt: vn('2026-09-30T23:59:00'), createdAt: vn('2026-09-30T23:50:00') });
  const o4 = await mk(b, { amount: 400000, paidAt: vn('2026-10-01T00:01:00'), createdAt: vn('2026-09-30T23:55:00') });
  const o5 = await mk(a, {
    amount: 50000, status: 'refunded', paidAt: vn('2026-09-10T10:00:00'), createdAt: vn('2026-09-10T09:50:00'), refundedAt: vn('2026-09-15T10:00:00'),
  });
  const o6 = await mk(a, {
    amount: 0, paymentMethod: 'free', paidAt: vn('2026-09-15T08:00:00'), createdAt: vn('2026-09-15T08:00:00'),
  });
  const o7 = await mk(b, { amount: 70000, status: 'failed', createdAt: vn('2026-09-20T09:00:00') });
  const o8 = await mk(b, {
    amount: 90000, status: 'cancelled', createdAt: vn('2026-09-21T09:00:00'),
    note: '[OPS] PAID_AFTER_CANCELLED order status=cancelled webhook_amount=90000',
  });
  const o9 = await mk(a, {
    amount: 25000, status: 'refunded', paidAt: vn('2026-08-20T10:00:00'), createdAt: vn('2026-08-20T09:50:00'), refundedAt: vn('2026-09-05T10:00:00'),
  });
  const token = await loginAs(admin);
  const get = (query = '') => request(app).get(`/api/admin/orders${query}`).set('Authorization', `Bearer ${token}`);
  return { admin, a, b, plan, get, o: { o1, o2, o3, o4, o5, o6, o7, o8, o9 } };
}

const codes = (res) => res.body.data.orders.map((x) => String(x.orderCode));

describe('KPI theo bộ lọc khoảng ngày (01/09 – 30/09/2026)', () => {
  it('doanh thu / đơn đã trả / đã hoàn / cần xử lý khớp tay; "đến ngày" gồm trọn ngày cuối', async () => {
    const { get } = await seed();
    const res = await get('?dateFrom=2026-09-01&dateTo=2026-09-30');
    expect(res.status).toBe(200);
    expect(res.body.data.kpi).toEqual({
      revenue: 500000, // o2 200k + o3 300k (o3 trả 23:59 ngày 30 — ngày cuối); o1/o4 ngoài kỳ, o5/o9 đã hoàn, o6 0đ
      paidOrders: 2,
      refunded: 75000, // o5 (hoàn 15/09) + o9 (hoàn 05/09, dù trả từ tháng 8)
      needsAction: 2, // o7 failed + o8 tiền đã vào nhưng đơn huỷ
      period: { from: '2026-09-01', to: '2026-09-30' },
    });
  });

  it('mốc kỳ = ngày TRẢ TIỀN: o2 tạo 31/08 nhưng trả 01/09 → thuộc tháng 9; o4 tạo 30/09 nhưng trả 01/10 → tháng 10', async () => {
    const { get, o } = await seed();
    const res = await get('?dateFrom=2026-09-01&dateTo=2026-09-30');
    const inPeriod = codes(res);
    expect(inPeriod).toContain(String(o.o2.order_code));
    expect(inPeriod).not.toContain(String(o.o4.order_code));
    expect(inPeriod).not.toContain(String(o.o1.order_code));
  });

  it('danh sách và KPI cùng một tập: "đến ngày" gồm ngày cuối cho cả hai', async () => {
    const { get, o } = await seed();
    const res = await get('?dateFrom=2026-09-01&dateTo=2026-09-30');
    // o2 o3 o5 o6 o7 o8 (o9 trả từ tháng 8, o1 o4 ngoài kỳ)
    expect(codes(res).sort()).toEqual(
      [o.o2, o.o3, o.o5, o.o6, o.o7, o.o8].map((x) => String(x.order_code)).sort()
    );
    expect(Number(res.body.data.total)).toBe(6);
    // Cắt kỳ ngay trước ngày cuối: o3 (30/09 23:59) phải biến mất khỏi CẢ danh sách lẫn doanh thu.
    const before = await get('?dateFrom=2026-09-01&dateTo=2026-09-29');
    expect(codes(before)).not.toContain(String(o.o3.order_code));
    expect(before.body.data.kpi.revenue).toBe(200000);
    // Đúng ngày cuối: chỉ o3.
    const lastDay = await get('?dateFrom=2026-09-30&dateTo=2026-09-30');
    expect(codes(lastDay)).toEqual([String(o.o3.order_code)]);
    expect(lastDay.body.data.kpi.revenue).toBe(300000);
  });

  it('không có bộ lọc = toàn thời gian', async () => {
    const { get } = await seed();
    const res = await get();
    expect(res.body.data.kpi).toEqual({
      revenue: 1000000, // o1 + o2 + o3 + o4
      paidOrders: 4,
      refunded: 75000,
      needsAction: 2,
      period: { from: null, to: null },
    });
  });

  it('bộ lọc TRẠNG THÁI chỉ thu hẹp danh sách, KPI vẫn theo kỳ (lọc "Thất bại" không làm doanh thu về 0)', async () => {
    const { get, o } = await seed();
    const res = await get('?status=failed&dateFrom=2026-09-01&dateTo=2026-09-30');
    expect(codes(res)).toEqual([String(o.o7.order_code)]);
    expect(res.body.data.kpi.revenue).toBe(500000);
    expect(res.body.data.kpi.paidOrders).toBe(2);
  });

  it('ô tìm kiếm áp cho cả KPI: buyer_a chỉ có o2 (200k) trong kỳ', async () => {
    const { get } = await seed();
    const res = await get('?dateFrom=2026-09-01&dateTo=2026-09-30&search=buyer_a@');
    expect(res.body.data.kpi.revenue).toBe(200000);
    expect(res.body.data.kpi.paidOrders).toBe(1);
    expect(res.body.data.kpi.refunded).toBe(75000);
    expect(res.body.data.kpi.needsAction).toBe(0);
  });

  it('ngày sai định dạng / không tồn tại → 400, không phải 500', async () => {
    const { get } = await seed();
    expect((await get('?dateFrom=2026-02-30')).status).toBe(400);
    expect((await get('?dateTo=abc')).status).toBe(400);
    expect((await get("?dateTo=2026-09-30';DROP TABLE orders;--")).status).toBe(400);
  });
});

describe('lọc "Thất bại" và "cần chú ý"', () => {
  it('status=failed trả đơn failed', async () => {
    const { get, o } = await seed();
    const res = await get('?status=failed');
    expect(codes(res)).toEqual([String(o.o7.order_code)]);
  });

  it('attention=paid_after_cancelled → đơn huỷ nhưng tiền đã vào; đơn đã bấm "đã xử lý" thì hết', async () => {
    const { get, o } = await seed();
    expect(codes(await get('?attention=paid_after_cancelled'))).toEqual([String(o.o8.order_code)]);
    await db.query(
      `UPDATE orders SET note = note || E'\\n[OPS] PAID_AFTER_CANCELLED_HANDLED by admin' WHERE id = $1`,
      [o.o8.id]
    );
    expect(codes(await get('?attention=paid_after_cancelled'))).toEqual([]);
    // Đã xử lý thì cũng rơi khỏi "Cần xử lý" (chỉ còn đơn failed).
    expect((await get('?dateFrom=2026-09-01&dateTo=2026-09-30')).body.data.kpi.needsAction).toBe(1);
  });

  it('attention=needs_action khớp thẻ "Cần xử lý": failed + tiền đã vào nhưng đơn huỷ', async () => {
    const { get, o } = await seed();
    const res = await get('?attention=needs_action&dateFrom=2026-09-01&dateTo=2026-09-30');
    expect(codes(res).sort()).toEqual([o.o7, o.o8].map((x) => String(x.order_code)).sort());
    expect(Number(res.body.data.total)).toBe(res.body.data.kpi.needsAction);
  });

  it('giá trị attention lạ bị bỏ qua (không lọc, không lỗi)', async () => {
    const { get } = await seed();
    const res = await get('?attention=banana&dateFrom=2026-09-01&dateTo=2026-09-30');
    expect(res.status).toBe(200);
    expect(Number(res.body.data.total)).toBe(6);
  });

  it('pending chờ thanh toán quá 2 giờ (tạo trong 48 giờ) là "cần xử lý"; mới tạo / bỏ dở từ lâu thì không', async () => {
    const admin = await createUser({ role: 'admin', username: 'pending_admin' });
    const plan = await createPlan({ code: 'pend', price: 100000 });
    const u = await createUser({ username: 'pending_buyer', withPlan: false });
    const hoursAgo = (h) => new Date(Date.now() - h * 3600000);
    await insertOrder({ userId: u.id, planId: plan.id, amount: 1000, status: 'pending', createdAt: hoursAgo(1) }); // mới tạo
    const stale = await insertOrder({ userId: u.id, planId: plan.id, amount: 1000, status: 'pending', createdAt: hoursAgo(5) }); // quá hạn
    await insertOrder({ userId: u.id, planId: plan.id, amount: 1000, status: 'pending', createdAt: hoursAgo(100) }); // bỏ dở lâu
    const token = await loginAs(admin);
    const res = await request(app).get('/api/admin/orders?attention=needs_action').set('Authorization', `Bearer ${token}`);
    expect(codes(res)).toEqual([String(stale.order_code)]);
    expect(res.body.data.kpi.needsAction).toBe(1);
  });
});

describe('/admin/einvoices: "đến ngày" gồm trọn ngày cuối', () => {
  it('hoá đơn tạo 30/09 15:00 (giờ VN) còn trong khoảng dateTo=2026-09-30, mất khi dateTo=2026-09-29', async () => {
    const admin = await createUser({ role: 'admin', username: 'einv_admin' });
    const plan = await createPlan({ code: 'einv', price: 100000 });
    const u = await createUser({ username: 'einv_buyer', withPlan: false });
    const order = await insertOrder({ userId: u.id, planId: plan.id, amount: 100000, paidAt: vn('2026-09-30T14:00:00') });
    await db.query(
      `INSERT INTO einvoices (order_id, ma_tra_cuu, mtchieu, status, so_hdon, created_at) VALUES ($1, 'EDATE', 'MT', 'issued', '0000009', $2)`,
      [order.id, vn('2026-09-30T15:00:00')]
    );
    const token = await loginAs(admin);
    const list = (query) => request(app).get(`/api/admin/einvoices?status=${query}`).set('Authorization', `Bearer ${token}`);

    const included = await list('&dateFrom=2026-09-01&dateTo=2026-09-30');
    expect(included.status).toBe(200);
    expect(included.body.data.einvoices.map((e) => String(e.orderCode))).toEqual([String(order.order_code)]);

    const excluded = await list('&dateFrom=2026-09-01&dateTo=2026-09-29');
    expect(excluded.body.data.einvoices).toEqual([]);
  });
});

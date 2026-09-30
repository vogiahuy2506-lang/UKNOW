/**
 * PR-9 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — bộ dữ liệu DÙNG CHUNG cho test Tổng quan / Thành viên / Đơn hàng / Phễu
 * của admin: một hỗn hợp tài khoản (khách trả tiền, dùng thử, nhân viên thuần, tài khoản nội bộ, đã xoá, admin) và các
 * loại đơn (đã trả, hoàn, 0đ, huỷ-nhưng-đã-trả, ranh giới tháng).
 *
 * Bảng chân lý nằm trong `seedCustomerMix()` (đếm tay từng dòng), KHÔNG tính từ mã đang test. Cùng một bộ dữ liệu cho
 * mọi màn để test kiểm luôn "các màn khớp nhau" (số khách trả tiền ở Tổng quan = đầu trang Thành viên = số dòng khi lọc).
 */
import db from '../../../src/config/database.js';
import { createUser, createPlan } from './db.js';

const DAY = 86400000;
export const daysFromNow = (days) => new Date(Date.now() + days * DAY);

/** Đầu tháng VN (lệch `offsetMonths` tháng) dưới dạng timestamptz. */
export async function vnMonthStart(offsetMonths = 0) {
  const { rows } = await db.query(
    `SELECT (date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') + ($1::int * INTERVAL '1 month'))
              AT TIME ZONE 'Asia/Ho_Chi_Minh' AS m`,
    [offsetMonths]
  );
  return rows[0].m;
}

let orderSeq = 0;

/** Chèn một đơn với đủ các cột mà định nghĩa doanh thu quan tâm. */
export async function insertOrder({
  userId,
  planId = null,
  amount,
  status = 'success',
  paymentMethod = 'payos',
  note = null,
  topup = false,
  paidAt = null,
  createdAt = new Date(),
  refundedAt = null,
  email = null,
}) {
  orderSeq += 1;
  const orderCode = `${Date.now()}${String(orderSeq).padStart(6, '0')}`;
  const { rows } = await db.query(
    `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, note,
                         topup_config, paid_at, created_at, refunded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      orderCode, planId, amount, email ?? `order${orderSeq}@test.local`, userId, status, paymentMethod, note,
      topup ? JSON.stringify({ items: [] }) : null, paidAt, createdAt, refundedAt,
    ]
  );
  return rows[0];
}

export async function setPlan(userId, planId, expiresAt) {
  await db.query(
    `UPDATE users SET active_plan_id = $1, subscription_expires_at = $2 WHERE id = $3`,
    [planId, expiresAt, userId]
  );
}

export async function setCreatedAt(userId, date) {
  await db.query(`UPDATE users SET created_at = $1 WHERE id = $2`, [date, userId]);
}

export async function addMembership(ownerId, employeeId, status = 'active') {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, status) VALUES ($1, $2, $3)`,
    [ownerId, employeeId, status]
  );
}

/**
 * Hỗn hợp tài khoản + đơn. Đặt INTERNAL_USER_IDS = id của `internal` (người gọi khôi phục env sau test).
 *
 * KHÁCH (8): c1..c7 và e2.
 *   c1  gói 299k, còn 3 ngày, đơn gói PayOS 299k trả tháng này            → trả tiền, sắp hết hạn
 *   c2  gói 299k, còn 60 ngày, đơn gói "thu tay" 500k tháng này           → trả tiền
 *   c3  gói 299k, còn 60 ngày, đơn gói 299k tháng TRƯỚC + mua thêm 50k tháng này → trả tiền
 *   c4  gói dùng thử (giá 0), đơn free 0đ                                  → dùng thử
 *   c5  gói 299k nhưng đơn gói gần nhất là "gán miễn phí" 0đ               → dùng thử (KHÔNG trả tiền)
 *   c6  gói 299k, KHÔNG có đơn nào, tạo cách đây 40 ngày                   → dùng thử (không có bằng chứng trả tiền)
 *   c7  hết hạn 5 ngày trước, không còn gói, tạo cách đây 40 ngày          → hết hạn 30 ngày
 *   e2  là nhân viên của c1 NHƯNG có gói 299k + đơn trả tiền riêng          → khách trả tiền
 * KHÔNG PHẢI KHÁCH: e1 (nhân viên thuần của c1, chỉ có gói dùng thử), internal (nội bộ), deleted, admin.
 *
 * ĐƠN (đếm tay): đã trả tháng này = 299.000 (c1) + 500.000 (c2, thu tay) + 50.000 (c3, mua thêm) + 70.000 (c1, ranh giới:
 * tạo 10 phút trước 0h ngày 1, trả 5 phút sau) + 199.000 (e2) + 60.000 (tài khoản nội bộ — vẫn là tiền thật)
 * = 1.178.000; 6 đơn. Không tính: đơn hoàn 299k, voucher 0đ, free 0đ, huỷ 100k, huỷ-nhưng-đã-trả 120k (chưa xử lý),
 * huỷ-nhưng-đã-trả đã xử lý 80k.
 */
export async function seedCustomerMix() {
  const paidPlan = await createPlan({ code: 'pro-mix', name: 'Pro', price: 299000 });
  const trialPlan = await createPlan({ code: 'trial-mix', name: 'Dùng thử', price: 0 });

  const thisMonth = await vnMonthStart(0);
  const lastMonth = await vnMonthStart(-1);
  const minutes = (base, n) => new Date(base.getTime() + n * 60000);
  const paidThisMonth = minutes(thisMonth, 60);

  const mk = (username, extra = {}) => createUser({ username, email: `${username}@mix.test`, withPlan: false, ...extra });

  const admin = await createUser({ role: 'admin', username: 'mix_admin' });
  const c1 = await mk('mix_c1');
  const c2 = await mk('mix_c2');
  const c3 = await mk('mix_c3');
  const c4 = await mk('mix_c4');
  const c5 = await mk('mix_c5');
  const c6 = await mk('mix_c6');
  const c7 = await mk('mix_c7');
  const e1 = await mk('mix_e1');
  const e2 = await mk('mix_e2');
  const internal = await mk('mix_internal');
  const deleted = await mk('mix_deleted', { status: 'deleted' });

  await setPlan(c1.id, paidPlan.id, daysFromNow(3));
  await setPlan(c2.id, paidPlan.id, daysFromNow(60));
  await setPlan(c3.id, paidPlan.id, daysFromNow(60));
  await setPlan(c4.id, trialPlan.id, daysFromNow(10));
  await setPlan(c5.id, paidPlan.id, daysFromNow(60));
  await setPlan(c6.id, paidPlan.id, daysFromNow(60));
  await setPlan(c7.id, null, daysFromNow(-5));
  await setPlan(e1.id, trialPlan.id, daysFromNow(10));
  await setPlan(e2.id, paidPlan.id, daysFromNow(60));
  await setPlan(internal.id, paidPlan.id, daysFromNow(60));
  await setCreatedAt(c6.id, daysFromNow(-40));
  await setCreatedAt(c7.id, daysFromNow(-40));

  await addMembership(c1.id, e1.id);
  await addMembership(c1.id, e2.id);

  await insertOrder({ userId: c1.id, planId: paidPlan.id, amount: 299000, paidAt: paidThisMonth, createdAt: paidThisMonth });
  await insertOrder({
    userId: c2.id, planId: paidPlan.id, amount: 500000, paymentMethod: 'manual', paidAt: paidThisMonth, createdAt: paidThisMonth,
  });
  await insertOrder({
    userId: c3.id, planId: paidPlan.id, amount: 299000, paidAt: minutes(lastMonth, 3 * 60), createdAt: minutes(lastMonth, 3 * 60),
  });
  await insertOrder({
    userId: c3.id, planId: paidPlan.id, amount: 50000, topup: true, paidAt: paidThisMonth, createdAt: paidThisMonth,
  });
  // Ranh giới tháng: tạo 23:50 ngày cuối tháng trước, trả 00:05 ngày 1 → thuộc THÁNG NÀY (mốc kỳ = paid_at).
  await insertOrder({
    userId: c1.id, planId: paidPlan.id, amount: 70000, paidAt: minutes(thisMonth, 5), createdAt: minutes(thisMonth, -10),
  });
  await insertOrder({ userId: e2.id, planId: paidPlan.id, amount: 199000, paidAt: paidThisMonth, createdAt: paidThisMonth });
  // Không phải đơn đã trả:
  await insertOrder({
    userId: c4.id, planId: trialPlan.id, amount: 0, paymentMethod: 'free', paidAt: paidThisMonth, createdAt: paidThisMonth,
  });
  await insertOrder({
    userId: c5.id, planId: paidPlan.id, amount: 0, paymentMethod: 'free', paidAt: paidThisMonth, createdAt: paidThisMonth,
  });
  await insertOrder({
    userId: c5.id, planId: paidPlan.id, amount: 0, paymentMethod: 'voucher', paidAt: paidThisMonth, createdAt: paidThisMonth,
  });
  await insertOrder({
    userId: c1.id, planId: paidPlan.id, amount: 299000, status: 'refunded', paidAt: paidThisMonth, createdAt: paidThisMonth,
    refundedAt: paidThisMonth,
  });
  await insertOrder({ userId: c2.id, planId: paidPlan.id, amount: 100000, status: 'cancelled', createdAt: paidThisMonth });
  await insertOrder({
    userId: c2.id, planId: paidPlan.id, amount: 120000, status: 'cancelled', createdAt: paidThisMonth,
    note: '[OPS] PAID_AFTER_CANCELLED order status=cancelled webhook_amount=120000',
  });
  await insertOrder({
    userId: c3.id, planId: paidPlan.id, amount: 80000, status: 'cancelled', createdAt: paidThisMonth,
    note: '[OPS] PAID_AFTER_CANCELLED webhook_amount=80000\n[OPS] PAID_AFTER_CANCELLED_HANDLED by admin',
  });
  // Đơn của tài khoản nội bộ: vẫn là tiền thật (doanh thu không loại nội bộ).
  await insertOrder({ userId: internal.id, planId: paidPlan.id, amount: 60000, paidAt: paidThisMonth, createdAt: paidThisMonth });

  return {
    admin, c1, c2, c3, c4, c5, c6, c7, e1, e2, internal, deleted, paidPlan, trialPlan,
    expected: {
      totalCustomers: 8,
      payingCustomers: 4, // c1, c2, c3, e2
      trialCustomers: 3, // c4, c5, c6
      expiringPaid7d: 1, // c1
      // Doanh thu tháng này gồm cả đơn 60.000 của tài khoản nội bộ.
      revenueThisMonth: 299000 + 500000 + 50000 + 70000 + 199000 + 60000,
      revenueBySource: { plan: 299000 + 70000 + 199000 + 60000, topup: 50000, manual: 500000 },
      paidOrdersThisMonth: 6,
      refundedThisMonth: 299000,
      paidAfterCancelledCount: 1,
      paidAfterCancelledAmount: 120000,
    },
  };
}

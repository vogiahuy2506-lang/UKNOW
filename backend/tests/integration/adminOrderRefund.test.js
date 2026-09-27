/**
 * PLAN_HOAN_TIEN_DON_HANG_2026-09-27 — chức năng admin "Hoàn tiền đơn".
 *
 * Mục 1.3: service refundOrder/previewRefund chạy trên DB thật — thu gói khi đơn là gói hiện hành,
 * không đụng gói khi đơn đã bị thay, chặn hoá đơn chưa xuất, các ca bị chặn không ghi gì.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser, createPlan, createOrder } = await import('./helpers/db.js');
const { refundOrder, previewRefund } = await import('../../src/services/admin/adminOrderRefund.service.js');
const {
  metricPaidAfterCancelledOrders,
  metricStuckEinvoices,
} = await import('../../src/repositories/admin/alert.repository.js');

beforeEach(async () => {
  await truncateAll();
});

async function buyPlan(user, plan, { amount = 299000, paidAgo = '1 day', note = null } = {}) {
  const order = await createOrder({
    planId: plan.id, userId: user.id, userEmail: user.email, amount, note,
  });
  await db.query(
    `UPDATE orders SET paid_at = NOW() - $2::interval, created_at = NOW() - $2::interval WHERE id = $1`,
    [order.id, paidAgo]
  );
  await db.query(
    `UPDATE users SET active_plan_id = $1, max_landing_pages = 5, subscription_expires_at = NOW() + INTERVAL '29 days'
      WHERE id = $2`,
    [plan.id, user.id]
  );
  return order;
}

async function insertEinvoice(orderId, status) {
  const { rows } = await db.query(
    `INSERT INTO einvoices (order_id, ma_tra_cuu, mtchieu, status, next_attempt_at)
     VALUES ($1, $2, 'MT', $3, NOW() + INTERVAL '5 minutes') RETURNING id`,
    [orderId, `MTC${orderId}${Date.now()}`, status]
  );
  return rows[0].id;
}

async function snapshot(orderId, userId) {
  const o = await db.query(
    `SELECT status, refunded_at, refunded_by, refund_reason, refund_meta, updated_at FROM orders WHERE id = $1`,
    [orderId]
  );
  const u = await db.query(`SELECT active_plan_id, max_landing_pages FROM users WHERE id = $1`, [userId]);
  return { order: o.rows[0], user: u.rows[0] };
}

describe('refundOrder — mục 1.3', () => {
  it('N1: đơn là gói hiện hành + hoá đơn đã xuất → refunded, thu gói, khoá tài nguyên vượt trần, einvoice needs_adjustment', async () => {
    const admin = await createUser({ role: 'admin', username: 'refund-admin' });
    const user = await createUser({ username: 'refund-n1', withPlan: false });
    const plan = await createPlan({ code: 'starter-n1', price: 299000 });
    const order = await buyPlan(user, plan);
    const einvoiceId = await insertEinvoice(order.id, 'issued');
    const { rows: lp } = await db.query(
      `INSERT INTO landing_pages (id_user, slug, title, is_published) VALUES ($1, 'n1-lp', 'N1', TRUE) RETURNING id`,
      [user.id]
    );

    const result = await refundOrder({
      orderCode: order.order_code, adminUserId: admin.id, reason: 'Khách huỷ trong 7 ngày', transferRef: 'FT123',
    });

    expect(result.meta).toMatchObject({
      kind: 'paid', plan: 'revoked', einvoice: 'needs_adjustment', einvoiceId: Number(einvoiceId),
      amount: 299000, statusBefore: 'success', transferRef: 'FT123',
    });
    const after = await snapshot(order.id, user.id);
    expect(after.order.status).toBe('refunded');
    expect(after.order.refunded_at).not.toBeNull();
    expect(Number(after.order.refunded_by)).toBe(Number(admin.id));
    expect(after.order.refund_reason).toBe('Khách huỷ trong 7 ngày');
    expect(after.order.refund_meta.plan).toBe('revoked');
    expect(after.user.active_plan_id).toBeNull();
    expect(after.user.max_landing_pages).toBe(0);

    const inv = await db.query(`SELECT status, error_code FROM einvoices WHERE id = $1`, [einvoiceId]);
    expect(inv.rows[0]).toEqual({ status: 'issued', error_code: null });

    const locks = await db.query(
      `SELECT resource_id FROM topup_locked_resources WHERE user_id = $1 AND resource_key = 'landing_pages'`,
      [user.id]
    );
    expect(locks.rows.map((r) => Number(r.resource_id))).toEqual([Number(lp[0].id)]);
  });

  it('đơn không có user_id → tìm khách theo email rồi vẫn thu gói', async () => {
    const user = await createUser({ username: 'refund-email-only', withPlan: false });
    const plan = await createPlan({ code: 'email-only', price: 299000 });
    const order = await buyPlan(user, plan);
    await db.query(`UPDATE orders SET user_id = NULL WHERE id = $1`, [order.id]);

    const result = await refundOrder({ orderCode: order.order_code, adminUserId: null, reason: 'x' });
    expect(result.meta.plan).toBe('revoked');
    expect((await snapshot(order.id, user.id)).user.active_plan_id).toBeNull();
  });

  it('N3: đơn cũ đã bị gói khác thay → gói hiện tại giữ nguyên, plan=untouched', async () => {
    const user = await createUser({ username: 'refund-n3', withPlan: false });
    const starter = await createPlan({ code: 'starter-n3', price: 299000 });
    const pro = await createPlan({ code: 'pro-n3', price: 999000 });
    const oldOrder = await buyPlan(user, starter, { paidAgo: '10 days' });
    await buyPlan(user, pro, { amount: 999000, paidAgo: '2 days' });

    const result = await refundOrder({ orderCode: oldOrder.order_code, adminUserId: null, reason: 'thu sai' });
    expect(result.meta.plan).toBe('untouched');
    const after = await snapshot(oldOrder.id, user.id);
    expect(after.order.status).toBe('refunded');
    expect(Number(after.user.active_plan_id)).toBe(Number(pro.id));
    expect(after.user.max_landing_pages).toBe(5);
  });

  it('N4: hoá đơn pending → failed/ORDER_REFUNDED, bỏ lịch retry, KHÔNG thành cảnh báo "hoá đơn chết"', async () => {
    const user = await createUser({ username: 'refund-n4', withPlan: false });
    const plan = await createPlan({ code: 'starter-n4', price: 299000 });
    const order = await buyPlan(user, plan);
    const einvoiceId = await insertEinvoice(order.id, 'pending');

    const result = await refundOrder({ orderCode: order.order_code, adminUserId: null, reason: 'x' });
    expect(result.meta.einvoice).toBe('cancelled');
    const inv = await db.query(`SELECT status, error_code, next_attempt_at FROM einvoices WHERE id = $1`, [einvoiceId]);
    expect(inv.rows[0]).toMatchObject({ status: 'failed', error_code: 'ORDER_REFUNDED', next_attempt_at: null });

    const stuck = await metricStuckEinvoices(0);
    expect(stuck.samples.map((s) => String(s.orderCode))).not.toContain(String(order.order_code));
    expect(stuck.deadCount).toBe(0);
  });

  it('hoá đơn đang processing → không đụng, einvoice=in_flight', async () => {
    const user = await createUser({ username: 'refund-inflight', withPlan: false });
    const plan = await createPlan({ code: 'starter-inflight', price: 299000 });
    const order = await buyPlan(user, plan);
    const einvoiceId = await insertEinvoice(order.id, 'processing');

    const result = await refundOrder({ orderCode: order.order_code, adminUserId: null, reason: 'x' });
    expect(result.meta.einvoice).toBe('in_flight');
    const inv = await db.query(`SELECT status FROM einvoices WHERE id = $1`, [einvoiceId]);
    expect(inv.rows[0].status).toBe('processing');
  });

  describe('N5: các ca bị chặn không ghi gì', () => {
    async function expectRejectedWithoutWrite(order, userId, expected) {
      const before = await snapshot(order.id, userId);
      await expect(
        refundOrder({ orderCode: order.order_code, adminUserId: null, reason: 'x' })
      ).rejects.toMatchObject(expected);
      expect(await snapshot(order.id, userId)).toEqual(before);
    }

    it('đơn mua thêm → 400 TOPUP_NOT_SUPPORTED', async () => {
      const user = await createUser({ username: 'refund-topup', withPlan: false });
      const plan = await createPlan({ code: 'starter-topup', price: 299000 });
      await buyPlan(user, plan, { paidAgo: '5 days' });
      const topup = await createOrder({
        planId: plan.id, userId: user.id, userEmail: user.email, amount: 50000, note: 'topup',
      });
      await expectRejectedWithoutWrite(topup, user.id, { status: 400, code: 'TOPUP_NOT_SUPPORTED' });
    });

    it('khách có lịch đổi gói pending → 400 PENDING_PLAN_CHANGE', async () => {
      const user = await createUser({ username: 'refund-spc', withPlan: false });
      const plan = await createPlan({ code: 'starter-spc', price: 299000 });
      const other = await createPlan({ code: 'basic-spc', price: 499000 });
      const order = await buyPlan(user, plan);
      await db.query(
        `INSERT INTO scheduled_plan_changes (user_id, plan_id, billing_period, status, activate_after)
         VALUES ($1, $2, 'monthly', 'pending', NOW() + INTERVAL '20 days')`,
        [user.id, other.id]
      );
      await expectRejectedWithoutWrite(order, user.id, { status: 400, code: 'PENDING_PLAN_CHANGE' });
    });

    it('đơn đã refunded → 409 ALREADY_REFUNDED', async () => {
      const user = await createUser({ username: 'refund-twice', withPlan: false });
      const plan = await createPlan({ code: 'starter-twice', price: 299000 });
      const order = await buyPlan(user, plan);
      await refundOrder({ orderCode: order.order_code, adminUserId: null, reason: 'lần 1' });
      await expectRejectedWithoutWrite(order, user.id, { status: 409, code: 'ALREADY_REFUNDED' });
    });

    it.each([
      ['free', 0],
      ['voucher', 0],
      ['payos', 0],
    ])('đơn %s %dđ → 400', async (paymentMethod, amount) => {
      const user = await createUser({ username: `refund-${paymentMethod}-${amount}`, withPlan: false });
      const plan = await createPlan({ code: `plan-${paymentMethod}-${amount}`, price: 0 });
      const order = await createOrder({
        planId: plan.id, userId: user.id, userEmail: user.email, amount, paymentMethod,
      });
      await expectRejectedWithoutWrite(order, user.id, { status: 400 });
    });

    it('đơn cancelled KHÔNG có tag PAID_AFTER_CANCELLED → 400 NOT_REFUNDABLE', async () => {
      const user = await createUser({ username: 'refund-cancelled-plain', withPlan: false });
      const plan = await createPlan({ code: 'plan-cancelled-plain', price: 299000 });
      const order = await createOrder({
        planId: plan.id, userId: user.id, userEmail: user.email, amount: 299000, status: 'cancelled',
      });
      await expectRejectedWithoutWrite(order, user.id, { status: 400, code: 'NOT_REFUNDABLE' });
    });

    it('thiếu lý do → 400 REASON_REQUIRED', async () => {
      const user = await createUser({ username: 'refund-noreason', withPlan: false });
      const plan = await createPlan({ code: 'plan-noreason', price: 299000 });
      const order = await buyPlan(user, plan);
      const before = await snapshot(order.id, user.id);
      await expect(
        refundOrder({ orderCode: order.order_code, adminUserId: null, reason: '   ' })
      ).rejects.toMatchObject({ status: 400, code: 'REASON_REQUIRED' });
      expect(await snapshot(order.id, user.id)).toEqual(before);
    });
  });

  it('N6: đơn cancelled có PAID_AFTER_CANCELLED → refunded, cảnh báo order_paid_after_cancelled hết bắn', async () => {
    const user = await createUser({ username: 'refund-n6', withPlan: false });
    const plan = await createPlan({ code: 'plan-n6', price: 299000 });
    const order = await createOrder({
      planId: plan.id, userId: user.id, userEmail: user.email, amount: 299000, status: 'cancelled',
      note: '[OPS] PAID_AFTER_CANCELLED order status=cancelled nhưng PayOS webhook báo đã trả',
    });
    expect((await metricPaidAfterCancelledOrders()).map((r) => String(r.orderCode)))
      .toContain(String(order.order_code));

    const result = await refundOrder({ orderCode: order.order_code, adminUserId: null, reason: 'trả lại khách' });
    expect(result.meta).toMatchObject({ kind: 'paid_after_cancelled', plan: 'not_applicable', statusBefore: 'cancelled' });
    expect((await snapshot(order.id, user.id)).order.status).toBe('refunded');
    expect((await metricPaidAfterCancelledOrders()).map((r) => String(r.orderCode)))
      .not.toContain(String(order.order_code));
  });
});

describe('previewRefund — mục 1.3', () => {
  it('trả hệ quả giống lệnh hoàn nhưng không ghi gì', async () => {
    const user = await createUser({ username: 'preview-ok', withPlan: false });
    const plan = await createPlan({ code: 'preview-ok', price: 299000 });
    const order = await buyPlan(user, plan);
    await insertEinvoice(order.id, 'issued');
    const before = await snapshot(order.id, user.id);

    const preview = await previewRefund(order.order_code);
    expect(preview).toMatchObject({
      eligible: true, kind: 'paid', plan: 'revoked', einvoice: 'needs_adjustment', amount: 299000,
    });
    expect(await snapshot(order.id, user.id)).toEqual(before);
  });

  it('đơn không đủ điều kiện → eligible=false kèm lý do (không ném lỗi)', async () => {
    const user = await createUser({ username: 'preview-topup', withPlan: false });
    const plan = await createPlan({ code: 'preview-topup', price: 299000 });
    const topup = await createOrder({
      planId: plan.id, userId: user.id, userEmail: user.email, amount: 50000, note: 'topup',
    });
    const preview = await previewRefund(topup.order_code);
    expect(preview).toMatchObject({ eligible: false, code: 'TOPUP_NOT_SUPPORTED' });
    expect(preview.reason).toMatch(/mua thêm/);
  });

  it('đơn không tồn tại → 404', async () => {
    await expect(previewRefund('999999999')).rejects.toMatchObject({ status: 404 });
  });
});

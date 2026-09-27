/**
 * PLAN_HOAN_TIEN_DON_HANG_2026-09-27 — chức năng admin "Hoàn tiền đơn".
 *
 * Mục 1.3: service refundOrder/previewRefund chạy trên DB thật — thu gói khi đơn là gói hiện hành,
 * không đụng gói khi đơn đã bị thay, chặn hoá đơn chưa xuất, các ca bị chặn không ghi gì.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser, createPlan, createOrder } = await import('./helpers/db.js');
const { refundOrder, previewRefund } = await import('../../src/services/admin/adminOrderRefund.service.js');
const {
  metricPaidAfterCancelledOrders,
  metricStuckEinvoices,
} = await import('../../src/repositories/admin/alert.repository.js');
const { closeAffiliateMonth } = await import('../../src/services/affiliate/affiliateMonthClosing.service.js');
const { rejectWithdrawal } = await import('../../src/services/affiliate/affiliateWithdrawal.service.js');
const {
  listClaimableEinvoiceJobIds,
  claimEinvoiceByIdForIssue,
  listMissingEinvoiceIntents,
} = await import('../../src/repositories/payment/einvoice.repository.js');

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

describe('mục 1.4 — worker không xuất hoá đơn cho đơn đã hoàn', () => {
  async function orderWithStaleProcessingInvoice(username, status) {
    const user = await createUser({ username, withPlan: false });
    const plan = await createPlan({ code: `plan-${username}`, price: 299000 });
    const order = await createOrder({
      planId: plan.id, userId: user.id, userEmail: user.email, amount: 299000, status,
    });
    const einvoiceId = await insertEinvoice(order.id, 'processing');
    // Lease 15 phút đã hết → về lý thuyết cron được nhặt lại.
    await db.query(
      `UPDATE einvoices SET processing_started_at = NOW() - INTERVAL '2 hours' WHERE id = $1`,
      [einvoiceId]
    );
    return { order, einvoiceId: Number(einvoiceId) };
  }

  it('dòng processing hết lease của đơn refunded: không được liệt kê, không claim được; đơn success thì có', async () => {
    const refunded = await orderWithStaleProcessingInvoice('einv-refunded', 'refunded');
    const control = await orderWithStaleProcessingInvoice('einv-success', 'success');

    const listed = (await listClaimableEinvoiceJobIds({ limit: 50 })).map((r) => Number(r.id));
    expect(listed).toContain(control.einvoiceId);
    expect(listed).not.toContain(refunded.einvoiceId);

    await expect(claimEinvoiceByIdForIssue(refunded.einvoiceId)).resolves.toBeNull();
    await expect(claimEinvoiceByIdForIssue(control.einvoiceId)).resolves.toMatchObject({ status: 'processing' });
  });

  it('listMissingEinvoiceIntents chỉ lấy đơn success — đơn refunded muốn hoá đơn không bị tạo intent', async () => {
    const user = await createUser({ username: 'einv-missing', withPlan: false });
    const plan = await createPlan({ code: 'plan-einv-missing', price: 299000 });
    const refunded = await createOrder({
      planId: plan.id, userId: user.id, userEmail: user.email, amount: 299000, status: 'refunded',
    });
    const control = await createOrder({
      planId: plan.id, userId: user.id, userEmail: user.email, amount: 299000, status: 'success',
    });
    await db.query(
      `UPDATE orders SET invoice_info = '{"wantInvoice": true}'::jsonb WHERE id = ANY($1::int[])`,
      [[refunded.id, control.id]]
    );

    const ids = (await listMissingEinvoiceIntents({ fromIso: new Date(Date.now() - 3600_000).toISOString(), limit: 50 }))
      .map((r) => Number(r.id));
    expect(ids).toContain(Number(control.id));
    expect(ids).not.toContain(Number(refunded.id));
  });
});

// ─── Mục 2.2 — hoa hồng giới thiệu (số khớp bảng nghiệm thu A1–A5 của plan) ─────────────────────
describe('mục 2.2 — hoàn tiền trừ hoa hồng giới thiệu', () => {
  const MONTH = '2026-08';
  let prevClosingFlag;
  beforeEach(() => {
    prevClosingFlag = process.env.AFFILIATE_CLOSING_ENABLED;
    process.env.AFFILIATE_CLOSING_ENABLED = 'true';
  });
  afterEach(() => {
    if (prevClosingFlag !== undefined) process.env.AFFILIATE_CLOSING_ENABLED = prevClosingFlag;
    else delete process.env.AFFILIATE_CLOSING_ENABLED;
  });

  async function referredOrder(referrer, buyer, amount) {
    const plan = await createPlan({ price: amount });
    const order = await createOrder({ planId: plan.id, userId: buyer.id, userEmail: buyer.email, amount });
    await db.query(`UPDATE orders SET paid_at = NOW() - INTERVAL '40 days' WHERE id = $1`, [order.id]);
    await db.query(
      `INSERT INTO affiliate_revenue_events (referrer_user_id, buyer_user_id, order_id, amount, month_key)
       VALUES ($1, $2, $3, $4, $5)`,
      [referrer.id, buyer.id, order.id, amount, MONTH]
    );
    return order;
  }

  /** A2: 12tr + 10tr = 22tr, đã đóng sổ (bậc 20% → 4.400.000), chưa rút. */
  async function setupA2() {
    const referrer = await createUser({ username: `aff-ref-${Date.now()}`, withPlan: false });
    const b1 = await createUser({ username: `aff-b1-${Date.now()}`, withPlan: false });
    const b2 = await createUser({ username: `aff-b2-${Date.now()}`, withPlan: false });
    const o12 = await referredOrder(referrer, b1, 12_000_000);
    const o10 = await referredOrder(referrer, b2, 10_000_000);
    await closeAffiliateMonth(MONTH, { force: true });
    return { referrer, o12, o10 };
  }

  const balanceOf = async (userId) => Number((await db.query(
    `SELECT COALESCE(SUM(amount),0)::numeric AS s FROM affiliate_ledger WHERE user_id = $1`, [userId]
  )).rows[0].s);
  const periodOf = async (userId) => (await db.query(
    `SELECT gross_revenue::numeric AS g, rate_percent AS r, commission_amount::numeric AS c
       FROM affiliate_periods WHERE referrer_user_id = $1 AND month_key = $2`, [userId, MONTH]
  )).rows[0];

  async function pendingWithdrawal(referrerId, amount, status = 'pending') {
    const { rows } = await db.query(
      `INSERT INTO affiliate_withdrawals (user_id, amount_gross, tax_amount, amount_net, full_name, bank_name,
         bank_account_number, bank_account_name, status)
       VALUES ($1, $2, 0, $2, 'Doi Tac', 'VCB', '0001', 'DOI TAC', $3) RETURNING id`,
      [referrerId, amount, status]
    );
    await db.query(
      `INSERT INTO affiliate_ledger (user_id, entry_type, amount, ref_type, ref_id, note)
       VALUES ($1, 'withdrawal', $2, 'withdrawal', $3, 'rút')`,
      [referrerId, -amount, rows[0].id]
    );
    return rows[0].id;
  }

  it('A1: 1 đơn 299.000 chưa đóng sổ → hoàn → đóng sổ không sinh period, ví 0', async () => {
    const referrer = await createUser({ username: 'aff-a1-ref', withPlan: false });
    const buyer = await createUser({ username: 'aff-a1-buyer', withPlan: false });
    const order = await referredOrder(referrer, buyer, 299_000);

    const res = await refundOrder({ orderCode: order.order_code, adminUserId: null, reason: 'A1' });
    expect(res.meta.affiliate).toMatchObject({ period: 'not_closed', need: 0, deducted: 0, shortfall: 0 });
    const ev = await db.query(`SELECT reversed_at FROM affiliate_revenue_events WHERE order_id = $1`, [order.id]);
    expect(ev.rows[0].reversed_at).not.toBeNull();

    await closeAffiliateMonth(MONTH, { force: true });
    expect(await periodOf(referrer.id)).toBeUndefined();
    expect(await balanceOf(referrer.id)).toBe(0);
  });

  it('A2: hoàn đơn 10tr → gross 12tr, bậc 15%, hoa hồng 1.800.000; ledger −2.600.000; số dư 1.800.000', async () => {
    const { referrer, o10 } = await setupA2();
    expect(await balanceOf(referrer.id)).toBe(4_400_000);
    const pv = await previewRefund(o10.order_code);
    expect(pv.affiliate).toMatchObject({ need: 2_600_000, deducted: 2_600_000, shortfall: 0, newCommission: 1_800_000 });
    expect(await balanceOf(referrer.id)).toBe(4_400_000); // preview không ghi

    const res = await refundOrder({ orderCode: o10.order_code, adminUserId: null, reason: 'A2' });
    expect(res.meta.affiliate).toMatchObject({
      period: 'adjusted', prevGross: 22_000_000, newGross: 12_000_000, prevCommission: 4_400_000,
      newCommission: 1_800_000, newRatePercent: 15, need: 2_600_000, deducted: 2_600_000, shortfall: 0,
    });
    const p = await periodOf(referrer.id);
    expect([Number(p.g), Number(p.r), Number(p.c)]).toEqual([12_000_000, 15, 1_800_000]);
    const adj = await db.query(
      `SELECT amount::numeric AS a, ref_type, ref_id, note FROM affiliate_ledger WHERE user_id = $1 AND ref_type = 'order_refund'`,
      [referrer.id]
    );
    expect(adj.rows).toHaveLength(1);
    expect(Number(adj.rows[0].a)).toBe(-2_600_000);
    expect(String(adj.rows[0].ref_id)).toBe(String(o10.id));
    expect(adj.rows[0].note).toBe(`Hoàn tiền đơn #${o10.order_code} — điều chỉnh hoa hồng tháng ${MONTH}`);
    expect(await balanceOf(referrer.id)).toBe(1_800_000);
    const stored = await db.query(`SELECT refund_meta FROM orders WHERE id = $1`, [o10.id]);
    expect(stored.rows[0].refund_meta.affiliate).toMatchObject({ deducted: 2_600_000, shortfall: 0 });
  });

  it('A3: yêu cầu rút 3tr đang chờ (số dư 1,4tr) → không xác nhận: 409, không ghi gì', async () => {
    const { referrer, o10 } = await setupA2();
    const wid = await pendingWithdrawal(referrer.id, 3_000_000);
    expect(await balanceOf(referrer.id)).toBe(1_400_000);

    await expect(
      refundOrder({ orderCode: o10.order_code, adminUserId: null, reason: 'A3' })
    ).rejects.toMatchObject({
      status: 409,
      code: 'AFFILIATE_SHORTFALL_PENDING_WITHDRAWAL',
      message: expect.stringContaining(`yêu cầu rút #${wid}`),
      details: { affiliate: { need: 2_600_000, deducted: 1_400_000, shortfall: 1_200_000 } },
    });
    const o = await db.query(`SELECT status FROM orders WHERE id = $1`, [o10.id]);
    expect(o.rows[0].status).toBe('success');
    const ev = await db.query(`SELECT reversed_at FROM affiliate_revenue_events WHERE order_id = $1`, [o10.id]);
    expect(ev.rows[0].reversed_at).toBeNull();
    const p = await periodOf(referrer.id);
    expect([Number(p.g), Number(p.c)]).toEqual([22_000_000, 4_400_000]);
    expect(await balanceOf(referrer.id)).toBe(1_400_000);
  });

  it('A3: có acknowledgeShortfall → trừ 1.400.000, thiếu 1.200.000, số dư 0', async () => {
    const { referrer, o10 } = await setupA2();
    await pendingWithdrawal(referrer.id, 3_000_000);
    const res = await refundOrder({
      orderCode: o10.order_code, adminUserId: null, reason: 'A3 ack', acknowledgeShortfall: true,
    });
    expect(res.meta.affiliate).toMatchObject({ need: 2_600_000, deducted: 1_400_000, shortfall: 1_200_000 });
    expect(await balanceOf(referrer.id)).toBe(0);
  });

  it('A3: từ chối yêu cầu rút trước rồi hoàn → trừ đủ 2.600.000, số dư 1.800.000', async () => {
    const { referrer, o10 } = await setupA2();
    const admin = await createUser({ role: 'admin', username: 'aff-a3-admin' });
    const wid = await pendingWithdrawal(referrer.id, 3_000_000);
    await rejectWithdrawal(admin.id, wid, 'Hoàn tiền đơn khách — rút lại sau');
    expect(await balanceOf(referrer.id)).toBe(4_400_000);

    const res = await refundOrder({ orderCode: o10.order_code, adminUserId: admin.id, reason: 'A3 reject' });
    expect(res.meta.affiliate).toMatchObject({ need: 2_600_000, deducted: 2_600_000, shortfall: 0 });
    expect(await balanceOf(referrer.id)).toBe(1_800_000);
  });

  it('A4: đã rút hết và kế toán đã trả → trừ 0, thiếu 2.600.000 (công ty chịu), không 409', async () => {
    const { referrer, o10 } = await setupA2();
    await pendingWithdrawal(referrer.id, 4_400_000, 'paid');
    expect(await balanceOf(referrer.id)).toBe(0);

    const res = await refundOrder({ orderCode: o10.order_code, adminUserId: null, reason: 'A4' });
    expect(res.meta.affiliate).toMatchObject({ need: 2_600_000, deducted: 0, shortfall: 2_600_000, pendingWithdrawal: null });
    expect(await balanceOf(referrer.id)).toBe(0);
    const adj = await db.query(`SELECT 1 FROM affiliate_ledger WHERE ref_type = 'order_refund'`);
    expect(adj.rows).toHaveLength(0);
  });

  it('A5: sau A2 chạy lại đóng sổ tháng đó → không có dòng ledger mới, period giữ 12tr / 1,8tr', async () => {
    const { referrer, o10 } = await setupA2();
    await refundOrder({ orderCode: o10.order_code, adminUserId: null, reason: 'A5' });
    const ledgerBefore = (await db.query(`SELECT COUNT(*)::int AS n FROM affiliate_ledger`)).rows[0].n;

    const res = await closeAffiliateMonth(MONTH, { force: true });
    expect(res).toMatchObject({ insertedPeriods: 0, adjustedPeriods: 0, decreasedGrossPeriods: 0 });
    expect((await db.query(`SELECT COUNT(*)::int AS n FROM affiliate_ledger`)).rows[0].n).toBe(ledgerBefore);
    const p = await periodOf(referrer.id);
    expect([Number(p.g), Number(p.c)]).toEqual([12_000_000, 1_800_000]);
    expect(await balanceOf(referrer.id)).toBe(1_800_000);
  });

  it('người mua chưa có SĐT lúc đóng sổ (event chưa được tính) → hoàn không hạ period, không trừ ví', async () => {
    const referrer = await createUser({ username: 'aff-np-ref', withPlan: false });
    const b1 = await createUser({ username: 'aff-np-b1', withPlan: false });
    const noPhone = await createUser({ username: 'aff-np-b2', withPlan: false, phone: null });
    await referredOrder(referrer, b1, 12_000_000);
    const oNoPhone = await referredOrder(referrer, noPhone, 10_000_000);
    await closeAffiliateMonth(MONTH, { force: true });
    expect(await balanceOf(referrer.id)).toBe(1_800_000);

    const res = await refundOrder({ orderCode: oNoPhone.order_code, adminUserId: null, reason: 'np' });
    expect(res.meta.affiliate).toMatchObject({ period: 'unchanged', need: 0, deducted: 0 });
    const p = await periodOf(referrer.id);
    expect([Number(p.g), Number(p.c)]).toEqual([12_000_000, 1_800_000]);
    expect(await balanceOf(referrer.id)).toBe(1_800_000);
  });
});

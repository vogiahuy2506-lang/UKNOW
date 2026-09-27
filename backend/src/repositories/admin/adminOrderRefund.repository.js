import db from '../../config/database.js';
import { QUALIFIED_MONTH_GROSS_SQL } from '../../utils/affiliateRevenueSql.util.js';

// PLAN_HOAN_TIEN_DON_HANG_2026-09-27 mục 1.3 — SQL cho chức năng admin "Hoàn tiền đơn".
// Mọi hàm nhận `queryable` để service chạy chung MỘT transaction (khoá user → khoá đơn → ghi).

const REFUND_ORDER_COLUMNS = `id, order_code, user_id, user_email, plan_id, status, amount,
  payment_method, note, topup_config, billing_period, paid_at, refunded_at`;

/** Đọc đơn KHÔNG khoá — chỉ để biết user_id cần khoá trước (thứ tự khoá user → order như webhook). */
export async function findOrderForRefund(orderCode, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT ${REFUND_ORDER_COLUMNS} FROM orders WHERE order_code = $1 LIMIT 1`,
    [orderCode]
  );
  return rows[0] || null;
}

/** Khoá dòng đơn — gọi SAU lockUserForPlanActivation. Điều kiện hoàn phải kiểm lại trên dòng này. */
export async function lockOrderForRefund(orderCode, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT ${REFUND_ORDER_COLUMNS} FROM orders WHERE order_code = $1 FOR UPDATE`,
    [orderCode]
  );
  return rows[0] || null;
}

export async function findPendingScheduledPlanChange(userId, queryable = db) {
  if (!userId) return null;
  const { rows } = await queryable.query(
    `SELECT id, plan_id, order_id, activate_after
       FROM scheduled_plan_changes
      WHERE user_id = $1 AND status = 'pending'
      ORDER BY id DESC
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function findEinvoiceStatusForOrder(orderId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT id, status, error_code, so_hdon, khhdon FROM einvoices WHERE order_id = $1 LIMIT 1`,
    [orderId]
  );
  return rows[0] || null;
}

/**
 * Chuyển đơn sang 'refunded'. WHERE status khớp đúng trạng thái đã đọc trên dòng khoá — lưới
 * thứ hai nếu lỡ có đường ghi nào không lấy khoá.
 */
export async function markOrderRefunded({
  orderId, expectedStatus, refundedBy, reason, meta,
}, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE orders
        SET status = 'refunded',
            refunded_at = NOW(),
            refunded_by = $2,
            refund_reason = $3,
            refund_meta = $4::jsonb,
            updated_at = NOW()
      WHERE id = $1 AND status = $5
      RETURNING id, order_code, status, refunded_at`,
    [orderId, refundedBy ?? null, reason, JSON.stringify(meta ?? {}), expectedStatus]
  );
  return rows[0] || null;
}

/**
 * Hoá đơn chưa xuất (pending, hoặc failed đang chờ cron retry) → failed/ORDER_REFUNDED, bỏ lịch
 * retry. Đã issued/cqt_ok thì KHÔNG đụng (kế toán lập hoá đơn điều chỉnh trên cổng Mắt Bão).
 * 'processing' cũng không đụng: Mắt Bão có thể đang phát hành, lưới ở worker
 * (listClaimableEinvoiceJobIds / claimEinvoiceByIdForIssue) chặn lượt nhặt lại.
 */
export async function cancelUnissuedEinvoiceForRefund(orderId, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE einvoices
        SET status = 'failed',
            error_code = 'ORDER_REFUNDED',
            error_message = 'Đơn đã hoàn tiền — không xuất hoá đơn',
            next_attempt_at = NULL,
            updated_at = NOW()
      WHERE order_id = $1
        AND status IN ('pending', 'failed')
      RETURNING id, status`,
    [orderId]
  );
  return rows[0] || null;
}

/** Ghi lại refund_meta sau khi tính xong phần hoa hồng (cùng transaction). */
export async function updateRefundMeta(orderId, meta, queryable = db) {
  await queryable.query(
    `UPDATE orders SET refund_meta = $2::jsonb WHERE id = $1`,
    [orderId, JSON.stringify(meta ?? {})]
  );
}

// ─── Hoa hồng giới thiệu (PLAN_HOAN_TIEN_DON_HANG mục 2.2) ───────────────────────────────────

export async function findRevenueEventForOrder(orderId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT id, referrer_user_id, buyer_user_id, amount, month_key, reversed_at
       FROM affiliate_revenue_events
      WHERE order_id = $1
      LIMIT 1`,
    [orderId]
  );
  return rows[0] || null;
}

/**
 * Khoá ví đối tác bằng ĐÚNG khoá của yêu cầu rút / điều chỉnh tay (affiliateWithdrawal.service.js
 * requestWithdrawal, createLedgerAdjustment) — đọc số dư và ghi bút toán không bị chen giữa.
 */
export async function lockAffiliateWallet(referrerUserId, queryable = db) {
  await queryable.query(
    `SELECT pg_advisory_xact_lock(hashtext('affiliate_withdrawal'), hashtext($1::text))`,
    [String(referrerUserId)]
  );
}

export async function reverseRevenueEvent(orderId, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE affiliate_revenue_events
        SET reversed_at = NOW()
      WHERE order_id = $1 AND reversed_at IS NULL
      RETURNING id, reversed_at`,
    [orderId]
  );
  return rows[0] || null;
}

export async function findAffiliatePeriod({ referrerUserId, monthKey, forUpdate = false }, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT id, gross_revenue, tier_level, rate_percent, commission_amount
       FROM affiliate_periods
      WHERE referrer_user_id = $1 AND month_key = $2
      ${forUpdate ? 'FOR UPDATE' : ''}`,
    [referrerUserId, monthKey]
  );
  return rows[0] || null;
}

/**
 * Doanh thu tháng theo ĐÚNG công thức đóng sổ (QUALIFIED_MONTH_GROSS_SQL), bỏ thêm event của đơn
 * đang hoàn — để preview (chưa đảo event) và lệnh hoàn (đã đảo) ra cùng một số.
 */
export async function sumQualifiedMonthGrossExcludingOrder({ referrerUserId, monthKey, excludeOrderId }, queryable = db) {
  const { rows } = await queryable.query(
    `${QUALIFIED_MONTH_GROSS_SQL}
       AND e.order_id <> $3`,
    [referrerUserId, monthKey, excludeOrderId]
  );
  return Math.max(0, Math.round(Number(rows[0]?.current_gross || 0)));
}

export async function updateAffiliatePeriodAfterRefund({
  periodId, grossRevenue, tierLevel, ratePercent, commissionAmount,
}, queryable = db) {
  await queryable.query(
    `UPDATE affiliate_periods
        SET gross_revenue = $2,
            tier_level = $3,
            rate_percent = $4,
            commission_amount = $5
      WHERE id = $1`,
    [periodId, grossRevenue, tierLevel, ratePercent, commissionAmount]
  );
}

export async function getAffiliateWalletBalance(referrerUserId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS balance FROM affiliate_ledger WHERE user_id = $1`,
    [referrerUserId]
  );
  return Math.round(Number(rows[0]?.balance || 0));
}

export async function insertRefundLedgerAdjustment({ referrerUserId, amount, orderId, note }, queryable = db) {
  const { rows } = await queryable.query(
    `INSERT INTO affiliate_ledger (user_id, entry_type, amount, ref_type, ref_id, note)
     VALUES ($1, 'adjustment', $2, 'order_refund', $3, $4)
     RETURNING id`,
    [referrerUserId, amount, orderId, note]
  );
  return rows[0]?.id ?? null;
}

export async function findPendingAffiliateWithdrawal(referrerUserId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT id, amount_gross FROM affiliate_withdrawals
      WHERE user_id = $1 AND status = 'pending'
      ORDER BY id DESC
      LIMIT 1`,
    [referrerUserId]
  );
  return rows[0] || null;
}

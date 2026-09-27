import db from '../../config/database.js';

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

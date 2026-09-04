import db from '../../config/database.js';

export const AFFILIATE_REVENUE_SWEEP_JOB_CODE = 'affiliate_revenue_sweep';

/**
 * Quét các đơn hàng success đủ điều kiện và ghi nhận vào affiliate_revenue_events.
 *
 * Quy tắc doanh thu quy gán:
 * 1. o.status = 'success'
 * 2. o.payment_method <> 'free' và o.amount > 0 (bỏ qua đơn miễn phí/tặng gói/voucher 100%)
 * 3. Người mua (buyer) có người giới thiệu: buyer.referred_by_user_id IS NOT NULL
 * 4. Không tự giới thiệu: buyer.referred_by_user_id <> o.user_id
 * 5. Chưa được ghi nhận: NOT EXISTS trong affiliate_revenue_events (hoặc ON CONFLICT (order_id) DO NOTHING)
 * 6. month_key: tính theo giờ Việt Nam
 *    - Đơn PayOS (có paid_at timestamptz): đổi sang giờ VN bằng AT TIME ZONE 'Asia/Ho_Chi_Minh'
 *    - Đơn manual (paid_at NULL, updated_at TIMESTAMP naive): đã là giờ VN, giữ nguyên
 * 7. Người mua chưa có SĐT: VẪN ghi nhận event (sẽ được xét điều kiện lúc đóng sổ tháng ở PR-A3).
 *
 * @param {object} options
 * @param {object} [options.queryable=db] client hoặc pool
 * @param {number} [options.limit] giới hạn số đơn xử lý mỗi batch (tùy chọn)
 * @returns {Promise<{ status: string, inserted: number, synced: number, events: Array }>}
 */
export async function sweepAffiliateRevenue({ queryable = db, limit = null } = {}) {
  let sql = `
    INSERT INTO affiliate_revenue_events (
      referrer_user_id,
      buyer_user_id,
      order_id,
      amount,
      month_key
    )
    SELECT
      buyer.referred_by_user_id AS referrer_user_id,
      o.user_id AS buyer_user_id,
      o.id AS order_id,
      o.amount,
      to_char(
        COALESCE(
          o.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
          o.updated_at
        ),
        'YYYY-MM'
      ) AS month_key
    FROM orders o
    JOIN users buyer ON buyer.id = o.user_id
    WHERE o.status = 'success'
      AND o.payment_method <> 'free'
      AND o.amount > 0
      AND buyer.referred_by_user_id IS NOT NULL
      AND buyer.referred_by_user_id <> o.user_id
      AND NOT EXISTS (
        SELECT 1 FROM affiliate_revenue_events are WHERE are.order_id = o.id
      )
  `;

  const params = [];
  if (Number.isInteger(limit) && limit > 0) {
    sql += ` ORDER BY o.id ASC LIMIT $1`;
    params.push(limit);
  }

  sql += `
    ON CONFLICT (order_id) DO NOTHING
    RETURNING id, referrer_user_id, buyer_user_id, order_id, amount, month_key, created_at;
  `;

  const { rows } = await queryable.query(sql, params);
  const inserted = rows.length;

  return {
    status: inserted > 0 ? 'success' : 'noop',
    inserted,
    synced: inserted,
    events: rows,
  };
}

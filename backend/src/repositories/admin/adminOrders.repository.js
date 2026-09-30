import db from '../../config/database.js';
import {
  isValidYmd,
  orderNeedsActionSql,
  orderPeriodAtSql,
  paidAfterCancelledSql,
  paidOrderSql,
  vnDayRangeSql,
} from '../../services/admin/revenueDefinitions.js';

const REDEMPTION_JOIN = `
       LEFT JOIN LATERAL (
         SELECT v.code AS voucher_code, vr.discount_amount
         FROM voucher_redemptions vr
         JOIN vouchers v ON v.id = vr.voucher_id
         WHERE vr.order_id = o.id
         ORDER BY vr.id DESC
         LIMIT 1
       ) redemption ON TRUE`;

// Lọc "cần chú ý" (thẻ "Cần xử lý" của trang Đơn hàng và liên kết từ Tổng quan). Giá trị lạ bị bỏ qua.
const ATTENTION_FILTERS = {
  paid_after_cancelled: paidAfterCancelledSql,
  needs_action: orderNeedsActionSql,
};

function assertDate(label, value) {
  if (value && !isValidYmd(value)) {
    throw { status: 400, message: `${label} không hợp lệ (định dạng YYYY-MM-DD)` };
  }
}

/**
 * Bộ lọc dùng chung cho danh sách, đếm và KPI — MỘT nơi dựng WHERE để ba truy vấn luôn cùng một tập đơn.
 *
 * Khoảng ngày theo giờ VN trên MỐC KỲ (`periodExpr`, mặc định COALESCE(paid_at, created_at)); "đến ngày" gồm TRỌN ngày
 * cuối — trước đây `created_at < 'YYYY-MM-DD'` làm mất mọi đơn của ngày cuối (kế toán cộng danh sách đối chiếu PayOS
 * cuối tháng sẽ thiếu ngày 30/31, còn tổng KPI không đổi nên khó phát hiện).
 *
 * @param {{ status?: string, search?: string, dateFrom?: string, dateTo?: string, attention?: string }} filters
 * @param {{ includeStatus?: boolean, periodExpr?: string }} [options]
 */
function buildOrderFilters(filters, { includeStatus = true, periodExpr = orderPeriodAtSql('o') } = {}) {
  const { status, search, dateFrom, dateTo, attention } = filters;
  assertDate('Từ ngày', dateFrom);
  assertDate('Đến ngày', dateTo);

  const conditions = ['1=1'];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (includeStatus && status) conditions.push(`o.status = ${add(status)}`);
  conditions.push(...vnDayRangeSql(periodExpr, {
    fromRef: dateFrom ? add(dateFrom) : null,
    toRef: dateTo ? add(dateTo) : null,
  }));
  if (includeStatus && ATTENTION_FILTERS[attention]) conditions.push(ATTENTION_FILTERS[attention]('o'));
  if (search) {
    const ref = add(`%${search}%`);
    conditions.push(`(o.user_email ILIKE ${ref}
      OR CAST(o.order_code AS TEXT) ILIKE ${ref}
      OR COALESCE(NULLIF(o.voucher_code, ''), redemption.voucher_code) ILIKE ${ref})`);
  }
  return { where: conditions.join(' AND '), params };
}

export async function findOrders({ status, search, dateFrom, dateTo, attention, page = 1, limit = 20 }) {
  const { where, params } = buildOrderFilters({ status, search, dateFrom, dateTo, attention });
  const offset = (page - 1) * limit;
  const limitRef = `$${params.length + 1}`;
  const offsetRef = `$${params.length + 2}`;

  const [rowsRes, countRes] = await Promise.all([
    db.query(
      `SELECT o.id, o.order_code AS "orderCode", o.amount, o.status, o.created_at AS "createdAt", o.updated_at AS "updatedAt",
              o.note,
              o.user_email AS "userEmail", o.user_id AS "userId",
              o.billing_period AS "billingPeriod", o.payment_method AS "paymentMethod",
              o.original_amount AS "originalAmount",
              COALESCE(NULLIF(o.discount_amount, 0), redemption.discount_amount, 0) AS "discountAmount",
              COALESCE(NULLIF(o.voucher_code, ''), redemption.voucher_code) AS "voucherCode",
              o.discount_source AS "discountSource", o.discount_label AS "discountLabel",
              (o.topup_config IS NOT NULL OR o.note = 'topup') AS "isTopup",
              p.name AS "planName", p.code AS "planCode", p.is_custom AS "isCustom",
              u.full_name AS "userFullName"
       FROM orders o
       LEFT JOIN plans p ON o.plan_id = p.id
       LEFT JOIN users u ON o.user_id = u.id
       ${REDEMPTION_JOIN}
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT ${limitRef} OFFSET ${offsetRef}`,
      [...params, limit, offset]
    ),
    db.query(`SELECT COUNT(*) FROM orders o ${REDEMPTION_JOIN} WHERE ${where}`, params),
  ]);

  return { rows: rowsRes.rows, total: Number(countRes.rows[0].count) };
}

export async function findOrderByCode(orderCode) {
  const { rows } = await db.query(
    `SELECT id, order_code, status, plan_id, user_id, user_email FROM orders WHERE order_code = $1`,
    [orderCode]
  );
  return rows[0] || null;
}

// PR-4 (đợt rà soát 26/09) — WHERE status='pending' bắt buộc: cancelOrder() (service) đã
// kiểm order.status !== 'pending' trước khi gọi, nhưng đó là check-then-act không atomic —
// webhook có thể claim đơn thành 'success' đúng giữa lúc kiểm và lúc UPDATE này chạy. Không
// có điều kiện này thì UPDATE vô điều kiện sẽ ĐÈ 'success' xuống 'cancelled', xoá dấu vết
// đơn đã kích hoạt thật trong khi tiền đã thu. Trả về hàng đã cập nhật (null nếu đã bị
// webhook race chiếm mất) để service báo lỗi thay vì im lặng coi như đã huỷ.
export async function setOrderCancelled(orderCode) {
  const { rows } = await db.query(
    `UPDATE orders SET status = 'cancelled', updated_at = NOW()
      WHERE order_code = $1 AND status = 'pending'
      RETURNING id, order_code, status`,
    [orderCode]
  );
  return rows[0] || null;
}

// "Nợ nhỏ" PR-4 (26/09) — đơn có tag PAID_AFTER_CANCELLED (payment.repository.js
// flagPaidAfterCancelled) trước đây không có cách đánh dấu admin đã xử lý tay (kích hoạt bù/hoàn
// tiền), nên alert_rules order_paid_after_cancelled (metricPaidAfterCancelledOrders) bắn lại mỗi
// giờ tới 7 ngày. Nối thêm tag PAID_AFTER_CANCELLED_HANDLED — KHÔNG đổi status, KHÔNG kích hoạt
// gói. Chỉ áp cho đơn ĐÃ có tag gốc và CHƯA được đánh dấu xử lý (idempotent).
export async function markPaidAfterCancelledHandled(orderCode, note) {
  const { rows } = await db.query(
    `UPDATE orders
        SET note = CASE
              WHEN note IS NULL OR note = '' THEN $2
              ELSE note || E'\\n' || $2
            END,
            updated_at = NOW()
      WHERE order_code = $1
        AND note LIKE '%PAID_AFTER_CANCELLED%'
        AND COALESCE(note, '') NOT LIKE '%PAID_AFTER_CANCELLED_HANDLED%'
      RETURNING id, order_code, status, note`,
    [orderCode, note]
  );
  return rows[0] || null;
}

/**
 * KPI trang Đơn hàng — THEO BỘ LỌC (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-9): khoảng ngày và ô tìm kiếm áp cho
 * cả bốn số; bộ lọc TRẠNG THÁI và "cần chú ý" chỉ thu hẹp danh sách (bốn thẻ vốn đã tách theo trạng thái — lọc "Thất
 * bại" mà doanh thu về 0 thì mất hết ý nghĩa của thẻ). Không có bộ lọc nào = toàn thời gian.
 *
 *   revenue     tổng đơn đã trả (success, amount > 0) theo mốc kỳ COALESCE(paid_at, created_at); đơn hoàn tự rơi ra.
 *   paidOrders  số đơn đã trả — KHÔNG gồm đơn 0đ (dùng thử free, voucher 100%).
 *   refunded    tiền đã hoàn, theo NGÀY HOÀN (refunded_at) — đơn trả tháng 8, hoàn tháng 9 thì "Đã hoàn" ở tháng 9.
 *   needsAction đơn failed + tiền đã vào nhưng đơn huỷ (chưa xử lý) + pending quá hạn — cùng điều kiện với bộ lọc
 *               `attention=needs_action`.
 */
export async function getOrdersKpi({ search, dateFrom, dateTo } = {}) {
  const filters = { search, dateFrom, dateTo };
  const period = buildOrderFilters(filters, { includeStatus: false });
  const refundPeriod = buildOrderFilters(filters, { includeStatus: false, periodExpr: 'o.refunded_at' });
  const join = search ? REDEMPTION_JOIN : '';

  const [periodRes, refundRes] = await Promise.all([
    db.query(
      `SELECT
         COALESCE(SUM(o.amount) FILTER (WHERE ${paidOrderSql('o')}), 0) AS revenue,
         COUNT(*) FILTER (WHERE ${paidOrderSql('o')}) AS "paidOrders",
         COUNT(*) FILTER (WHERE ${orderNeedsActionSql('o')}) AS "needsAction"
       FROM orders o ${join}
       WHERE ${period.where}`,
      period.params
    ),
    db.query(
      `SELECT COALESCE(SUM(o.amount), 0) AS refunded
       FROM orders o ${join}
       WHERE o.status = 'refunded' AND ${refundPeriod.where}`,
      refundPeriod.params
    ),
  ]);

  const p = periodRes.rows[0] || {};
  return {
    revenue: Number(p.revenue || 0),
    paidOrders: Number(p.paidOrders || 0),
    refunded: Number(refundRes.rows[0]?.refunded || 0),
    needsAction: Number(p.needsAction || 0),
    period: { from: dateFrom || null, to: dateTo || null },
  };
}

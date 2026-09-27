/**
 * PLAN_HOAN_TIEN_DON_HANG_2026-09-27 mục 2.1 — nguồn DUY NHẤT cho điều kiện "event doanh thu còn
 * hiệu lực" và công thức doanh thu tháng của đối tác giới thiệu.
 *
 * Event của đơn đã hoàn tiền bị đánh dấu `reversed_at` (adminOrderRefund.service.js) thay vì xoá
 * (FK order_id ON DELETE RESTRICT + giữ dấu vết). Trước đây có 5 bản chép tay cùng công thức ở
 * affiliateMonthClosing.service.js và affiliateWithdrawal.service.js — sót một chỗ là trang đối tác,
 * trang admin và sổ đóng tháng báo ba con số khác nhau. Chỗ nào đọc affiliate_revenue_events để
 * tính tiền phải đi qua file này.
 */

/**
 * @param {string} [alias='e'] bí danh bảng affiliate_revenue_events trong câu SQL; '' khi không dùng bí danh
 * @returns {string} mệnh đề SQL, không có tham số
 */
export function activeRevenueEventSql(alias = 'e') {
  return `${alias ? `${alias}.` : ''}reversed_at IS NULL`;
}

/**
 * Doanh thu tháng tính hoa hồng của MỘT đối tác: chỉ event còn hiệu lực VÀ người mua đã có SĐT tại
 * thời điểm tính (luật đóng sổ PR-A3). Tham số: $1 = referrer_user_id, $2 = month_key 'YYYY-MM'.
 * Trả một cột `current_gross` (numeric).
 */
export const QUALIFIED_MONTH_GROSS_SQL = `SELECT COALESCE(SUM(e.amount), 0)::numeric AS current_gross
     FROM affiliate_revenue_events e
     JOIN users b ON b.id = e.buyer_user_id
       AND b.phone IS NOT NULL
       AND TRIM(b.phone) <> ''
     WHERE e.referrer_user_id = $1 AND e.month_key = $2
       AND ${activeRevenueEventSql('e')}`;

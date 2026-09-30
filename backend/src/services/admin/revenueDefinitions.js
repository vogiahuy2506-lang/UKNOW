import { VN_TZ } from './customerDefinitions.js';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-9 — định nghĩa DOANH THU / ĐƠN dùng chung cho Tổng quan và Đơn hàng của
 * admin (cùng một tập đơn, cùng một mốc kỳ, cùng cách tính "đến ngày"). Tổng quan trước đây lấy doanh thu tháng theo
 * `created_at`, còn trang Đơn hàng cộng TOÀN THỜI GIAN dưới cùng nhãn "Doanh thu" — hai màn ghi cùng một chữ với hai kỳ.
 *
 * Từ điển:
 *   Đơn đã trả  `status = 'success' AND amount > 0`. Đơn dùng thử tự cấp lúc đăng ký (free, 0đ) và voucher 100% có
 *               status success nhưng amount = 0 → KHÔNG phải đơn đã trả. Đơn hoàn tiền đổi status sang 'refunded'
 *               nên tự rơi khỏi mọi tổng (không cần điều kiện riêng).
 *   Doanh thu   tổng amount của đơn đã trả. amount là giá cuối khách trả (không cộng VAT — KCT), nên cộng được.
 *   Mốc kỳ      COALESCE(paid_at, created_at): kỳ của đơn là lúc TRẢ TIỀN. Hoa hồng (affiliateRevenueSweep) đã theo
 *               paid_at; đơn tạo 23:50 ngày 30, trả 00:05 ngày 1 thuộc tháng SAU ở cả hai nơi.
 *   Ngày        theo giờ VN. "Đến ngày" gồm TRỌN ngày cuối (`< ngày_cuối + 1`), trước đây `< ngày_cuối` làm mất cả ngày
 *               cuối khi kế toán đối chiếu PayOS cuối tháng.
 *
 * Doanh thu KHÔNG loại đơn của tài khoản nội bộ: tiền đã thu là tiền thật, và trang Đơn hàng cũng đếm cùng tập.
 */

/** Đơn đã trả. */
export function paidOrderSql(o = 'o') {
  return `(${o}.status = 'success' AND ${o}.amount > 0)`;
}

/** Mốc kỳ của đơn (timestamptz). */
export function orderPeriodAtSql(o = 'o') {
  return `COALESCE(${o}.paid_at, ${o}.created_at)`;
}

/**
 * Nguồn của đơn đã trả — ba nhóm KHÔNG chồng lấn: 'manual' (admin ghi nhận thu tay) trước, rồi 'topup' (mua thêm),
 * còn lại 'plan' (gói). Tổng ba nhóm luôn bằng doanh thu.
 */
export function orderKindSql(o = 'o') {
  return `(CASE
    WHEN ${o}.payment_method = 'manual' THEN 'manual'
    WHEN ${o}.topup_config IS NOT NULL OR ${o}.note = 'topup' THEN 'topup'
    ELSE 'plan'
  END)`;
}

/**
 * Đơn cancelled/failed mà PayOS SAU ĐÓ báo đã trả tiền (webhook gắn tag PAID_AFTER_CANCELLED) và admin chưa bấm
 * "đã xử lý". Tiền đã vào nhưng KHÔNG nằm trong doanh thu nào. Cùng tag với alert.repository.metricPaidAfterCancelledOrders
 * (bản đó còn giới hạn 168 giờ vì để bắn cảnh báo; con số hiển thị thì phải đủ mọi đơn chưa xử lý).
 */
export function paidAfterCancelledSql(o = 'o') {
  return `(${o}.status IN ('cancelled', 'failed')
    AND ${o}.note LIKE '%PAID_AFTER_CANCELLED%'
    AND ${o}.note NOT LIKE '%PAID_AFTER_CANCELLED_HANDLED%')`;
}

/** Đơn pending lâu hơn ngưỡng này (giờ) là "quá hạn" — cùng ngưỡng mặc định của cảnh báo order_pending_stale. */
export const PENDING_STALE_HOURS = 2;
/** Chỉ xét đơn pending tạo trong vòng này (giờ); đơn bỏ dở từ lâu không phải việc cần xử lý. */
export const PENDING_STALE_MAX_AGE_HOURS = 48;

/**
 * Đơn CẦN XỬ LÝ: (a) failed (PayOS lệch số tiền — rà tay), (b) tiền đã vào nhưng đơn đã huỷ (PAID_AFTER_CANCELLED
 * chưa xử lý), (c) pending quá hạn. Một điều kiện duy nhất cho thẻ "Cần xử lý" và bộ lọc mà thẻ đó dẫn tới.
 */
export function orderNeedsActionSql(o = 'o') {
  return `(${o}.status = 'failed'
    OR ${paidAfterCancelledSql(o)}
    OR (${o}.status = 'pending'
        AND ${o}.created_at <= NOW() - INTERVAL '${PENDING_STALE_HOURS} hours'
        AND ${o}.created_at >= NOW() - INTERVAL '${PENDING_STALE_MAX_AGE_HOURS} hours'))`;
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' đúng ngày lịch (chặn '2026-02-30'). Tính thuần bằng UTC nên không phụ thuộc múi giờ tiến trình. */
export function isValidYmd(value) {
  const match = YMD_RE.exec(String(value ?? ''));
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Điều kiện khoảng ngày VN trên một cột timestamptz. `fromRef` / `toRef` là placeholder ($n) của chuỗi 'YYYY-MM-DD'
 * (đã kiểm isValidYmd). Trả mảng điều kiện — rỗng nếu không có mốc nào.
 *
 * "Đến ngày" gồm TRỌN ngày cuối: `< (đến_ngày + 1 ngày)`.
 */
export function vnDayRangeSql(columnExpr, { fromRef = null, toRef = null } = {}) {
  const local = `(${columnExpr} AT TIME ZONE '${VN_TZ}')`;
  const conditions = [];
  if (fromRef) conditions.push(`${local} >= ${fromRef}::date`);
  if (toRef) conditions.push(`${local} < (${toRef}::date + 1)`);
  return conditions;
}

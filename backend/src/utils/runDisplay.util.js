/**
 * Hàm thuần DÙNG CHUNG để HIỂN THỊ một lượt chạy trên các trang Giám sát gửi tin (người dùng:
 * services/user/userDeliveryMonitor.service.js; admin: services/admin/deliveryMonitor.service.js) — "ngày hôm nay giờ
 * VN", "đang chờ tới khi nào / vì sao", "cần gửi bao nhiêu". Tách ra để hai trang nói CÙNG MỘT câu về cùng một lượt chạy
 * (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b / PR-6); sửa quy tắc ở đây thì cả hai đổi theo.
 */

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

// Chiến dịch one-shot chờ tới bước kế / chờ SMTP nhả đều ghi cùng mã lý do này; dấu hiệu thật để biết là SMTP chặn
// là run_metadata.emailRateLimitAt trong khung 12 giờ (+1 giờ dư). KHỚP frontend/src/features/campaigns/utils/
// campaignQuotaPause.helpers.js (danh sách chiến dịch) — hai màn phải nói cùng một câu về cùng một lượt chạy.
export const ALL_RECIPIENTS_WAITING_REASON = 'all_recipients_waiting_next_due';
export const SMTP_RATE_LIMITED_REASON = 'smtp_rate_limited';
const SMTP_RATE_LIMIT_PAUSE_WINDOW_MS = 13 * 60 * 60 * 1000;

// Bộ đếm campaign_runs (total_recipients, successful_sends…) phình / về 0 ở lượt TẠO trước bản sửa 26/09/2026
// 20:36 giờ VN (plan mục 1: 230 lượt, 14 lượt vỡ bất biến ok+failed+skipped ≤ total, chưa backfill). Chỉ lượt tạo sau
// mốc này mới được dùng total_recipients làm "cần gửi". So `created_at` với literal `timestamp`: đúng cho cả cột naive
// (production) lẫn timestamptz (bootstrap.sql của test).
export const COUNTER_TRUSTED_FROM_VN = '2026-09-26 20:36:00';

/**
 * Biểu thức SQL "bộ đếm của lượt này đáng tin" (xem COUNTER_TRUSTED_FROM_VN).
 *
 * @param {string} alias bí danh của bảng campaign_runs
 * @returns {string}
 */
export const runCountersReliableSql = (alias) => `(${alias}.created_at >= TIMESTAMP '${COUNTER_TRUSTED_FROM_VN}')`;

export const toNumber = (value) => Number(value || 0);

export const toIso = (value) => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Ngày hôm nay theo giờ VN dạng 'YYYY-MM-DD' — đúng bất kể múi giờ của tiến trình (production chạy UTC: 00:30 giờ VN
 * vẫn còn là ngày hôm trước theo UTC).
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function getVnToday(now = new Date()) {
  return now.toLocaleDateString('sv-SE', { timeZone: VN_TIME_ZONE });
}

/**
 * Giờ hiện tại theo giờ VN (0–23).
 *
 * @param {Date} [now]
 * @returns {number}
 */
export function getVnHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: VN_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now)
    .find((part) => part.type === 'hour')?.value;
  return Number(hour);
}

/**
 * Cộng / trừ ngày cho chuỗi 'YYYY-MM-DD'. Tính thuần bằng UTC nên không phụ thuộc múi giờ tiến trình.
 *
 * @param {string} isoDate
 * @param {number} deltaDays
 * @returns {string}
 */
export function addDaysToIsoDate(isoDate, deltaDays) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return date.toISOString().slice(0, 10);
}

/**
 * "Đang chờ" của một lượt: mốc chờ còn ở tương lai (mốc đã qua là dấu vết chưa dọn, lượt sẽ được đánh thức) và mã lý do.
 * `nonContinuous…` cùng mã cho hai chuyện khác nhau nên tách SMTP chặn ra bằng emailRateLimitAt.
 *
 * @param {{ deferred_until: string|null, deferred_reason: string|null, email_rate_limit_at: string|null }} row
 * @param {number} nowMs
 * @returns {{ until: string, reason: string|null }|null}
 */
export function resolveWaiting(row, nowMs) {
  const untilMs = Date.parse(String(row.deferred_until || ''));
  if (!Number.isFinite(untilMs) || untilMs <= nowMs) return null;

  let reason = String(row.deferred_reason || '').trim() || null;
  if (reason === ALL_RECIPIENTS_WAITING_REASON) {
    const limitedAtMs = Date.parse(String(row.email_rate_limit_at || ''));
    if (Number.isFinite(limitedAtMs) && untilMs > limitedAtMs && untilMs - limitedAtMs <= SMTP_RATE_LIMIT_PAUSE_WINDOW_MS) {
      reason = SMTP_RATE_LIMITED_REASON;
    }
  }
  return { until: new Date(untilMs).toISOString(), reason };
}

/**
 * "Cần gửi" của lượt = total_recipients CHỈ khi bộ đếm đáng tin: lượt tạo sau bản sửa 26/09 20:36 (lượt cũ phình / về
 * 0) VÀ total_recipients ≥ số đã gửi thật (nhỏ hơn thì bộ đếm sai). total_recipients = 0 nghĩa là "chưa biết", không
 * phải "cần gửi 0 tin" → null. Không tin được thì null và màn chỉ hiện số đã gửi.
 *
 * @param {{ counters_reliable: boolean, total_recipients: number|string|null }} row
 * @param {number} sent số đã gửi thật (từ bảng tin)
 * @returns {number|null}
 */
export function resolvePlanned(row, sent) {
  if (!row.counters_reliable) return null;
  const total = toNumber(row.total_recipients);
  return total > 0 && total >= sent ? total : null;
}

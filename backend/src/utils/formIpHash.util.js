/**
 * Băm IP người nộp form (PR-3a, PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md mục 4 + "Bổ sung
 * 15/09"): HMAC-SHA256 với khoá `FORM_IP_HASH_SECRET`, thiếu thì dùng tạm `JWT_SECRET` (không
 * bao giờ được TỰ Ý đổi giá trị biến này — xem bộ nhớ SMTP_SECRET_KEY) + log cảnh báo MỘT LẦN.
 * Không dùng sha256 trần — PR-1a đã bỏ cách đó vì dò ngược được (rainbow table trên không gian
 * IPv4 chỉ 2^32 giá trị là khả thi). Cũng vì vậy KHÔNG có khoá cố định dự phòng: thiếu cả hai
 * biến thì không băm (trả null) thay vì băm bằng một khoá ai cũng biết.
 */

import crypto from 'crypto';

let warnedMissingSecret = false;
let warnedNoSecret = false;

/**
 * @returns {string} khoá HMAC
 * @throws {Error} khi thiếu cả FORM_IP_HASH_SECRET lẫn JWT_SECRET
 */
function resolveIpHashSecret() {
  const secret = process.env.FORM_IP_HASH_SECRET;
  if (secret) return secret;
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn(
      '[FormIpHash] FORM_IP_HASH_SECRET chưa đặt trong .env — dùng tạm JWT_SECRET để băm IP. ' +
      'Đặt biến riêng trên production (không dùng chung khoá cho hai mục đích khác nhau lâu dài).'
    );
  }
  const fallback = process.env.JWT_SECRET;
  if (!fallback) {
    throw new Error('Chưa cấu hình FORM_IP_HASH_SECRET (hoặc JWT_SECRET) để băm IP người nộp form');
  }
  return fallback;
}

/**
 * @param {string} ipKey Giá trị IP đã chuẩn hoá (dùng CHUNG cách lấy với rate limiter —
 *   `clientIpKey` của rateLimiter.middleware.js — để "cùng IP" ở chốt chống giữ chỗ hàng loạt
 *   khớp đúng cách limiter nhóm IPv6 theo khối, không lệch bucket).
 * @returns {string|null} hex 64 ký tự; null nếu ipKey rỗng HOẶC thiếu khoá băm. Nơi gọi duy nhất
 *   (form.service.js submitPublicForm) đã coi null là "không có IP": bài nộp vẫn được nhận, chỉ bỏ
 *   qua chốt đếm lượt giữ chỗ theo IP (countPendingHoldsForIpAndForm trả 0 khi hash rỗng).
 */
export function hashSubmitterIp(ipKey) {
  const key = String(ipKey || '').trim();
  if (!key) return null;
  let secret;
  try {
    secret = resolveIpHashSecret();
  } catch (err) {
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.error(`[FormIpHash] ${err.message} — bỏ qua băm IP (không lưu submitter_ip_hash).`);
    }
    return null;
  }
  return crypto.createHmac('sha256', secret).update(key).digest('hex');
}

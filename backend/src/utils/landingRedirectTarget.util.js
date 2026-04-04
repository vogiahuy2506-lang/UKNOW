/**
 * Kiểm tra URL đích cho redirect landing track — không giới hạn hostname.
 *
 * Luồng hoạt động:
 * 1. Parse chuỗi thành URL; nếu lỗi cú pháp thì từ chối.
 * 2. Chỉ chấp nhận giao thức `http:` hoặc `https:` (chặn javascript:, data:, file:, ...).
 * 3. Bắt buộc có hostname (tránh URL rỗng / không có đích rõ ràng).
 *
 * Lưu ý bảo mật: endpoint `/public/landing-track/go` là công khai; cho phép mọi host
 * tương đương khả năng bị lạm dụng làm open redirect — chỉ bật khi chấp nhận rủi ro đó.
 *
 * @param {string} urlString URL đích (đã decode hoặc chưa decode đều có thể parse lại)
 * @returns {boolean}
 */
export function isValidPublicLandingRedirectUrl(urlString) {
  let u;
  try {
    u = new URL(String(urlString || '').trim());
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (!String(u.hostname || '').trim()) return false;
  return true;
}

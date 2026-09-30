/**
 * Tiện ích dùng chung cho webhook kênh chatbot (Facebook Messenger, Zalo OA, WhatsApp Cloud):
 *   - so khớp chuỗi bí mật hằng thời gian;
 *   - chọn verify token cho bước bắt tay GET (token riêng của kênh → biến môi trường);
 *   - cảnh báo một lần mỗi tiến trình khi một bước kiểm tra chưa có cấu hình.
 *
 * @module utils/webhookVerification.util
 */
import crypto from 'crypto';

/**
 * Các giá trị verify token từng được viết cứng trong mã nguồn công khai. Biến môi trường mang một
 * trong các giá trị này bị coi như CHƯA cấu hình (ai đọc repo cũng biết giá trị đó).
 */
export const PUBLIC_DEFAULT_VERIFY_TOKENS = Object.freeze(new Set([
  'founderai',
  'uknow_zalo_oa_verify',
  'uknow_whatsapp_verify',
  // Giá trị mẫu trong backend/.env.example.
  'replace-with-random-32-chars',
]));

/**
 * Biến môi trường verify token dự phòng khi kênh chưa có token riêng, theo thứ tự ưu tiên.
 * Tên thứ hai của Facebook/Zalo là tên cũ từng được helper `verifyWebhook` của adapter đọc.
 */
export const FACEBOOK_VERIFY_TOKEN_ENV_NAMES = Object.freeze([
  'FACEBOOK_WEBHOOK_VERIFY_TOKEN',
  'FACEBOOK_VERIFY_TOKEN',
]);
export const ZALO_OA_VERIFY_TOKEN_ENV_NAMES = Object.freeze([
  'ZALO_OA_WEBHOOK_VERIFY_TOKEN',
  'ZALO_OA_VERIFY_TOKEN',
]);
export const WHATSAPP_VERIFY_TOKEN_ENV_NAMES = Object.freeze([
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
]);

const warnedKeys = new Set();

/**
 * Ghi `console.warn` đúng MỘT lần cho mỗi `key` trong vòng đời tiến trình.
 *
 * @param {string} key
 * @param {string} message
 * @returns {boolean} true nếu lần gọi này thực sự ghi cảnh báo
 */
export function warnOnce(key, message) {
  if (warnedKeys.has(key)) return false;
  warnedKeys.add(key);
  console.warn(message);
  return true;
}

/** Chỉ dùng trong test: cho phép cảnh báo một lần được ghi lại. */
export function _resetWarnOnceForTests() {
  warnedKeys.clear();
}

/**
 * So khớp hai chuỗi hằng thời gian: băm SHA-256 cả hai rồi `timingSafeEqual` trên hai digest
 * cùng 32 byte (không lộ độ dài, không ném lỗi khi khác độ dài). Chuỗi rỗng/không phải chuỗi → false.
 *
 * @param {unknown} provided
 * @param {unknown} expected
 * @returns {boolean}
 */
export function timingSafeStringEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (!provided || !expected) return false;
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify token hợp lệ cho bước bắt tay webhook: token riêng của kênh (sinh ngẫu nhiên lúc kết nối)
 * nếu có; không thì biến môi trường đầu tiên có giá trị trong `envNames`. Giá trị mặc định cũ đã
 * công khai trong repo không được chấp nhận. Không có gì → null (caller trả 403).
 *
 * @param {object} params
 * @param {unknown} params.channelToken `credentials.verify_token` của kênh
 * @param {string[]} params.envNames tên biến môi trường theo thứ tự ưu tiên
 * @returns {string|null}
 */
export function resolveWebhookVerifyToken({ channelToken, envNames = [] }) {
  if (typeof channelToken === 'string' && channelToken.trim()) {
    // Token của kênh đã được đăng ký với nền tảng — vẫn dùng (từ chối sẽ làm hỏng bước xác minh
    // lại của kênh đó), chỉ cảnh báo nếu nó trùng giá trị đã công khai.
    if (PUBLIC_DEFAULT_VERIFY_TOKENS.has(channelToken.trim())) {
      warnOnce(
        'verify-token-public-default:channel',
        '[Webhook] Có kênh đang dùng verify token trùng giá trị mặc định đã công khai — nên kết nối lại kênh để sinh token mới.'
      );
    }
    return channelToken;
  }
  for (const name of envNames) {
    const value = String(process.env[name] || '').trim();
    if (!value) continue;
    if (PUBLIC_DEFAULT_VERIFY_TOKENS.has(value)) {
      warnOnce(
        `verify-token-public-default:${name}`,
        `[Webhook] ${name} đang mang giá trị mặc định đã công khai — bị bỏ qua. Đặt một chuỗi ngẫu nhiên.`
      );
      continue;
    }
    return value;
  }
  return null;
}

/**
 * W7a — hàm thuần cho gửi nhanh kênh adapter (Telegram/WhatsApp): cấu hình từng kênh, tách/kiểm người nhận nhập tay
 * (ĐÚNG quy tắc backend), phân loại kết quả từng người.
 */
import { parseWhatsAppPhoneList } from '../../features/campaigns/utils/nodeConfigModal.helpers';

/** Chat id Telegram — CÙNG regex backend (`telegram.campaignChannel.js` TELEGRAM_CHAT_ID_PATTERN). */
export const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/;

/**
 * Trần người/lần = trần tin/giờ mặc định của kênh (Telegram 100, WhatsApp 60). `delayFallbackMs`: khoảng chờ
 * giữa 2 tin khi FE tự giãn cách (khớp policy mặc định backend; backend vẫn là chốt chặn và trả `deferred`
 * nếu FE chờ chưa đủ).
 */
export const ADAPTER_CHANNELS = Object.freeze({
  telegram: Object.freeze({
    key: 'telegram',
    accountField: 'accountId',
    maxRecipients: 100,
    maxMessageLength: 4000,
    delayFallbackMs: Object.freeze({ minMs: 5000, maxMs: 10000 }),
  }),
  whatsapp: Object.freeze({
    key: 'whatsapp',
    accountField: 'sessionKey',
    maxRecipients: 60,
    maxMessageLength: 4096,
    delayFallbackMs: Object.freeze({ minMs: 8000, maxMs: 20000 }),
  }),
});

/**
 * Tách textarea chat id Telegram — ĐÚNG như backend: chỉ xuống dòng và dấu phẩy (KHÔNG ';'), mỗi mục phải khớp
 * `/^-?\d+$/`. Backend bỏ chat id sai định dạng IM LẶNG nên FE phải liệt kê để người dùng sửa.
 *
 * @param {unknown} text
 * @returns {{ valid: string[], invalid: string[] }}
 */
export function parseTelegramChatIdList(text) {
  const tokens = String(text ?? '')
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
  const valid = [];
  const invalid = [];
  tokens.forEach((token) => {
    if (!TELEGRAM_CHAT_ID_PATTERN.test(token)) {
      invalid.push(token);
    } else if (!valid.includes(token)) {
      valid.push(token);
    }
  });
  return { valid, invalid };
}

/**
 * @param {'telegram'|'whatsapp'} channel
 * @param {unknown} text
 * @returns {{ valid: string[], invalid: string[] }} valid đã chuẩn hoá + khử trùng
 */
export function parseManualAdapterRecipients(channel, text) {
  return channel === 'whatsapp' ? parseWhatsAppPhoneList(text) : parseTelegramChatIdList(text);
}

/** Lỗi cả tài khoản/hạn mức/hệ thống — gửi tiếp cho người sau chỉ tạo thêm lỗi -> dừng cả đợt. */
const STOP_BATCH_ERROR_CATEGORIES = new Set(['auth', 'not_configured', 'quota_exceeded', 'system_error']);

/**
 * `item.status === 'failed'` -> có dừng cả đợt không. `hard`/`transient` (người nhận cụ thể lỗi) thì đi tiếp.
 *
 * @param {{errorCategory?: string}} item
 * @returns {boolean}
 */
export function shouldStopBatchOnFailedItem(item) {
  return STOP_BATCH_ERROR_CATEGORIES.has(String(item?.errorCategory || ''));
}

/**
 * Lỗi HTTP của request gửi 1 người: 400 = riêng người đó sai dữ liệu (đi tiếp); 403 hạn mức, 409 kênh
 * tắt/tài khoản chưa sẵn sàng, 503 máy chủ đang khởi động lại = lỗi chung, dừng cả đợt; còn lại (mạng/5xx lạ) coi
 * là lỗi riêng người đó.
 *
 * @param {{response?: {status?: number}}} err
 * @returns {boolean}
 */
export function shouldStopBatchOnHttpError(err) {
  const status = Number(err?.response?.status);
  return status === 403 || status === 409 || status === 503;
}

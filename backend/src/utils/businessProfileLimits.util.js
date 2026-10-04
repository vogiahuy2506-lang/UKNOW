/**
 * Trần của hồ sơ doanh nghiệp (D-13). `business_profiles.extra_context` ("Thông tin bổ sung") là văn bản tự do và được
 * đưa NGUYÊN VĂN vào mọi prompt chatbot ("Bổ sung: …") cùng mọi chunk embedding. Trước đây không có trần (body tới 5 MB):
 * một khách dán cả cuốn cẩm nang là mỗi câu trả lời của mọi kênh mang thêm hàng chục nghìn token, mà credit vẫn 1/lượt.
 *
 *  - LƯU MỚI: quá MAX_EXTRA_CONTEXT_CHARS thì bị chặn (controller + repository), kèm câu báo tiếng Việt.
 *  - DỮ LIỆU ĐÃ LƯU từ trước: KHÔNG đổi trong DB; chỉ bị cắt khi đưa vào prompt / chunk (`clipExtraContextForPrompt`).
 */
import { truncateForPrompt } from './ragLimits.util.js';

export const MAX_EXTRA_CONTEXT_CHARS = 20000;
export const EXTRA_CONTEXT_TOO_LONG_CODE = 'EXTRA_CONTEXT_TOO_LONG';

const formatNumber = (n) => Number(n).toLocaleString('vi-VN');

/** Chỉ chuỗi mới có "độ dài ký tự"; kiểu khác (null, undefined) không bị chặn ở đây. */
export function isExtraContextTooLong(value) {
  return typeof value === 'string' && value.length > MAX_EXTRA_CONTEXT_CHARS;
}

export function buildExtraContextTooLongMessage(length) {
  return `Phần "Thông tin bổ sung" quá dài (${formatNumber(length)} ký tự, tối đa ${formatNumber(MAX_EXTRA_CONTEXT_CHARS)} ký tự). `
    + 'Bạn hãy rút gọn nội dung rồi lưu lại nhé.';
}

/** Lỗi HTTP 400 có mã máy đọc được (FE dịch theo `code`). */
export function createExtraContextTooLongError(length) {
  const err = new Error(buildExtraContextTooLongMessage(length));
  err.status = 400;
  err.code = EXTRA_CONTEXT_TOO_LONG_CODE;
  return err;
}

/**
 * Cắt `extra_context` ĐÃ LƯU khi đưa vào prompt/chunk (≤ MAX_EXTRA_CONTEXT_CHARS, cắt ở khoảng trắng, thêm "…").
 * Ngắn hơn trần thì trả nguyên văn.
 */
export function clipExtraContextForPrompt(value) {
  return truncateForPrompt(value, MAX_EXTRA_CONTEXT_CHARS);
}

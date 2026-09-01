/**
 * Tiện ích chuẩn hoá và kiểm tra số điện thoại di động Việt Nam.
 *
 * Quy tắc đầu số di động Việt Nam hiện hành:
 * - Sau số 0 là các đầu số di động: 3, 5, 7, 8, 9 (tổng cộng 10 chữ số).
 * - Phục hồi số 0 đầu nếu bị mất (do Google Sheets/Excel format dạng số): chuỗi 9 chữ số bắt đầu bằng [35789].
 * - Chuẩn hoá mã quốc gia +84 / 84 về dạng 0... chuẩn nội địa.
 */

const VIETNAMESE_MOBILE_REGEX = /^0[35789]\d{8}$/;
const RAW_VIETNAMESE_PHONE_REGEX = /^(?:\+?84|0)[35789]\d{8}$/;

/**
 * Chuẩn hoá chuỗi số điện thoại:
 * - Bỏ khoảng trắng, dấu gạch nối, dấu chấm, ngoặc đơn
 * - Chuyển +84 / 84 về đầu 0
 * - Thêm số 0 đầu nếu là chuỗi 9 chữ số di động (do Sheet/Excel nuốt số 0)
 *
 * @param {string|number} raw
 * @returns {string} số đã chuẩn hoá
 */
export function normalizeVietnamesePhone(raw) {
  if (raw === undefined || raw === null) return '';
  let cleaned = String(raw).trim().replace(/[\s().-]/g, '');
  if (!cleaned) return '';

  // Chuyển +84... hoặc 84... (11-12 ký tự) có 9 chữ số di động phía sau về 0...
  if (/^(?:\+84|84)([35789]\d{8})$/.test(cleaned)) {
    cleaned = `0${cleaned.replace(/^(?:\+84|84)/, '')}`;
  }
  // Phục hồi số 0 đầu cho 9 chữ số di động [35789]xxxxxxx
  else if (/^[35789]\d{8}$/.test(cleaned)) {
    cleaned = `0${cleaned}`;
  }

  return cleaned;
}

/**
 * Kiểm tra xem giá trị có phải là số điện thoại di động Việt Nam hợp lệ hay không.
 * Tự động chuẩn hoá trước khi so khớp.
 *
 * @param {string|number} value
 * @returns {boolean}
 */
export function isValidVietnamesePhone(value) {
  const normalized = normalizeVietnamesePhone(value);
  return VIETNAMESE_MOBILE_REGEX.test(normalized);
}

export { VIETNAMESE_MOBILE_REGEX, RAW_VIETNAMESE_PHONE_REGEX };

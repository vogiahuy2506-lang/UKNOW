/**
 * Chuẩn hóa và kiểm tra số điện thoại tài khoản ở frontend — khớp chính xác từng bước với backend
 * (`normalizePhoneForZaloCampaign` và `isValidAccountPhone` trong backend/src/utils/zaloPhoneCampaign.util.js).
 *
 * Quy tắc:
 * - Chỉ giữ chữ số, 84xxxxxxxxxx → 0xxxxxxxxxx.
 * - 9 số bắt đầu bằng 9 → 09xxxxxxxx.
 * - Chuẩn di động Việt Nam 10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09 (/^0[35789]\d{8}$/).
 */

/**
 * Chuẩn hoá số điện thoại tài khoản tương tự backend:
 * - Bỏ mọi ký tự không phải số.
 * - Nếu bắt đầu bằng 84 và có độ dài >= 10 số: thay 84 bằng 0.
 * - Nếu có 9 chữ số và bắt đầu bằng 9: thêm số 0 đầu.
 * - Cắt tối đa 20 ký tự.
 *
 * @param {string|number|null|undefined} raw
 * @returns {string}
 */
export function normalizeAccountPhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('84') && digits.length >= 10) {
    return `0${digits.slice(2)}`.slice(0, 20);
  }
  if (digits.length === 9 && digits.startsWith('9')) {
    return `0${digits}`.slice(0, 20);
  }
  return digits.slice(0, 20);
}

/**
 * Kiểm tra xem giá trị nhập vào có phải là số di động Việt Nam 10 số hợp lệ hay không.
 *
 * @param {string|number|null|undefined} value
 * @returns {boolean}
 */
export function isValidAccountPhone(value) {
  const normalized = normalizeAccountPhone(value);
  return /^0[35789]\d{8}$/.test(normalized);
}

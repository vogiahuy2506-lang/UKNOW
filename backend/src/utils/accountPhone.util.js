import { VIETNAMESE_MOBILE_REGEX } from './vietnamesePhone.util.js';

export const INVALID_ACCOUNT_PHONE_MESSAGE =
  'Số điện thoại không hợp lệ. Nhập số di động hoặc số bàn Việt Nam (vd 0912345678, 02838123456); số nước ngoài ghi kèm mã quốc gia (vd +1 415 555 2671)';

export const OTP_MOBILE_ONLY_MESSAGE =
  'Xác thực bằng mã SMS chỉ hỗ trợ số di động Việt Nam';

const VIETNAM_LANDLINE_REGEX = /^02\d{9}$/;
const INTERNATIONAL_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

/**
 * Chuẩn hoá số điện thoại tài khoản theo luật mới (15/09/2026):
 * - Bỏ khoảng trắng, (), -, .
 * - +84 / 0084: chuyển thành 0... (nếu sau đó có số 0 thừa thì bỏ một số 0)
 * - + hoặc 00 (mã khác 84): số quốc tế, lưu dạng +[digits]
 * - Còn lại: số nội địa VN: 84... -> 0..., 9 số đầu 9 -> thêm 0.
 *
 * @param {string|number|null|undefined} raw
 * @returns {string}
 */
export function normalizeAccountPhone(raw) {
  if (raw === undefined || raw === null) return '';
  const compact = String(raw).trim().replace(/[\s().-]/g, '');
  if (!compact) return '';

  // 1. Bắt đầu bằng +84 hoặc 0084 (Việt Nam có mã quốc gia)
  if (compact.startsWith('+84') || compact.startsWith('0084')) {
    const prefixLen = compact.startsWith('+84') ? 3 : 4;
    let digits = compact.slice(prefixLen).replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    return `0${digits}`.slice(0, 20);
  }

  // 2. Bắt đầu bằng + hoặc 00 (quốc tế mã khác 84)
  if (compact.startsWith('+')) {
    const digits = compact.slice(1).replace(/\D/g, '');
    return `+${digits}`.slice(0, 20);
  }
  if (compact.startsWith('00')) {
    const digits = compact.slice(2).replace(/\D/g, '');
    return `+${digits}`.slice(0, 20);
  }

  // 3. Còn lại: VN trong nước
  const digits = compact.replace(/\D/g, '');
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
 * Kiểm tra xem chuỗi SĐT (đã qua normalizeAccountPhone) có phải là số di động Việt Nam hay không.
 * @param {string|null|undefined} normalized
 * @returns {boolean}
 */
export function isVietnamMobilePhone(normalized) {
  return VIETNAMESE_MOBILE_REGEX.test(String(normalized ?? ''));
}

/**
 * Kiểm tra tính hợp lệ của số điện thoại tài khoản (đã qua normalizeAccountPhone):
 * - Số quốc tế: + mã quốc gia không bắt đầu bằng 0, tổng 8-15 chữ số E.164.
 * - Số Việt Nam: di động 10 số (03/05/07/08/09) hoặc số bàn 11 số (02xxxxxxxxx).
 *
 * @param {string|null|undefined} normalized
 * @returns {boolean}
 */
export function isValidAccountPhone(normalized) {
  const str = String(normalized ?? '');
  if (str.startsWith('+')) {
    return INTERNATIONAL_PHONE_REGEX.test(str);
  }
  return isVietnamMobilePhone(str) || VIETNAM_LANDLINE_REGEX.test(str);
}

import crypto from 'crypto';

/**
 * Bảng chữ cái 32 ký tự: A-Z và 2-9, loại trừ 'O', '0', 'I', '1'
 * để dễ đọc qua điện thoại và tránh nhầm lẫn khi gõ tay.
 */
export const REFERRAL_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Sinh mã giới thiệu ngẫu nhiên (mặc định 8 ký tự).
 * 32^8 ≈ 1.1 nghìn tỷ kết hợp, xác suất trùng lặp cực thấp.
 *
 * @param {number} [length=8]
 * @returns {string}
 */
export function generateReferralCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += REFERRAL_CODE_ALPHABET[bytes[i] % REFERRAL_CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Chuẩn hoá mã giới thiệu nhập vào: bỏ khoảng trắng thừa và viết hoa.
 *
 * @param {string|null|undefined} code
 * @returns {string}
 */
export function normalizeReferralCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

/**
 * Kiểm tra định dạng mã giới thiệu: 4-16 ký tự thuộc bảng chữ cái hợp lệ.
 *
 * @param {string|null|undefined} code
 * @returns {boolean}
 */
export function isValidReferralCodeFormat(code) {
  const normalized = normalizeReferralCode(code);
  if (normalized.length < 4 || normalized.length > 16) return false;
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/.test(normalized);
}

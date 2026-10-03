/**
 * Mã khôi phục 2FA: 10 ký tự từ bảng không nhầm lẫn (bỏ 0/O/1/I), hiển thị `ABCDE-FGHJK`.
 * ~50 bit ngẫu nhiên nên sha256 là đủ (không phải mật khẩu người đặt → không cần bcrypt).
 */
import crypto from 'node:crypto';

export const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RECOVERY_CODE_LENGTH = 10;

function randomChar() {
  // 32 ký tự → 256 % 32 === 0, không lệch phân phối.
  return RECOVERY_ALPHABET[crypto.randomBytes(1)[0] % RECOVERY_ALPHABET.length];
}

/** @returns {string[]} n mã dạng ABCDE-FGHJK */
export function generateRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    let raw = '';
    for (let i = 0; i < RECOVERY_CODE_LENGTH; i += 1) raw += randomChar();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

/** Upper + bỏ mọi ký tự ngoài bảng. */
export function normalizeRecoveryCode(input) {
  return String(input || '')
    .toUpperCase()
    .split('')
    .filter((ch) => RECOVERY_ALPHABET.includes(ch))
    .join('');
}

/** Chuỗi có đúng dạng mã khôi phục (10 ký tự bảng, có/không dấu gạch) không. */
export function looksLikeRecoveryCode(input) {
  const s = String(input || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(s)) return false;
  return normalizeRecoveryCode(s).length === RECOVERY_CODE_LENGTH && s.replace(/-/g, '').length === RECOVERY_CODE_LENGTH;
}

export function hashRecoveryCode(input) {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(input)).digest('hex');
}

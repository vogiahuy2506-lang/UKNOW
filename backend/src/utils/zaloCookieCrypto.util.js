import {
  decryptSmtpSecret,
  encryptSmtpSecret,
  isEncryptedSmtpSecret,
} from './smtpSecretCrypto.js';

/**
 * Mã hóa cookie Zalo at-rest — cookie là credential đăng nhập phiên Zalo,
 * dùng cùng cơ chế AES-256-GCM + SMTP_SECRET_KEY như mật khẩu SMTP
 * (cùng format `enc:v1:` nên decrypt tương thích ngược với plaintext cũ).
 *
 * Nguyên tắc an toàn vận hành:
 * - Ghi: mã hóa; nếu thiếu key (hoặc lỗi mã hóa khác) thì NÉM lỗi, KHÔNG lưu
 *   plaintext — cookie là bí mật đăng nhập phiên Zalo, ghi plaintext vào DB khi
 *   cấu hình sai còn nguy hiểm hơn là chặn lần ghi này. SMTP_SECRET_KEY vốn bắt
 *   buộc nên production đã có; throw chỉ xảy ra khi cấu hình sai.
 * - Đọc: bản ghi plaintext cũ trả nguyên (tự nâng cấp dần khi keep-alive ghi lại);
 *   giải mã thất bại (sai key) → trả '' để flow coi như mất cookie, user quét QR lại,
 *   thay vì đưa chuỗi rác vào zca-js gây lỗi khó hiểu.
 */

export function encryptZaloCookie(cookieText) {
  if (cookieText == null) return cookieText;
  const value = String(cookieText);
  if (!value.trim()) return cookieText;
  return encryptSmtpSecret(value);
}

export function decryptZaloCookie(storedValue) {
  if (storedValue == null) return storedValue;
  const value = String(storedValue);
  if (!isEncryptedSmtpSecret(value)) return storedValue;
  try {
    return decryptSmtpSecret(value);
  } catch (err) {
    console.error('[ZaloCookieCrypto] Giải mã cookie thất bại (sai SMTP_SECRET_KEY?) — coi như không có cookie:', err.message);
    return '';
  }
}

// Helpers cho repository: giải mã cột cookie_text ngay tại SQL boundary
// để mọi tầng service phía trên vẫn thấy plaintext như trước.
export function decryptZaloCookieRow(row) {
  if (row && row.cookie_text != null) {
    row.cookie_text = decryptZaloCookie(row.cookie_text);
  }
  return row;
}

export function decryptZaloCookieRows(rows) {
  (rows || []).forEach(decryptZaloCookieRow);
  return rows;
}

/**
 * Mã hoá secret TOTP — dùng lại đúng cơ chế AES-256-GCM của smtpSecretCrypto (khoá SMTP_SECRET_KEY,
 * định dạng `enc:v1:iv:tag:cipher`). Wrapper để đổi khoá/định dạng sau này chỉ sửa một chỗ.
 *
 * LƯU Ý: decryptSmtpSecret KHÔNG ném khi gặp giá trị không có prefix (trả nguyên plaintext để
 * tương thích bản ghi SMTP cũ) — secret TOTP thì không có "bản cũ", nên ở đây ném lỗi.
 */
import { encryptSmtpSecret, decryptSmtpSecret, isEncryptedSmtpSecret } from './smtpSecretCrypto.js';

export function encryptTotpSecret(secret) {
  const out = encryptSmtpSecret(secret);
  if (!isEncryptedSmtpSecret(out)) throw new Error('Không mã hoá được secret TOTP');
  return out;
}

export function decryptTotpSecret(stored) {
  if (!isEncryptedSmtpSecret(stored)) {
    throw new Error('Secret TOTP trong DB không ở dạng mã hoá (enc:v1:)');
  }
  const plain = decryptSmtpSecret(stored);
  if (!plain) throw new Error('Secret TOTP rỗng sau khi giải mã');
  return plain;
}

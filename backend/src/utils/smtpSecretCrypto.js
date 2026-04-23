import crypto from 'crypto';

const SMTP_SECRET_PREFIX = 'enc:v1:';
const SMTP_CIPHER = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Tạo khóa mã hóa cố định 32 bytes từ biến môi trường.
 *
 * Luồng hoạt động:
 * 1. Ưu tiên lấy `SMTP_SECRET_KEY` để tách biệt với các secret khác.
 * 2. Fallback qua `JWT_SECRET` hoặc `TOKEN_SECRET` để giữ tương thích môi trường cũ.
 * 3. Dùng SHA-256 để chuẩn hóa thành độ dài khóa hợp lệ cho AES-256-GCM.
 *
 * @returns {Buffer} khóa mã hóa 32 bytes
 */
function getSmtpCryptoKey() {
  const rawSecret =
    String(process.env.SMTP_SECRET_KEY || '').trim() ||
    String(process.env.JWT_SECRET || '').trim() ||
    String(process.env.TOKEN_SECRET || '').trim() ||
    'uknow-default-smtp-secret-change-me';

  return crypto.createHash('sha256').update(rawSecret, 'utf8').digest();
}

/**
 * Kiểm tra giá trị có phải chuỗi đã mã hóa theo chuẩn SMTP secret hay chưa.
 *
 * @param {string} value giá trị cần kiểm tra
 * @returns {boolean} true nếu đã mã hóa với prefix chuẩn
 */
export function isEncryptedSmtpSecret(value) {
  return String(value || '').startsWith(SMTP_SECRET_PREFIX);
}

/**
 * Mã hóa SMTP password trước khi lưu DB.
 *
 * Luồng hoạt động:
 * 1. Nếu dữ liệu đã mã hóa thì giữ nguyên để tránh mã hóa lặp.
 * 2. Tạo IV ngẫu nhiên cho từng lần mã hóa.
 * 3. Mã hóa theo AES-256-GCM và ghép `iv:authTag:cipherText`.
 *
 * @param {string} plainText mật khẩu SMTP dạng thô
 * @returns {string} chuỗi đã mã hóa có prefix `enc:v1:`
 */
export function encryptSmtpSecret(plainText) {
  const value = String(plainText || '');
  if (!value) return '';
  if (isEncryptedSmtpSecret(value)) return value;

  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getSmtpCryptoKey();
  const cipher = crypto.createCipheriv(SMTP_CIPHER, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${SMTP_SECRET_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Giải mã SMTP password để dùng khi tạo SMTP transporter.
 *
 * Luồng hoạt động:
 * 1. Nếu dữ liệu chưa mã hóa (bản ghi cũ) thì trả nguyên giá trị để tương thích ngược.
 * 2. Nếu dữ liệu đã mã hóa, tách iv/authTag/cipherText theo định dạng chuẩn.
 * 3. Giải mã và trả về password dạng thô cho bước gửi email.
 *
 * @param {string} storedValue giá trị lưu trong DB
 * @returns {string} mật khẩu SMTP dạng thô
 */
export function decryptSmtpSecret(storedValue) {
  const value = String(storedValue || '');
  if (!value) return '';
  if (!isEncryptedSmtpSecret(value)) return value;

  const rawPayload = value.slice(SMTP_SECRET_PREFIX.length);
  const [ivHex, authTagHex, encryptedHex] = rawPayload.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Dữ liệu SMTP password mã hóa không hợp lệ');
  }

  const key = getSmtpCryptoKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(SMTP_CIPHER, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

import crypto from 'crypto';

const PII_SECRET_PREFIX = 'enc:v1:';
const CIPHER_ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

const AFFILIATE_PII_KEY_ENV = 'AFFILIATE_PII_SECRET_KEY';

/**
 * Tạo khóa mã hóa cố định 32 bytes từ AFFILIATE_PII_SECRET_KEY.
 * TUYỆT ĐỐI KHÔNG dùng lại SMTP_SECRET_KEY hoặc JWT_SECRET.
 *
 * @returns {Buffer} khóa mã hóa 32 bytes
 * @throws {Error} nếu thiếu biến môi trường
 */
export function getAffiliatePiiCryptoKey() {
  const rawSecret = String(process.env[AFFILIATE_PII_KEY_ENV] || '').trim();
  if (!rawSecret) {
    const error = new Error(
      'Thiếu biến môi trường AFFILIATE_PII_SECRET_KEY (bắt buộc để mã hóa/giải mã thông tin CCCD đối tác).'
    );
    error.code = 'AFFILIATE_PII_SECRET_KEY_MISSING';
    error.status = 500;
    throw error;
  }

  return crypto.createHash('sha256').update(rawSecret, 'utf8').digest();
}

/**
 * Kiểm tra giá trị có phải chuỗi đã mã hóa theo chuẩn PII secret hay chưa.
 *
 * @param {string} value giá trị cần kiểm tra
 * @returns {boolean} true nếu đã mã hóa với prefix chuẩn
 */
export function isEncryptedAffiliatePii(value) {
  return String(value || '').startsWith(PII_SECRET_PREFIX);
}

/**
 * Mã hóa số CCCD trước khi lưu DB.
 *
 * @param {string} plainText số CCCD dạng thô
 * @returns {string} chuỗi đã mã hóa có prefix `enc:v1:`
 */
export function encryptAffiliatePii(plainText) {
  const value = String(plainText || '').trim();
  if (!value) return '';
  if (isEncryptedAffiliatePii(value)) return value;

  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getAffiliatePiiCryptoKey();
  const cipher = crypto.createCipheriv(CIPHER_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PII_SECRET_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Giải mã số CCCD từ DB (dùng cho admin).
 *
 * @param {string} storedValue giá trị lưu trong DB
 * @returns {string} số CCCD dạng thô
 */
export function decryptAffiliatePii(storedValue) {
  const value = String(storedValue || '').trim();
  if (!value) return '';
  if (!isEncryptedAffiliatePii(value)) return value;

  const rawPayload = value.slice(PII_SECRET_PREFIX.length);
  const [ivHex, authTagHex, encryptedHex] = rawPayload.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Dữ liệu CCCD mã hóa không hợp lệ');
  }

  const key = getAffiliatePiiCryptoKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(CIPHER_ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

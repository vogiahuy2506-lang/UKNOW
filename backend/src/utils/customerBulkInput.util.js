/**
 * Kiểm đầu vào từng dòng của `POST /api/customers/bulk`.
 *
 * Trước đây bulk nhận mọi thứ: email/SĐT rác lọt thẳng vào DB, chuỗi quá dài làm cả transaction nổ 500,
 * `consentSource` do client tự khai tuỳ ý, và không có trần số dòng. Hàm ở đây thuần (không DB) để test được.
 */
import { isValidVietnamesePhone } from './vietnamesePhone.util.js';

/** Trần số dòng mỗi lần nhập — mỗi dòng là 1–2 truy vấn trong CÙNG một transaction. */
export const BULK_MAX_ITEMS = 2000;

/** `consentSource` do client tự khai chỉ được là hai giá trị này (các nguồn khác do server tự suy ra). */
export const BULK_ALLOWED_CONSENT_SOURCES = Object.freeze(['manual', 'import']);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Số quốc tế dạng E.164 (8–15 chữ số, có thể có +) cho khách ngoài Việt Nam.
const INTERNATIONAL_PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;

/** Cột `customers` đang giới hạn độ dài (VARCHAR) — vượt là INSERT nổ lỗi, hỏng cả lô. */
const MAX_LENGTH_BY_FIELD = Object.freeze({
  email: 254,
  phone: 50,
  zaloPhone: 50,
  zaloId: 255,
  facebookId: 255,
  fullName: 255,
  sourceLandingPage: 255,
  sourceFormId: 255,
  utmSource: 255,
  utmMedium: 255,
  utmCampaign: 255,
});

/**
 * @param {string} email đã trim
 * @returns {boolean}
 */
export function isValidContactEmail(email) {
  return typeof email === 'string' && email.length <= MAX_LENGTH_BY_FIELD.email && EMAIL_PATTERN.test(email);
}

/**
 * Hợp lệ nếu là di động Việt Nam (chấp nhận 0xxx / 84xxx / +84xxx / thiếu số 0 do Excel) hoặc số quốc tế E.164.
 *
 * @param {string} phone đã trim
 * @returns {boolean}
 */
export function isValidContactPhone(phone) {
  if (typeof phone !== 'string' || phone.length === 0 || phone.length > MAX_LENGTH_BY_FIELD.phone) return false;
  if (isValidVietnamesePhone(phone)) return true;
  const compact = phone.replace(/[\s().-]/g, '');
  return INTERNATIONAL_PHONE_PATTERN.test(compact);
}

/**
 * Kiểm một dòng đã chuẩn hoá (chuỗi đã trim, rỗng -> null). Trả danh sách lỗi theo trường; mảng rỗng = hợp lệ.
 *
 * @param {object} fields các trường đã chuẩn hoá: email, phone, zaloPhone, zaloId, facebookId, fullName,
 *   sourceLandingPage, sourceFormId, utmSource, utmMedium, utmCampaign (string|null)
 * @param {unknown} explicitConsentSource giá trị client tự khai (item.consentSource / consent_source), nếu có
 * @returns {Array<{ field: string, message: string }>}
 */
export function validateBulkItemFields(fields, explicitConsentSource) {
  const errors = [];

  if (fields.email && !isValidContactEmail(fields.email)) {
    errors.push({ field: 'email', message: 'Email không hợp lệ' });
  }
  if (fields.phone && !isValidContactPhone(fields.phone)) {
    errors.push({ field: 'phone', message: 'Số điện thoại không hợp lệ' });
  }

  for (const [field, max] of Object.entries(MAX_LENGTH_BY_FIELD)) {
    if (field === 'email' || field === 'phone') continue; // đã có thông báo riêng ở trên
    const value = fields[field];
    if (typeof value === 'string' && value.length > max) {
      errors.push({ field, message: `Tối đa ${max} ký tự` });
    }
  }

  if (explicitConsentSource !== undefined && explicitConsentSource !== null && String(explicitConsentSource).trim() !== '') {
    const normalized = String(explicitConsentSource).trim().toLowerCase();
    if (!BULK_ALLOWED_CONSENT_SOURCES.includes(normalized)) {
      errors.push({
        field: 'consentSource',
        message: `consentSource chỉ nhận: ${BULK_ALLOWED_CONSENT_SOURCES.join(', ')}`,
      });
    }
  }

  return errors;
}

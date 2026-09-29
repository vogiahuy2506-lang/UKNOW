/**
 * Cấu hình phiên bản và mã băm SHA-256 của các văn bản pháp lý (Nghị định 330/2026/NĐ-CP).
 *
 * NGUYÊN TẮC:
 * 1. Hằng số phiên bản và hash của văn bản nằm tại MỘT CHỖ DUY NHẤT ở đây.
 * 2. Khi sửa nội dung bất kỳ văn bản nào (TermsOfService.jsx, PrivacyPolicy.jsx, PublicDPA.jsx),
 *    BẮT BUỘC phải tính lại hash và tăng version tại file này.
 * 3. Unit test `legalDocuments.config.spec.js` sẽ tự động kiểm tra hash này với file frontend thật;
 *    nếu nội dung bị sửa mà chưa tăng version/hash thì test sẽ fail đỏ.
 */

import crypto from 'crypto';

export const LEGAL_DOCUMENTS = Object.freeze({
  terms: {
    purpose: 'terms',
    version: '2026-09-28',
    hash: '56757a5e6b14f3f722c8cf238c9324cd2f7ee09d69a9882155bbb7240187d4c5',
    title: 'Điều khoản dịch vụ',
    path: '/terms',
    frontendRelativePath: 'src/pages/public/TermsOfService.jsx',
  },
  privacy: {
    purpose: 'privacy',
    version: '2026-09-29',
    hash: '382c7f7663bf665e7c19a82c440f5b3727c979d83d8649cc9e871b4ace3c6b77',
    title: 'Chính sách bảo mật',
    path: '/privacy-policy',
    frontendRelativePath: 'src/pages/public/PrivacyPolicy.jsx',
  },
  dpa: {
    purpose: 'dpa',
    version: '2026-09-29',
    hash: '0a8237210c313c16c3305dc86a5bfd65116490f2227f38eba65d1aa28412a1d8',
    title: 'Thỏa thuận xử lý dữ liệu (DPA)',
    path: '/public-dpa',
    frontendRelativePath: 'src/pages/public/PublicDPA.jsx',
  },
});

export const REQUIRED_REGISTRATION_PURPOSES = Object.freeze(['terms', 'privacy', 'dpa']);

/**
 * Lấy thông tin văn bản pháp lý theo purpose.
 * @param {string} purpose
 * @returns {typeof LEGAL_DOCUMENTS[keyof typeof LEGAL_DOCUMENTS] | null}
 */
export function getLegalDocument(purpose) {
  return LEGAL_DOCUMENTS[purpose] || null;
}

/**
 * Tính SHA-256 hash của văn bản (chuẩn hóa xuống \n để tránh lệch trên Windows/Linux).
 * @param {string|Buffer} content
 * @returns {string} 64 ký tự hex SHA-256
 */
export function computeDocumentHash(content) {
  const text = typeof content === 'string' ? content : content.toString('utf8');
  const normalized = text.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Kiểm tra tính hợp lệ của consents khi đăng ký (Nghị định 330/2026/NĐ-CP).
 * Bắt buộc object có đủ terms === true, privacy === true, dpa === true.
 * Dùng chung cho cả đăng ký thường và đăng ký qua Google OAuth.
 * @param {any} consents
 * @throws {{ status: number, code: string, message: string }}
 * @returns {boolean}
 */
export function validateRegistrationConsents(consents) {
  if (
    !consents ||
    typeof consents !== 'object' ||
    consents.terms !== true ||
    consents.privacy !== true ||
    consents.dpa !== true
  ) {
    const error = new Error('Bạn cần đồng ý với Điều khoản dịch vụ, Chính sách bảo mật và Thỏa thuận xử lý dữ liệu để đăng ký tài khoản.');
    error.status = 400;
    error.code = 'CONSENT_REQUIRED';
    throw error;
  }
  return true;
}

export default {
  LEGAL_DOCUMENTS,
  REQUIRED_REGISTRATION_PURPOSES,
  getLegalDocument,
  computeDocumentHash,
  validateRegistrationConsents,
};

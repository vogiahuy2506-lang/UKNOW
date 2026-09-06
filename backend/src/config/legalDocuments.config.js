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
    version: '2026-09-01',
    hash: '7663f91c3a8824d963c9ff63f825fa8119a0f20a95a3b246d19b6e64c0ed037c',
    title: 'Điều khoản dịch vụ',
    path: '/terms',
    frontendRelativePath: 'src/pages/public/TermsOfService.jsx',
  },
  privacy: {
    purpose: 'privacy',
    version: '2026-09-01',
    hash: 'e00a3d396f999ac3a9969fc1e3a63da48534729ccc7c531bdd6595e085b8dda6',
    title: 'Chính sách bảo mật',
    path: '/privacy-policy',
    frontendRelativePath: 'src/pages/public/PrivacyPolicy.jsx',
  },
  dpa: {
    purpose: 'dpa',
    version: '2026-09-01',
    hash: '60f1810c3ea08f15de6b6cc3c9a1c38d0f1a0e9957e68efae6fe660269ddffbc',
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

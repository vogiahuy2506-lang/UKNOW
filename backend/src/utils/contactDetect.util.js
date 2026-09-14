import {
  normalizeVietnamesePhone,
  isValidVietnamesePhone,
} from './vietnamesePhone.util.js';

/**
 * Regex ứng viên số điện thoại di động Việt Nam:
 * Yêu cầu có tiền tố rõ ràng (+84, 84, 0, hoặc có ngoặc như (0..., (+84...)
 * theo sau bởi đúng 9 chữ số (cho phép khoảng trắng, chấm, gạch, ngoặc xen giữa),
 * và ký tự kết thúc không được là chữ số tiếp theo.
 */
const PHONE_CANDIDATE_REGEX = /(?:\+84|(?<!\d)84|(?<!\d)0|\((?:\+84|84|0))(?:[\s.\-()]*\d){9}(?!\d)/g;

/**
 * Regex địa chỉ email tiêu chuẩn trong văn bản tự do
 */
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const MAX_EMAIL_LENGTH = 254;

/**
 * Nhận diện và trích xuất số điện thoại / email khách để lại trong văn bản hội thoại.
 * Thuần logic, không truy vấn cơ sở dữ liệu.
 *
 * @param {string} text - Nội dung tin nhắn
 * @returns {Array<{ type: 'phone'|'email', value: string, raw: string }>} Danh sách liên hệ duy nhất theo value
 */
export function extractContacts(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return [];
  }

  const results = [];
  const seenValues = new Set();

  // 1. Quét số điện thoại
  const phoneMatches = text.matchAll(PHONE_CANDIDATE_REGEX);
  for (const match of phoneMatches) {
    const raw = match[0].trim();
    const normalized = normalizeVietnamesePhone(raw);
    if (isValidVietnamesePhone(normalized)) {
      if (!seenValues.has(normalized)) {
        seenValues.add(normalized);
        results.push({
          type: 'phone',
          value: normalized,
          raw,
        });
      }
    }
  }

  // 2. Quét email
  const emailMatches = text.matchAll(EMAIL_REGEX);
  for (const match of emailMatches) {
    const raw = match[0].trim();
    const normalized = raw.toLowerCase().trim();
    if (normalized.length <= MAX_EMAIL_LENGTH) {
      if (!seenValues.has(normalized)) {
        seenValues.add(normalized);
        results.push({
          type: 'email',
          value: normalized,
          raw,
        });
      }
    }
  }

  return results;
}

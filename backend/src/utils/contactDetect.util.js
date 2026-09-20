import {
  normalizeVietnamesePhone,
  isValidVietnamesePhone,
} from './vietnamesePhone.util.js';

/**
 * Tầng A — số điện thoại có tiền tố rõ ràng (+84, 84, 0, hoặc có ngoặc như (0..., (+84...)
 * theo sau bởi đúng 9 chữ số (cho phép khoảng trắng, chấm, gạch, ngoặc xen giữa),
 * và ký tự kết thúc không được là chữ số tiếp theo. Luôn nhận, không cần ngữ cảnh.
 */
const PHONE_CANDIDATE_REGEX = /(?:\+84|(?<!\d)84|(?<!\d)0|\((?:\+84|84|0))(?:[\s.\-()]*\d){9}(?!\d)/g;

/**
 * Tầng B — số 9 chữ số dạng di động Việt Nam bị MẤT số 0 đầu ("844790999", "912 345 678").
 * Khách gõ thiếu số 0 là chuyện rất thường (14/09/2026: khách gõ "liên hệ tôi qua số 844790999",
 * bot tự hiểu là 0844790999 nhưng máy quét bỏ qua). Chỉ nhận khi CÓ NGỮ CẢNH LIÊN HỆ ở gần
 * (xem CONTACT_CONTEXT_REGEX) để "Mã đơn hàng 912345678" không thành số điện thoại.
 * Không được đứng ngay sau chữ số hoặc dấu + (khi đó tầng A đã lo, hoặc là dãy số dài).
 */
const BARE_PHONE_CANDIDATE_REGEX = /(?<![\d+])[35789](?:[\s.\-]*\d){8}(?![\s.\-]*\d)/g;

/** Từ ngữ cho thấy dãy số bên cạnh là số liên hệ. Chỉ soi trong cửa sổ hẹp quanh dãy số. */
const CONTACT_CONTEXT_REGEX =
  /(số|sđt|sdt|đt|điện thoại|dien thoai|phone|tel|zalo|gọi|goi|alo|liên hệ|lien he|contact|call|hotline|nhắn|nhan tin|mobile|di động|di dong|viber|whatsapp|telegram)/i;
const CONTEXT_BEFORE_CHARS = 24;
const CONTEXT_AFTER_CHARS = 16;

/**
 * Regex địa chỉ email tiêu chuẩn trong văn bản tự do
 */
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const MAX_EMAIL_LENGTH = 254;

function hasContactContext(text, start, end) {
  const before = text.slice(Math.max(0, start - CONTEXT_BEFORE_CHARS), start);
  const after = text.slice(end, end + CONTEXT_AFTER_CHARS);
  return CONTACT_CONTEXT_REGEX.test(before) || CONTACT_CONTEXT_REGEX.test(after);
}

/**
 * Đầu số di động Việt Nam đang lưu hành (sau quy đổi 11→10 số năm 2018):
 * 03[2-9] · 05[2689] · 07[06789] · 08[1-9] · 09x.
 * Cục bộ cho máy quét liên hệ — KHÔNG siết `vietnamesePhone.util.js`, xem Bẫy 3.
 */
const VN_MOBILE_PREFIX_REGEX = /^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9\d)\d{7}$/;

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

  const pushPhone = (raw) => {
    const normalized = normalizeVietnamesePhone(raw);
    if (!isValidVietnamesePhone(normalized) || seenValues.has(normalized)) return;
    if (!VN_MOBILE_PREFIX_REGEX.test(normalized)) return;
    seenValues.add(normalized);
    results.push({ type: 'phone', value: normalized, raw });
  };

  // 1A. Số điện thoại có tiền tố rõ ràng
  for (const match of text.matchAll(PHONE_CANDIDATE_REGEX)) {
    pushPhone(match[0].trim());
  }

  // 1B. Số 9 chữ số mất số 0 đầu, chỉ khi có ngữ cảnh liên hệ quanh đó
  for (const match of text.matchAll(BARE_PHONE_CANDIDATE_REGEX)) {
    const start = match.index;
    const end = start + match[0].length;
    if (!hasContactContext(text, start, end)) continue;
    pushPhone(match[0].trim());
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

import { createContactSubmission, countRecentSubmissionsByEmail } from '../repositories/contact.repository.js';

const VALID_COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'];

/**
 * Xử lý submission từ trang /contact. Throw error có { status, message } khi validation fail.
 */
export async function submitContactForm({ name, email, phone, company, companySize, message, ipAddress }) {
  const trimmedName = String(name || '').trim();
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const trimmedMessage = String(message || '').trim();

  if (!trimmedName || trimmedName.length < 2) {
    throw { status: 400, message: 'Vui lòng nhập họ tên hợp lệ (ít nhất 2 ký tự)' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw { status: 400, message: 'Email không hợp lệ' };
  }
  if (phone && !/^[0-9+\-\s()]{8,20}$/.test(phone)) {
    throw { status: 400, message: 'Số điện thoại không hợp lệ' };
  }
  if (companySize && !VALID_COMPANY_SIZES.includes(companySize)) {
    throw { status: 400, message: 'Quy mô doanh nghiệp không hợp lệ' };
  }
  if (!trimmedMessage || trimmedMessage.length < 10) {
    throw { status: 400, message: 'Vui lòng mô tả nhu cầu ít nhất 10 ký tự' };
  }
  if (trimmedMessage.length > 5000) {
    throw { status: 400, message: 'Lời nhắn quá dài (tối đa 5000 ký tự)' };
  }

  // Rate limit: tối đa 3 submission/email trong 5 phút
  const recent = await countRecentSubmissionsByEmail(trimmedEmail, 5);
  if (recent >= 3) {
    throw {
      status: 429,
      message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
    };
  }

  return createContactSubmission({
    name: trimmedName,
    email: trimmedEmail,
    phone: phone ? String(phone).trim() : null,
    company: company ? String(company).trim() : null,
    companySize: companySize || null,
    message: trimmedMessage,
    ipAddress,
  });
}

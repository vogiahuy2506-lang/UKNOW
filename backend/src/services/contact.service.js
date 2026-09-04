import { createContactSubmission, countRecentSubmissionsByEmail } from '../repositories/contact.repository.js';
import { sendSystemEmail, buildContactNotificationEmail } from '../utils/systemEmail.util.js';

const CONTACT_NOTIFICATION_EMAIL = process.env.CONTACT_NOTIFICATION_EMAIL || 'hotro.digibook@gmail.com';

/**
 * Xử lý submission từ trang /contact. Throw error có { status, message } khi validation fail.
 */
export async function submitContactForm({ name, email, phone, company, message, ipAddress }) {
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

  const submission = await createContactSubmission({
    name: trimmedName,
    email: trimmedEmail,
    phone: phone ? String(phone).trim() : null,
    company: company ? String(company).trim() : null,
    message: trimmedMessage,
    ipAddress,
  });

  // Gửi email notification cho team (không block response nếu email fail)
  sendContactNotification({
    name: trimmedName,
    email: trimmedEmail,
    phone: phone ? String(phone).trim() : null,
    company: company ? String(company).trim() : null,
    message: trimmedMessage,
    ipAddress,
  }).catch((err) => {
    console.error('[Contact] Failed to send notification email:', err?.message || err);
  });

  return submission;
}

/**
 * Gửi email thông báo cho team khi có liên hệ mới.
 * Lỗi được swallow ở caller để không ảnh hưởng flow submit.
 */
async function sendContactNotification(payload) {
  const { subject, html } = buildContactNotificationEmail(payload);
  await sendSystemEmail({
    to: CONTACT_NOTIFICATION_EMAIL,
    subject,
    html,
  });
}
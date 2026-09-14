import { normalizeVietnamesePhone } from './vietnamesePhone.util.js';

/**
 * Xây dựng note prompt và footer xác nhận khi khách để lại thông tin liên hệ.
 * @param {Array<{ type: 'phone'|'email', value: string }>} contacts
 * @param {{ email?: string|null, phone?: string|null }|null} [ownerContact=null]
 * @returns {{ note: string, footer: string } | null}
 */
export function buildContactAck(contacts, ownerContact = null) {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return null;
  }

  const normalizedOwnerPhone = ownerContact?.phone
    ? normalizeVietnamesePhone(ownerContact.phone)
    : null;
  const normalizedOwnerEmail = ownerContact?.email
    ? String(ownerContact.email).trim().toLowerCase()
    : null;

  const validContacts = contacts.filter((c) => {
    if (!c?.value) return false;
    if (c.type === 'phone' && normalizedOwnerPhone && c.value === normalizedOwnerPhone) {
      return false;
    }
    if (c.type === 'email' && normalizedOwnerEmail && c.value.toLowerCase() === normalizedOwnerEmail) {
      return false;
    }
    return true;
  });

  if (validContacts.length === 0) {
    return null;
  }

  const contactListStr = validContacts.map((c) => c.value).join(', ');
  const note = `LƯU Ý HỆ THỐNG: Khách vừa để lại liên hệ: ${contactListStr}. Hệ thống đã ghi nhận và sẽ báo cho chủ doanh nghiệp liên hệ lại. Hãy cảm ơn và xác nhận ngắn gọn. TUYỆT ĐỐI không nói rằng bạn không thể gọi/nhắn hay không lưu được thông tin. Có thể hỏi thêm khách cần hỗ trợ việc gì.`;

  const phones = validContacts.filter((c) => c.type === 'phone').map((c) => c.value);
  const emails = validContacts.filter((c) => c.type === 'email').map((c) => c.value);

  let desc = '';
  if (phones.length > 0 && emails.length > 0) {
    desc = `số điện thoại ${phones.join(', ')} và email ${emails.join(', ')}`;
  } else if (phones.length > 0) {
    desc = `số điện thoại ${phones.join(', ')}`;
  } else {
    desc = `email ${emails.join(', ')}`;
  }

  const footer = `Đã ghi nhận ${desc}. Chủ doanh nghiệp sẽ liên hệ lại với bạn sớm.`;

  return { note, footer };
}

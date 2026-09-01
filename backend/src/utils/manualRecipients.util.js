import { normalizeVietnamesePhone, isValidVietnamesePhone } from './vietnamesePhone.util.js';

export const MAX_AI_MANUAL_RECIPIENTS = 1000;

const splitRecipients = (value) => (Array.isArray(value) ? value : String(value || '').split(/[\s,;\n]+/))
  .map((item) => String(item || '').trim())
  .filter(Boolean);

export function validateManualRecipients({ emails, phones, uids } = {}) {
  const emailItems = [...new Set(splitRecipients(emails).map((email) => email.toLowerCase()))];
  const phoneItems = [...new Set(splitRecipients(phones).map((phone) => normalizeVietnamesePhone(phone)))];
  const uidItems = [...new Set(splitRecipients(uids).map((uid) => String(uid).trim()))];

  const invalidEmail = emailItems.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const invalidPhone = phoneItems.find((phone) => !isValidVietnamesePhone(phone));
  const invalidUid = uidItems.find((uid) => !/^\d{6,32}$/.test(uid));

  if (invalidEmail || invalidPhone || invalidUid) {
    let msg = 'Có email không hợp lệ trong danh sách.';
    if (invalidPhone) msg = 'Có số điện thoại không hợp lệ trong danh sách.';
    else if (invalidUid) msg = 'Có UID Zalo không hợp lệ trong danh sách.';
    const error = new Error(msg);
    error.code = 'INVALID_MANUAL_RECIPIENTS';
    error.statusCode = 400;
    throw error;
  }
  if (!emailItems.length && !phoneItems.length && !uidItems.length) {
    const error = new Error('Vui lòng nhập ít nhất một người nhận.');
    error.code = 'MANUAL_RECIPIENTS_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
  if (emailItems.length + phoneItems.length + uidItems.length > MAX_AI_MANUAL_RECIPIENTS) {
    const error = new Error(`Chỉ được nhập tối đa ${MAX_AI_MANUAL_RECIPIENTS} người nhận mỗi lần.`);
    error.code = 'MANUAL_RECIPIENTS_LIMIT';
    error.statusCode = 400;
    throw error;
  }
  return { emails: emailItems, phones: phoneItems, uids: uidItems };
}

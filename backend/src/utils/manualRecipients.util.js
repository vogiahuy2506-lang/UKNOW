export const MAX_AI_MANUAL_RECIPIENTS = 1000;

const splitRecipients = (value) => (Array.isArray(value) ? value : String(value || '').split(/[\s,;\n]+/))
  .map((item) => String(item || '').trim())
  .filter(Boolean);

export function validateManualRecipients({ emails, phones } = {}) {
  const emailItems = [...new Set(splitRecipients(emails).map((email) => email.toLowerCase()))];
  const phoneItems = [...new Set(splitRecipients(phones).map((phone) => phone.replace(/[\s().-]/g, '')))]
  const invalidEmail = emailItems.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const invalidPhone = phoneItems.find((phone) => !/^(?:\+?84|0)\d{9,10}$/.test(phone));
  if (invalidEmail || invalidPhone) {
    const error = new Error(invalidEmail ? 'Có email không hợp lệ trong danh sách.' : 'Có số điện thoại không hợp lệ trong danh sách.');
    error.code = 'INVALID_MANUAL_RECIPIENTS';
    error.statusCode = 400;
    throw error;
  }
  if (!emailItems.length && !phoneItems.length) {
    const error = new Error('Vui lòng nhập ít nhất một người nhận.');
    error.code = 'MANUAL_RECIPIENTS_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
  if (emailItems.length + phoneItems.length > MAX_AI_MANUAL_RECIPIENTS) {
    const error = new Error(`Chỉ được nhập tối đa ${MAX_AI_MANUAL_RECIPIENTS} người nhận mỗi lần.`);
    error.code = 'MANUAL_RECIPIENTS_LIMIT';
    error.statusCode = 400;
    throw error;
  }
  return { emails: emailItems, phones: phoneItems };
}

import { normalizeVietnamesePhone, isValidVietnamesePhone } from './vietnamesePhone.util.js';

/**
 * Trần người nhận cho đường "trợ lý AI" (`directRecipients` trong `ai.controller.js`).
 *
 * Tên biến nói "MANUAL" nhưng đường này KHÔNG chỉ là gõ tay: nó còn nhận danh sách
 * từ **file Excel/CSV kéo thả** (`extractRecipientsFromBuffer` mặc định dùng chính
 * trần này) và danh sách đã đọc sẵn từ nguồn khác. Giả định cũ "không ai gõ nhiều
 * hơn 1.000 người" vì thế sai với phần lớn lưu lượng thật đi qua đây.
 *
 * Nâng 1.000 → 50.000 ngày 05/09/2026: khách thật có danh sách 13.991 người bị chặn
 * ở bước "Tạo chiến dịch draft" của trợ lý AI. Đây là **lần thứ ba** cùng một loại
 * sự cố — trần dành cho gõ tay chặn nhầm danh sách có sẵn (02/09: sheet 8.156;
 * 05/09: sheet 13.991 ở `MAX_SHEET_RECIPIENTS`; và giờ là đường trợ lý AI).
 *
 * Chốt chặn thật cho payload lớn là `express.json({ limit: '5mb' })` (`app.js:132`),
 * không phải con số này: 50.000 số điện thoại ≈ 650KB, còn xa mức 5MB.
 */
const parsedManualLimit = Number.parseInt(process.env.MAX_AI_MANUAL_RECIPIENTS, 10);
export const MAX_AI_MANUAL_RECIPIENTS =
  Number.isFinite(parsedManualLimit) && parsedManualLimit > 0 ? parsedManualLimit : 50000;

/**
 * Trần người nhận đọc từ Google Sheet — KHÁC trần nhập tay ở trên.
 *
 * Nhập tay 1.000 người là hợp lý (không ai gõ nhiều hơn thế). Nhưng một sheet
 * danh sách khách vài nghìn dòng cũng hợp lý, nên dùng chung một con số làm
 * chiến dịch bị từ chối chạy mà người dùng không hiểu vì sao (sự cố 02/09/2026:
 * sheet 8.156 người nhận bị chặn bởi trần vốn dành cho nhập tay).
 *
 * Nâng 10.000 → 50.000 ngày 05/09/2026: khách thật bị chặn với sheet 13.991
 * người nhận. Đây là lần thứ HAI cùng một loại sự cố, nên lần này cho đọc từ
 * biến môi trường để lần sau chỉnh được mà không phải deploy lại.
 *
 * Trần này là chốt chặn vận hành, KHÔNG phải giới hạn kỹ thuật: sheet được đọc
 * trọn vẹn rồi mới đem ra so trần (`recipientExtractor.service.js`), nên nâng số
 * không làm việc đọc nặng thêm.
 */
const parsedSheetLimit = Number.parseInt(process.env.MAX_SHEET_RECIPIENTS, 10);
export const MAX_SHEET_RECIPIENTS =
  Number.isFinite(parsedSheetLimit) && parsedSheetLimit > 0 ? parsedSheetLimit : 50000;

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

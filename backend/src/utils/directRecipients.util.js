import { validateManualRecipients, validateTelegramChatIds } from './manualRecipients.util.js';
import { getNodeSubtype } from './nodeSubtype.util.js';

/**
 * Ghi danh sách người nhận NHẬP TRỰC TIẾP (lớp phủ riêng tư `directRecipients`) lên các node gửi của kịch bản.
 *
 * Tách từ `AiController.applyDirectRecipients` (PLAN_TAO_CHIEN_DICH_TUNG_BUOC_2026-10-14 PR-1) thành hàm thuần để cả
 * đường trợ lý AI lẫn trình "tạo chiến dịch từng bước" dùng CHUNG một bộ kiểm: danh sách người nhận không đi qua model,
 * đúng kênh (email chỉ cho node gửi email; SĐT cho Zalo cá nhân/WhatsApp; UID chỉ Zalo cá nhân; chat id chỉ Telegram).
 * Sửa trực tiếp `script.nodes[].config`; lỗi nghiệp vụ ném Error mang `code` + `statusCode = 400`.
 *
 * @param {{ nodes?: object[] }} script kịch bản đã `prepareScript` (node có thể camelCase hoặc snake_case)
 * @param {{ emails?: string[]|string, phones?: string[]|string, uids?: string[]|string, chatIds?: string[]|string }} directRecipients
 * @returns {void}
 */
export function applyDirectRecipients(script, directRecipients) {
  // `chatIds` (Telegram) đi riêng: validateManualRecipients giữ hình dạng cũ { emails, phones, uids } cho các nơi khác (rà soát C P2-9).
  const { chatIds: rawChatIds, ...otherRecipients } = directRecipients && typeof directRecipients === 'object' ? directRecipients : {};
  const chatIds = validateTelegramChatIds(rawChatIds);
  const hasOtherRecipients = ['emails', 'phones', 'uids'].some((key) => {
    const value = otherRecipients[key];
    return (Array.isArray(value) ? value : String(value || '').split(/[\s,;\n]+/)).some((item) => String(item || '').trim());
  });
  // Chỉ chat id → bỏ qua kiểm "ít nhất một người nhận" của validateManualRecipients (nó đòi email/SĐT/UID); không có gì → lỗi chuẩn như cũ.
  const recipients = chatIds.length > 0 && !hasOtherRecipients
    ? { emails: [], phones: [], uids: [] }
    : validateManualRecipients(otherRecipients);
  const hasEmailAction = (script.nodes || []).some((node) => getNodeSubtype(node) === 'send_email');
  const hasZaloPersonalAction = (script.nodes || []).some((node) => getNodeSubtype(node) === 'send_zalo_personal');
  // Kênh adapter (rà soát C P2-9): người nhận nhập tay đi qua CHÍNH lớp phủ riêng tư này — không để model chép chat id/SĐT vào node.
  const hasTelegramAction = (script.nodes || []).some((node) => getNodeSubtype(node) === 'send_telegram');
  const hasWhatsAppAction = (script.nodes || []).some((node) => getNodeSubtype(node) === 'send_whatsapp');

  if (hasZaloPersonalAction && (!recipients.phones || recipients.phones.length === 0) && (!recipients.uids || recipients.uids.length === 0)) {
    const error = new Error('Danh sách người nhận cho chiến dịch Zalo không có số điện thoại hoặc UID nào hợp lệ.');
    error.code = 'ZALO_RECIPIENTS_EMPTY';
    error.statusCode = 400;
    throw error;
  }

  if (hasEmailAction && (!recipients.emails || recipients.emails.length === 0)) {
    const error = new Error('Danh sách người nhận cho chiến dịch Email không có địa chỉ email nào hợp lệ.');
    error.code = 'EMAIL_RECIPIENTS_EMPTY';
    error.statusCode = 400;
    throw error;
  }

  if (hasTelegramAction && chatIds.length === 0) {
    const error = new Error('Danh sách người nhận cho chiến dịch Telegram không có chat id nào hợp lệ.');
    error.code = 'TELEGRAM_RECIPIENTS_EMPTY';
    error.statusCode = 400;
    throw error;
  }

  if (hasWhatsAppAction && (!recipients.phones || recipients.phones.length === 0)) {
    const error = new Error('Danh sách người nhận cho chiến dịch WhatsApp không có số điện thoại nào hợp lệ.');
    error.code = 'WHATSAPP_RECIPIENTS_EMPTY';
    error.statusCode = 400;
    throw error;
  }

  const phonesHaveTarget = hasZaloPersonalAction || hasWhatsAppAction;
  if (
    (recipients.emails.length && !hasEmailAction)
    || (recipients.phones.length && !phonesHaveTarget)
    || (recipients.uids.length && !hasZaloPersonalAction)
    || (chatIds.length && !hasTelegramAction)
  ) {
    const error = new Error('Email chỉ dùng cho chiến dịch Email; số điện thoại cho Zalo cá nhân hoặc WhatsApp; bạn bè Zalo chỉ dùng cho Zalo cá nhân; chat id chỉ dùng cho Telegram.');
    error.code = 'MANUAL_RECIPIENT_CHANNEL_MISMATCH';
    error.statusCode = 400;
    throw error;
  }
  let matched = false;
  for (const node of script.nodes || []) {
    const subtype = getNodeSubtype(node);
    const config = node.config || (node.config = {});
    if (subtype === 'send_email' && recipients.emails.length) {
      config.recipientSource = 'manual';
      config.recipientEmails = recipients.emails;
      matched = true;
    } else if (subtype === 'send_zalo_personal' && (recipients.phones.length || recipients.uids.length)) {
      config.zaloRecipientSource = 'manual';
      if (recipients.uids.length) {
        config.zaloRecipientType = 'uid';
        config.zaloRecipientField = 'uid';
        config.zaloRecipientPhones = recipients.uids;
      } else {
        config.zaloRecipientType = 'phone';
        config.zaloRecipientField = 'phone';
        config.zaloRecipientPhones = recipients.phones;
      }
      matched = true;
    } else if (subtype === 'send_telegram' && chatIds.length) {
      config.recipientSource = 'manual';
      config.recipientKeys = chatIds;
      matched = true;
    } else if (subtype === 'send_whatsapp' && recipients.phones.length) {
      config.recipientSource = 'manual';
      config.recipientKeys = recipients.phones;
      delete config.recipientNodeId;
      delete config.recipientColumn;
      matched = true;
    }
  }
  if (!matched) {
    const error = new Error('Danh sách nhập trực tiếp chỉ hỗ trợ Email, Zalo cá nhân, Telegram hoặc WhatsApp đúng với kênh gửi.');
    error.code = 'MANUAL_RECIPIENT_CHANNEL_MISMATCH';
    error.statusCode = 400;
    throw error;
  }
}

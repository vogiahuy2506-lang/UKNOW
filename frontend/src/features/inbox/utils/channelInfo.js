/**
 * Thông tin theo kênh dùng chung cho Hộp thư (nhãn kênh ngoài, khả năng gửi tệp).
 */

/**
 * Kênh Hộp thư CHƯA gửi được tệp đính kèm (adapter backend trả lỗi) — ẩn nút đính kèm
 * để khách hàng không bấm rồi mới thấy lỗi. Giữ đồng bộ với `telegramInbox.adapter.js` /
 * `whatsappBaileysInbox.adapter.js` (ATTACHMENTS_UNSUPPORTED_ERROR).
 */
export const INBOX_ATTACHMENT_UNSUPPORTED_CHANNELS = new Set(['telegram', 'whatsapp_baileys']);

export const channelSupportsInboxAttachments = (channel) =>
  !INBOX_ATTACHMENT_UNSUPPORTED_CHANNELS.has(channel);

const EXTERNAL_CHANNEL_NAMES = {
  zalo_oa: 'Zalo OA',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  whatsapp_baileys: 'WhatsApp',
  telegram: 'Telegram',
};

/** Tên hiển thị của kênh lưu ở channel_connections (không dịch); kênh lạ trả nguyên mã. */
export const getExternalChannelName = (channel) => EXTERNAL_CHANNEL_NAMES[channel] || channel;

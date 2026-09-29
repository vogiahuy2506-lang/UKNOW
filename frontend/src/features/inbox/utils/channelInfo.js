/**
 * Thông tin theo kênh dùng chung cho Hộp thư (nhãn kênh ngoài, khả năng gửi tệp).
 */

/**
 * Kênh Hộp thư CHƯA gửi được tệp đính kèm — ẩn nút đính kèm để khách hàng không bấm rồi mới thấy lỗi.
 * P5 (PLAN_TG_WA_DAY_DU): Telegram và WhatsApp QR đã gửi được ảnh/tài liệu (`telegramInbox.adapter.js` /
 * `whatsappBaileysInbox.adapter.js` không còn trả ATTACHMENTS_UNSUPPORTED_ERROR) nên tập này hiện RỖNG;
 * giữ lại hằng + hàm để kênh mới chưa hỗ trợ tệp chỉ cần thêm mã vào đây.
 */
export const INBOX_ATTACHMENT_UNSUPPORTED_CHANNELS = new Set([]);

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

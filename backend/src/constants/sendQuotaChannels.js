/**
 * P10 (PLAN_TG_WA_DAY_DU mục 17) — bảng kênh của HẠN MỨC GỬI. Trước P10 chỉ có 'email' | 'zalo' (Telegram/WhatsApp đếm chung
 * vào Zalo); từ P10 mỗi kênh có hạn mức tin/tháng RIÊNG. Một nguồn duy nhất cho tên cột gói, loại usage_logs, nhãn, ví top-up —
 * để cổng cũ (`checkSendQuota`), hệ đặt chỗ (`evaluateReservationQuotaPolicy`) và API dùng-bao-nhiêu không tự đặt tên lệch nhau.
 */

/** Kênh 'adapter' (bảng `campaign_channel_messages`, khoá kênh = khoá hạn mức). */
export const ADAPTER_QUOTA_CHANNELS = Object.freeze(['telegram', 'whatsapp']);

export const SEND_QUOTA_CHANNELS = Object.freeze(['email', 'zalo', ...ADAPTER_QUOTA_CHANNELS]);

export function isAdapterQuotaChannel(channel) {
  return ADAPTER_QUOTA_CHANNELS.includes(channel);
}

/** Cột `plans` chứa hạn mức tin/tháng của từng kênh (NULL = không giới hạn, 0 = gói không có kênh). */
export const PLAN_MONTHLY_LIMIT_COLUMN = Object.freeze({
  email: 'monthly_email_limit',
  zalo: 'monthly_zalo_limit',
  telegram: 'monthly_telegram_limit',
  whatsapp: 'monthly_whatsapp_limit',
});

/** `usage_logs.resource_type` của tin gửi trực tiếp/gửi nhanh (không có dòng riêng ở bảng tin). */
export const DIRECT_SEND_RESOURCE_TYPE = Object.freeze({
  email: 'email_direct_send',
  zalo: 'zalo_direct_send',
  telegram: 'telegram_direct_send',
  whatsapp: 'whatsapp_direct_send',
});

/** Nhãn kênh trong thông điệp chạm trần (đơn vị luôn là 'tin', trừ email). */
export const QUOTA_CHANNEL_LABEL = Object.freeze({
  email: 'email',
  zalo: 'Zalo',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
});

/** Ví top-up tiêu hao theo kênh (`topup_grants/topup_debits.item_key`). */
export const WALLET_ITEM_BY_QUOTA_CHANNEL = Object.freeze({
  email: 'emails',
  zalo: 'zalo_messages',
  telegram: 'telegram_messages',
  whatsapp: 'whatsapp_messages',
});

/**
 * P11 — Hộp thư trả lời tay: `channel_connections.channel` / `channel_conversations.channel` (kênh HỘP THƯ) → kênh HẠN MỨC.
 * Hai tên KHÁC nhau cho WhatsApp ('whatsapp_baileys' vs 'whatsapp') — map ở đúng một chỗ này, đừng so `= 'whatsapp'` với cột kênh Hộp thư.
 * Kênh khác (zalo_oa, facebook, webchat…) không nằm trong bảng → không đo hạn mức tin/tháng.
 */
export const INBOX_CHANNEL_TO_QUOTA_CHANNEL = Object.freeze({
  telegram: 'telegram',
  whatsapp_baileys: 'whatsapp',
});

/** Kênh Hộp thư cần đếm cho một kênh hạn mức (ngược của bảng trên). */
export const INBOX_CHANNEL_BY_QUOTA_CHANNEL = Object.freeze({
  telegram: 'telegram',
  whatsapp: 'whatsapp_baileys',
});

/** @returns {'telegram'|'whatsapp'|null} */
export function resolveInboxQuotaChannel(conversationChannel) {
  return INBOX_CHANNEL_TO_QUOTA_CHANNEL[conversationChannel] || null;
}

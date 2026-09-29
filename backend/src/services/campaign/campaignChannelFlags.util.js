/**
 * Cờ bật kênh gửi Telegram/WhatsApp cho chiến dịch — nguồn ĐỌC CỜ dùng chung cho tầng TRỢ LÝ AI
 * (registry node, wizard, intent, compiler). Cùng tên biến env với `campaignChannelRegistry.service.js`
 * (engine) — spec `ai/__tests__/adapterChannelAssistantP8a.spec.js` ghim hai bên luôn khớp.
 *
 * Luôn đọc LÚC GỌI (không lúc import): test/ops đổi cờ không bị dính giá trị cũ.
 */

export const ADAPTER_CAMPAIGN_CHANNELS = Object.freeze(['telegram', 'whatsapp']);

export function isTelegramCampaignChannelEnabled() {
  return process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED === 'true';
}

export function isWhatsAppCampaignChannelEnabled() {
  return process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED === 'true';
}

/** Kênh key ('telegram' | 'whatsapp') có đang bật không; kênh khác trả false. */
export function isAdapterCampaignChannelEnabled(channel) {
  if (channel === 'telegram') return isTelegramCampaignChannelEnabled();
  if (channel === 'whatsapp') return isWhatsAppCampaignChannelEnabled();
  return false;
}

/** Danh sách kênh adapter đang bật, theo thứ tự cố định telegram → whatsapp. */
export function getEnabledAdapterCampaignChannels() {
  return ADAPTER_CAMPAIGN_CHANNELS.filter((channel) => isAdapterCampaignChannelEnabled(channel));
}

/** Kênh có phải kênh adapter (bất kể cờ) — dùng để rẽ nhánh logic, khác `isAdapterCampaignChannelEnabled`. */
export function isAdapterCampaignChannel(channel) {
  return ADAPTER_CAMPAIGN_CHANNELS.includes(channel);
}

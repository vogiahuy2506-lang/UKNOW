/**
 * Cờ bật kênh gửi Telegram/WhatsApp cho chiến dịch — nguồn ĐỌC CỜ dùng chung cho tầng TRỢ LÝ AI
 * (registry node, wizard, intent, compiler). Cùng tên biến env với `campaignChannelRegistry.service.js`
 * (engine) — spec `ai/__tests__/adapterChannelAssistantP8a.spec.js` ghim hai bên luôn khớp.
 *
 * Luôn đọc LÚC GỌI (không lúc import): test/ops đổi cờ không bị dính giá trị cũ.
 *
 * P9 (PLAN_TG_WA_DAY_DU mục 16) — ngoài cờ toàn cục còn có QUYỀN KÊNH THEO GÓI của người đang chat: middleware
 * `channelEntitlementContext` bọc request trợ lý AI bằng `runWithChannelEntitlements({telegram, whatsapp}, ...)`
 * (AsyncLocalStorage). Kênh có cờ bật nhưng gói của chủ workspace không có (`false`) được coi là TẮT trong mọi lời gọi
 * bên dưới — registry node, wizard, intent, compiler, kho bài — nên trợ lý không dựng node cho kênh đó. Ngoài ngữ cảnh
 * (job nền, test) không có kho -> chỉ còn cờ toàn cục, y như trước P9. Engine gửi (`campaignChannelRegistry`) KHÔNG dùng
 * module này: chặn lúc gửi đã có ở `channelEntitlement.service` (403 CHANNEL_NOT_IN_PLAN).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export const ADAPTER_CAMPAIGN_CHANNELS = Object.freeze(['telegram', 'whatsapp']);

const entitlementStore = new AsyncLocalStorage();

/**
 * Chạy `fn` với quyền kênh của người dùng hiện tại; mọi đọc cờ bên trong thấy kênh `entitlements[k] === false` là tắt.
 * @param {{telegram?: boolean, whatsapp?: boolean}|null} entitlements
 * @param {() => any} fn
 */
export function runWithChannelEntitlements(entitlements, fn) {
  return entitlementStore.run({ entitlements: entitlements || {} }, fn);
}

/** Gói của người dùng hiện tại KHÔNG có kênh này (chỉ đúng khi đang trong ngữ cảnh + quyền = false). */
export function isChannelBlockedByPlan(channel) {
  return entitlementStore.getStore()?.entitlements?.[channel] === false;
}

function envFlagOn(channel) {
  if (channel === 'telegram') return process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED === 'true';
  if (channel === 'whatsapp') return process.env.CAMPAIGN_CHANNEL_WHATSAPP_ENABLED === 'true';
  return false;
}

export function isTelegramCampaignChannelEnabled() {
  return envFlagOn('telegram') && !isChannelBlockedByPlan('telegram');
}

export function isWhatsAppCampaignChannelEnabled() {
  return envFlagOn('whatsapp') && !isChannelBlockedByPlan('whatsapp');
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

/** Kênh có CỜ bật nhưng gói của người dùng không có (để trợ lý nói đúng "mua thêm" thay vì "chưa hỗ trợ"). */
export function getChannelsBlockedByPlan() {
  return ADAPTER_CAMPAIGN_CHANNELS.filter((channel) => envFlagOn(channel) && isChannelBlockedByPlan(channel));
}

/** Kênh có phải kênh adapter (bất kể cờ) — dùng để rẽ nhánh logic, khác `isAdapterCampaignChannelEnabled`. */
export function isAdapterCampaignChannel(channel) {
  return ADAPTER_CAMPAIGN_CHANNELS.includes(channel);
}

const CHANNEL_LABEL = Object.freeze({ telegram: 'Telegram', whatsapp: 'WhatsApp' });

/** Câu chung cho người dùng khi gói không có kênh (dùng ở 403 CHANNEL_NOT_IN_PLAN và ở trợ lý AI). */
export function buildChannelNotInPlanMessage(channel) {
  return `Gói của bạn không có kênh ${CHANNEL_LABEL[channel] || channel} — mua thêm slot ở mục Nạp thêm hoặc nâng gói.`;
}

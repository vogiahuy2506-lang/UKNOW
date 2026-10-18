import campaignBuilderApiService from '../services/campaignBuilderApi.service';
import { mapEmailAccounts, mapTelegramAccounts, mapWhatsAppAccounts, mapZaloAccounts } from './simpleCampaign.helpers';

/**
 * Tải tài khoản gửi: email dùng `getActiveEmailSettings` (limit 100 — ĐỪNG gọi GET /email-settings trần, chỉ 10),
 * Zalo dùng `selectable`, Telegram/WhatsApp dùng hai endpoint của trình dựng (ĐÃ lọc theo tài khoản được giao cho nhân viên).
 *
 * @param {'email'|'zalo'|'telegram'|'whatsapp'} kind
 * @param {{ email?: object }} [options] `email`: tuỳ chọn axios cho GET email-settings (vd `params` khác để không bị `api.js` khử trùng với request cùng khoá của trang)
 */
export const loadSenderAccounts = async (kind, options = {}) => {
  if (kind === 'email') {
    const response = await campaignBuilderApiService.getActiveEmailSettings(options.email || {});
    return mapEmailAccounts(response?.data?.data?.items);
  }
  if (kind === 'telegram') {
    const response = await campaignBuilderApiService.getTelegramAccountsForBuilder();
    return mapTelegramAccounts(response?.data?.data);
  }
  if (kind === 'whatsapp') {
    const response = await campaignBuilderApiService.getWhatsAppAccountsForBuilder();
    return mapWhatsAppAccounts(response?.data?.data);
  }
  const response = await campaignBuilderApiService.getZaloAccounts();
  return mapZaloAccounts(response?.data?.data?.items);
};

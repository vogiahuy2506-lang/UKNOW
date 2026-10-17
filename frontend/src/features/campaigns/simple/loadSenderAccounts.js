import campaignBuilderApiService from '../services/campaignBuilderApi.service';
import { mapEmailAccounts, mapTelegramAccounts, mapWhatsAppAccounts, mapZaloAccounts } from './simpleCampaign.helpers';

/**
 * Tải tài khoản gửi: email dùng `getActiveEmailSettings` (limit 100 — ĐỪNG gọi GET /email-settings trần, chỉ 10),
 * Zalo dùng `selectable`, Telegram/WhatsApp dùng hai endpoint của trình dựng (ĐÃ lọc theo tài khoản được giao cho nhân viên).
 *
 * @param {'email'|'zalo'|'telegram'|'whatsapp'} kind
 */
export const loadSenderAccounts = async (kind) => {
  if (kind === 'email') {
    const response = await campaignBuilderApiService.getActiveEmailSettings();
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

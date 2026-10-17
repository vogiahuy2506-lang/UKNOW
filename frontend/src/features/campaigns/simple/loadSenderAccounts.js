import campaignBuilderApiService from '../services/campaignBuilderApi.service';
import { mapEmailAccounts, mapZaloAccounts } from './simpleCampaign.helpers';

/**
 * Tải tài khoản gửi: email dùng `getActiveEmailSettings` (limit 100 — ĐỪNG gọi GET /email-settings trần, chỉ 10),
 * Zalo dùng `selectable`. Dùng chung cho danh sách chọn tài khoản và cho chế độ sửa (điền tên tài khoản đã chọn).
 *
 * @param {'email'|'zalo'} kind
 */
export const loadSenderAccounts = async (kind) => {
  if (kind === 'email') {
    const response = await campaignBuilderApiService.getActiveEmailSettings();
    return mapEmailAccounts(response?.data?.data?.items);
  }
  const response = await campaignBuilderApiService.getZaloAccounts();
  return mapZaloAccounts(response?.data?.data?.items);
};

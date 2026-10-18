import emailTemplateApiService from '../../templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../templates/services/zaloTemplateApi.service';

/** Mẫu tin email nằm ở `email_templates`; Zalo (cá nhân + nhóm) và Telegram / WhatsApp dùng chung kho `zalo_templates`. */
export const serviceFor = (kind) => (kind === 'email' ? emailTemplateApiService : zaloTemplateApiService);

/** Danh sách mẫu (100 mẫu đầu) của kho tương ứng với `kind` ('email' | 'zalo'). */
export const loadTemplates = async (kind) => {
  const response = await serviceFor(kind).getTemplates({ page: 1, limit: 100 });
  return Array.isArray(response?.data?.data?.items) ? response.data.data.items : [];
};

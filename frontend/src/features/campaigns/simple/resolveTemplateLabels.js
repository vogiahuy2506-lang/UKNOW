import emailTemplateApiService from '../../templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../templates/services/zaloTemplateApi.service';
import { templateKindOf } from './simpleCampaign.helpers';

/**
 * Chế độ sửa: GET chỉ trả id mẫu, mà trình mở thẳng ở bước Xem lại (ContentStep chưa mount nên không ai tra tên mẫu). Tra theo id
 * bằng `getTemplateById` (không phụ thuộc danh sách mẫu phân trang). Mẫu do server tự tạo từ chữ tự soạn có tên = tên chiến dịch
 * nên với email ưu tiên TIÊU ĐỀ thư (chính chữ người dùng đã gõ); không có tiêu đề mới dùng tên mẫu.
 */

/** Mọi id mẫu (tin 1 + tin sau) còn thiếu tên. */
export const collectUnnamedTemplateIds = (state) => {
  const ids = new Set();
  const visit = (content) => {
    if (content?.mode === 'template' && Number(content.templateId) > 0 && !content.templateName) ids.add(Number(content.templateId));
  };
  visit(state.content);
  (state.followUps || []).forEach((item) => visit(item.content));
  return [...ids];
};

/** Nhãn hiển thị của một mẫu đã tải chi tiết; rỗng nếu không có gì dùng được. */
export const templateLabelOf = (kind, detail) => {
  if (!detail) return '';
  const subject = kind === 'email' ? String(detail.subject || '').trim() : '';
  return subject || String(detail.templateName || '').trim();
};

/**
 * @param {object} state trạng thái trình
 * @returns {Promise<Map<number, string>>} id → nhãn (bỏ qua id tra lỗi)
 */
export const fetchTemplateLabels = async (state) => {
  const kind = templateKindOf(state.channel);
  const service = kind === 'email' ? emailTemplateApiService : zaloTemplateApiService;
  const labels = new Map();
  await Promise.all(collectUnnamedTemplateIds(state).map(async (id) => {
    try {
      const response = await service.getTemplateById(id);
      const label = templateLabelOf(kind, response?.data?.data);
      if (label) labels.set(id, label);
    } catch {
      // Không tra được thì để trống: câu tóm tắt ghi "mẫu đã chọn", không bao giờ ghi "#id".
    }
  }));
  return labels;
};

/** Điền nhãn vào các mẫu còn thiếu tên (không đè tên đã có). */
export const applyTemplateLabels = (state, labels) => {
  if (!labels || labels.size === 0) return state;
  const fill = (content) => {
    if (content?.mode !== 'template' || content.templateName) return content;
    const label = labels.get(Number(content.templateId));
    return label ? { ...content, templateName: label } : content;
  };
  return {
    ...state,
    content: fill(state.content),
    followUps: (state.followUps || []).map((item) => ({ ...item, content: fill(item.content) })),
  };
};

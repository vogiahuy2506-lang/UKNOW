import api from '../../../services/api';

/**
 * Zalo template feature API wrappers.
 * Tách riêng endpoint để dữ liệu đọc/ghi từ bảng zalo_templates.
 */
export const zaloTemplateApiService = {
  getTemplates(params = {}) {
    return api.get('/zalo-templates', { params });
  },

  getTemplateById(templateId) {
    return api.get(`/zalo-templates/${templateId}`);
  },

  createTemplate(payload) {
    return api.post('/zalo-templates', payload);
  },

  updateTemplate(templateId, payload) {
    return api.put(`/zalo-templates/${templateId}`, payload);
  },

  deleteTemplate(templateId) {
    return api.delete(`/zalo-templates/${templateId}`);
  },
};

export default zaloTemplateApiService;

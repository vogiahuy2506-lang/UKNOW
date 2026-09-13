import api from '../../../services/api';

// PR-2b (13/09/2026, PLAN_CANH_BAO_SAP_HET_HAN_GOI mục 4.2) — '/welcome' cứng đổi thành
// '/:templateKey', khớp backend adminSystemEmailTemplate.routes.js. templateKey hợp lệ:
// 'welcome' | 'plan_expiring' | 'plan_expired' (whitelist thật nằm ở backend, route 400 nếu sai).
const adminSystemEmailTemplateApiService = {
  getTemplate(templateKey) {
    return api.get(`/admin/system-email-templates/${templateKey}`);
  },
  updateTemplate(templateKey, template) {
    return api.put(`/admin/system-email-templates/${templateKey}`, template);
  },
  resetTemplate(templateKey) {
    return api.delete(`/admin/system-email-templates/${templateKey}`);
  },
  previewTemplate(templateKey, template) {
    return api.post(`/admin/system-email-templates/${templateKey}/preview`, template);
  },
};

export default adminSystemEmailTemplateApiService;

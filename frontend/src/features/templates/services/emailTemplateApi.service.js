import api from '../../../services/api';

/**
 * Email template feature API wrappers.
 * Provides a stable service entrypoint for template pages/hooks.
 */
export const emailTemplateApiService = {
  getTemplates(params = {}) {
    return api.get('/email-templates', { params });
  },

  getTemplateById(templateId) {
    return api.get(`/email-templates/${templateId}`);
  },

  createTemplate(payload) {
    return api.post('/email-templates', payload);
  },

  updateTemplate(templateId, payload) {
    return api.put(`/email-templates/${templateId}`, payload);
  },

  deleteTemplate(templateId) {
    return api.delete(`/email-templates/${templateId}`);
  },

  previewTemplate(payload) {
    return api.post('/email-templates/preview', payload);
  },
};

export default emailTemplateApiService;

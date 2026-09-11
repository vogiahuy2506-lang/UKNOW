import api from '../../../services/api';

const adminSystemEmailTemplateApiService = {
  getWelcomeTemplate() {
    return api.get('/admin/system-email-templates/welcome');
  },
  updateWelcomeTemplate(template) {
    return api.put('/admin/system-email-templates/welcome', template);
  },
  resetWelcomeTemplate() {
    return api.delete('/admin/system-email-templates/welcome');
  },
  previewWelcomeTemplate(template) {
    return api.post('/admin/system-email-templates/welcome/preview', template);
  },
};

export default adminSystemEmailTemplateApiService;


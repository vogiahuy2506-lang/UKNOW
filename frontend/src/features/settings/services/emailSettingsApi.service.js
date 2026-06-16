import api from '../../../services/api';

const emailSettingsApiService = {
  listEmailSettings() {
    return api.get('/email-settings');
  },

  getEmailSetting(emailSettingId) {
    return api.get(`/email-settings/${emailSettingId}`);
  },

  createEmailSetting(payload) {
    return api.post('/email-settings', payload);
  },

  updateEmailSetting(emailSettingId, payload) {
    return api.put(`/email-settings/${emailSettingId}`, payload);
  },

  deleteEmailSetting(emailSettingId) {
    return api.delete(`/email-settings/${emailSettingId}`);
  },

  // Domain verification (Hướng 2)
  initiateDomainVerification(emailSettingId) {
    return api.post(`/email-settings/${emailSettingId}/domain-verification/initiate`);
  },

  getDomainVerificationStatus(emailSettingId) {
    return api.get(`/email-settings/${emailSettingId}/domain-verification/status`);
  },
};

export default emailSettingsApiService;

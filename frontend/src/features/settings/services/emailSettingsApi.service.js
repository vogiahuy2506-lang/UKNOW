import api from '../../../services/api';
import { generateIdempotencyKey } from '../../../utils/idempotency.util';

const emailSettingsApiService = {
  listEmailSettings() {
    return api.get('/email-settings');
  },

  getActiveSettings() {
    return api.get('/email-settings/active');
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

  testConnection(payload) {
    return api.post('/email-settings/test-connection', payload);
  },

  sendTestEmail(emailSettingId, payload, options = {}) {
    const key = options.idempotencyKey || payload?.idempotencyKey || generateIdempotencyKey();
    return api.post(`/email-settings/${emailSettingId}/send-test`, payload, {
      ...options,
      headers: {
        'Idempotency-Key': key,
        ...(options.headers || {}),
      },
    });
  },

  // Gửi email trực tiếp (dùng cho Quick Send)
  sendEmail(payload, options = {}) {
    const key = options.idempotencyKey || payload?.idempotencyKey || generateIdempotencyKey();
    return api.post('/email-settings/send-email', payload, {
      ...options,
      headers: {
        'Idempotency-Key': key,
        ...(options.headers || {}),
      },
    });
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

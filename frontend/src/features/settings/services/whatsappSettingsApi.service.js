import api from '../../../services/api';

const whatsappSettingsApiService = {
  listAccounts() {
    return api.get('/whatsapp/accounts');
  },

  initOAuth(payload = {}) {
    return api.post('/whatsapp/accounts/oauth/init', payload);
  },

  fetchPendingOAuth(state) {
    return api.get('/whatsapp/accounts/oauth/pending', { params: { state } });
  },

  completeOAuth(payload) {
    return api.post('/whatsapp/accounts/oauth/complete', payload);
  },

  deleteAccount(id) {
    return api.delete(`/whatsapp/accounts/${id}`);
  },

  setDefault(id) {
    return api.patch(`/whatsapp/accounts/${id}/default`);
  },

  toggleActive(id, enabled) {
    return api.patch(`/whatsapp/accounts/${id}/active`, { enabled });
  },

  // User-level Meta App credentials (multi-tenant onboarding).
  listCredentials() {
    return api.get('/whatsapp/credentials');
  },

  upsertCredential(payload) {
    return api.post('/whatsapp/credentials', payload);
  },

  deleteCredential(id) {
    return api.delete(`/whatsapp/credentials/${id}`);
  },

  setDefaultCredential(id) {
    return api.patch(`/whatsapp/credentials/${id}/default`);
  },

  setCredentialActive(id, isActive) {
    return api.patch(`/whatsapp/credentials/${id}`, { isActive });
  },

  // Baileys QR-scan flow — SIMPLE path, no Meta App required.
  listBaileysSessions() {
    return api.get('/whatsapp-qr/sessions');
  },

  openBaileysSession(sessionKey) {
    return api.post('/whatsapp-qr/sessions', { sessionKey });
  },

  getBaileysSession(sessionKey) {
    return api.get(`/whatsapp-qr/sessions/${encodeURIComponent(sessionKey)}`);
  },

  disconnectBaileysSession(sessionKey) {
    return api.post(`/whatsapp-qr/sessions/${encodeURIComponent(sessionKey)}/disconnect`);
  },

  deleteBaileysSession(sessionKey) {
    return api.delete(`/whatsapp-qr/sessions/${encodeURIComponent(sessionKey)}`);
  },

  updateBaileysSession(sessionKey, nickname) {
    return api.patch(`/whatsapp-qr/sessions/${encodeURIComponent(sessionKey)}`, { nickname });
  },

  sendBaileysTest(sessionKey, to, text) {
    return api.post(`/whatsapp-qr/sessions/${encodeURIComponent(sessionKey)}/messages`, { to, text });
  },
};

export default whatsappSettingsApiService;

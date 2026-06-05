import api from '../../../services/api';

const zaloSettingsApiService = {
  listAccounts() {
    return api.get('/zalo/accounts');
  },

  deleteAccount(accountId) {
    return api.delete(`/zalo/accounts/${accountId}`);
  },

  setDefaultAccount(accountId) {
    return api.patch(`/zalo/accounts/${accountId}/default`);
  },

  createLoginQr() {
    return api.post('/zalo/accounts/login-qr');
  },

  restoreSession(accountId) {
    return api.post(`/zalo/accounts/${accountId}/restore-session`);
  },

  getLoginQrStatus(sessionKey) {
    return api.get(`/zalo/accounts/login-qr/${sessionKey}/status`);
  },
};

export default zaloSettingsApiService;

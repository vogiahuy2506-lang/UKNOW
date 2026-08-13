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

  retryRestore(accountId) {
    return api.post(`/zalo/accounts/${accountId}/retry-restore`);
  },

  getLoginQrStatus(sessionKey) {
    return api.get(`/zalo/accounts/login-qr/${sessionKey}/status`);
  },

  // Gửi tin nhắn Zalo cá nhân (dùng cho Quick Send)
  sendMessage(payload) {
    return api.post('/zalo/preview/send-personal', {
      accountId: payload.accountId,
      recipients: [payload.phone],
      recipientType: 'phone',
      message: payload.message || '',
    });
  },
};

export default zaloSettingsApiService;

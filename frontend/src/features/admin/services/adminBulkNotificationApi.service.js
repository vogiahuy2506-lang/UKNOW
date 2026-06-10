import api from '../../../services/api';

const adminBulkNotificationApiService = {
  getRecipientCount() {
    return api.get('/admin/bulk-notification/recipient-count');
  },
  sendNotification(payload) {
    // Bulk notification gửi nhiều email, cần timeout dài (2 phút)
    return api.post('/admin/bulk-notification/send', payload, { timeout: 120000 });
  },
};

export default adminBulkNotificationApiService;

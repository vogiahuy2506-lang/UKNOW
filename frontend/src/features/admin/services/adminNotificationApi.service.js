import api from '../../../services/api';

const adminNotificationApiService = {
  // =====================
  // CRUD Operations
  // =====================

  /**
   * Get all notifications with filters
   */
  getNotifications(params = {}) {
    return api.get('/admin/notifications', { params });
  },

  /**
   * Get single notification by ID
   */
  getNotificationById(id) {
    return api.get(`/admin/notifications/${id}`);
  },

  /**
   * Create a new notification (draft)
   */
  createNotification(data) {
    return api.post('/admin/notifications', data);
  },

  /**
   * Update notification by ID
   */
  updateNotification(id, data) {
    return api.patch(`/admin/notifications/${id}`, data);
  },

  /**
   * Delete notification by ID
   */
  deleteNotification(id) {
    return api.delete(`/admin/notifications/${id}`);
  },

  // =====================
  // Sending
  // =====================

  /**
   * Send notification immediately
   */
  sendNotification(id) {
    return api.post(`/admin/notifications/${id}/send`, {}, { timeout: 300000 });
  },

  /**
   * Create and send notification directly
   */
  sendDirect(data) {
    return api.post('/admin/notifications/send-direct', data, { timeout: 300000 });
  },

  /**
   * Schedule notification for later
   */
  scheduleNotification(id, scheduledAt) {
    return api.post(`/admin/notifications/${id}/schedule`, { scheduled_at: scheduledAt });
  },

  /**
   * Cancel scheduled notification
   */
  cancelScheduled(id) {
    return api.post(`/admin/notifications/${id}/cancel`);
  },

  // =====================
  // Targeting & Preview
  // =====================

  /**
   * Preview recipients based on criteria
   */
  previewRecipients(criteria) {
    return api.post('/admin/notifications/preview-recipients', criteria);
  },

  /**
   * Count eligible recipients
   */
  countRecipients(criteria) {
    return api.post('/admin/notifications/count-recipients', criteria);
  },

  /**
   * Preview notification content with variables
   */
  previewContent(data) {
    return api.post('/admin/notifications/preview-content', data);
  },

  /**
   * Render full HTML email từ BE (Nguồn sự thật cho iframe preview).
   * Đảm bảo email thực gửi qua SMTP và preview iframe y chang nhau.
   *
   * @param {{type?: string, priority?: string, title?: string,
   *   message?: string, html_content?: string|null,
   *   locale?: 'vi'|'en', device?: 'desktop'|'mobile'}} data
   * @returns {Promise<{data: {html: string}}>}
   */
  previewEmailHtml(data) {
    return api.post('/admin/notifications/preview-email-html', data);
  },

  // =====================
  // Stats & Logs
  // =====================

  /**
   * Get notification stats
   */
  getNotificationStats(id) {
    return api.get(`/admin/notifications/${id}/stats`);
  },

  /**
   * Get email logs for notification
   */
  getEmailLogs(id, params = {}) {
    return api.get(`/admin/notifications/${id}/logs`, { params });
  },

  /**
   * Get dashboard stats
   */
  getDashboardStats() {
    return api.get('/admin/notifications/dashboard-stats');
  },

  // =====================
  // Templates
  // =====================

  /**
   * Get available notification types
   */
  getNotificationTypes() {
    return api.get('/admin/notifications/types');
  },

  /**
   * Get available variables for templates
   */
  getAvailableVariables() {
    return api.get('/admin/notifications/variables');
  },

  // =====================
  // Users
  // =====================

  /**
   * Get all users for targeting
   */
  getAllUsers(params = {}) {
    return api.get('/admin/members', { params: { ...params, limit: 1000 } });
  },

  // =====================
  // Notification Templates (super admin save-as)
  // =====================

  /**
   * List notification templates (admin co the xem de chon o tab Gui).
   * @param {string=} typeKey - loc theo type_key
   */
  listTemplates(typeKey) {
    const params = typeKey ? { type_key: typeKey } : {};
    return api.get('/admin/notifications/templates', { params });
  },

  /**
   * Lay 1 template theo id.
   */
  getTemplate(id) {
    return api.get(`/admin/notifications/templates/${id}`);
  },

  /**
   * Tao template moi (chi superadmin).
   */
  createTemplate(data) {
    return api.post('/admin/notifications/templates', data);
  },
};

export default adminNotificationApiService;

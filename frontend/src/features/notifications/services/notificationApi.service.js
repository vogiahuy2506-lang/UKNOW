import api from '../../../services/api';

/**
 * API chuông thông báo + tuỳ chọn thông báo (`/api/notifications/*`, backend PR-1).
 *
 * Mọi request mang `skipOwnerContext: true`: các route này CHỈ theo người đăng nhập (`req.user.id`), không theo
 * không gian làm việc. Gắn `X-Owner-Context` thì authMiddleware kiểm tư cách nhân viên và có thể trả 403
 * (EMPLOYEE_LOCKED) — chuông sẽ câm đúng lúc nhân viên cần được báo. Xem `services/api.js`.
 *
 * Response backend bọc `{ success, data }`; các hàm ở đây trả thẳng phần `data`.
 */
const REQUEST_OPTIONS = { skipOwnerContext: true };

const EMPTY_LIST = Object.freeze({
  items: [],
  unreadCount: 0,
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
});

const notificationApi = {
  /**
   * @param {{ page?: number, limit?: number, unreadOnly?: boolean }} [query]
   * @returns {Promise<{ items: object[], unreadCount: number, pagination: object }>}
   */
  async list({ page = 1, limit = 20, unreadOnly = false } = {}) {
    const params = { page, limit };
    if (unreadOnly) params.unread = 1;
    const response = await api.get('/notifications', { params, ...REQUEST_OPTIONS });
    return response?.data?.data || EMPTY_LIST;
  },

  /** @param {number|string} id */
  async markRead(id) {
    const response = await api.post(`/notifications/${encodeURIComponent(id)}/read`, null, REQUEST_OPTIONS);
    return response?.data?.data;
  },

  async markAllRead() {
    const response = await api.post('/notifications/read-all', null, REQUEST_OPTIONS);
    return response?.data?.data;
  },

  /** @returns {Promise<object[]>} mảng `{ eventType, label, labelEn, description, inAppEnabled, emailEnabled, userCanDisableEmail, systemEmailEnabled }` */
  async getPreferences() {
    const response = await api.get('/notifications/preferences', REQUEST_OPTIONS);
    return response?.data?.data || [];
  },

  /**
   * @param {string} eventType
   * @param {boolean} emailEnabled
   * @returns {Promise<object>} mục tuỳ chọn sau khi cập nhật (cùng dạng `getPreferences`)
   */
  async updatePreference(eventType, emailEnabled) {
    const response = await api.put('/notifications/preferences', { eventType, emailEnabled }, REQUEST_OPTIONS);
    return response?.data?.data;
  },
};

export default notificationApi;

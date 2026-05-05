import api from '../../../services/api';

/**
 * Dashboard analytics API wrappers.
 */
export const dashboardApiService = {
  getOverview(params = {}) {
    return api.get('/dashboard/overview', { params });
  },

  getAnalytics(params = {}) {
    return api.get('/dashboard/analytics', { params });
  },

  getRuns(params = {}) {
    return api.get('/dashboard/runs', { params });
  },

  /**
   * Get paginated individual orders with run/campaign/channel info.
   *
   * @param {object} params
   * @param {'all'|'pending'|'completed'} params.orderStatus
   * @returns {Promise}
   */
  getOrders(params = {}) {
    return api.get('/dashboard/orders', { params });
  },

  /**
   * Get top lists: top courses by orders, top campaigns by orders, top campaigns by clicks.
   *
   * @param {object} params
   * @param {number} [params.limit=10] - max items per list
   * @returns {Promise}
   */
  getTopLists(params = {}) {
    return api.get('/dashboard/top-lists', { params });
  },

  /**
   * Thống kê landing: view, click, submit theo slug.
   *
   * @param {object} params startDate, endDate, period — hoặc allTime: 1 / period: 'all' (toàn thời gian)
   */
  getLandingPageStats(params = {}) {
    return api.get('/dashboard/landing-pages-stats', { params });
  },

  /**
   * Sinh insight dashboard bằng Gemini (backend gọi Gemini bằng API key server-side).
   *
   * @param {object} payload
   * @param {object} payload.overview - dữ liệu từ getOverview
   * @param {object} payload.analytics - dữ liệu từ getAnalytics
   * @param {object} payload.topListsData - dữ liệu từ getTopLists
   * @param {object} [payload.landingPageStats] - dữ liệu từ getLandingPageStats (tùy chọn, khuyến nghị gửi kèm)
   * @param {object} [payload.filters] - bộ lọc đang áp dụng (tùy chọn)
   * @returns {Promise}
   */
  generateInsights(payload) {
    // Insight Gemini + JSON dài có thể > 10s — tăng timeout cục bộ
    return api.post('/dashboard/insights', payload, { timeout: 120000 });
  },

  /**
   * Lấy insight đã lưu trên server (JSON trong bảng `dashboard_insights`).
   *
   * @returns {Promise<{ data: { success: boolean, data: { savedAt: string, insights: object } | null } }>}
   */
  getSavedInsight() {
    return api.get('/dashboard/insights/saved');
  },
};

export default dashboardApiService;

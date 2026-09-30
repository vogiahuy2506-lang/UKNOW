import api from '../../../services/api';

/**
 * Dashboard ("Báo cáo") API wrappers.
 */
export const dashboardApiService = {
  /**
   * 4 thẻ: đã gửi, chưa gửi được, email mở / bấm link, đơn hàng (`sent`, `failed`, `email`, `clicks`, `orders`).
   */
  getOverview(params = {}) {
    return api.get('/dashboard/overview', { params });
  },

  /**
   * Chuỗi theo ngày: `dailySent` (đã gửi mỗi ngày theo kênh) và `ordersTimeline` (đơn hàng theo ngày).
   */
  getAnalytics(params = {}) {
    return api.get('/dashboard/analytics', { params });
  },

  /**
   * Bảng "Chiến dịch trong kỳ": đã gửi / chưa gửi được / mở / nhấp / đã mua theo chiến dịch.
   *
   * @param {object} params bộ lọc như getOverview, thêm `limit` (mặc định 10)
   */
  getCampaigns(params = {}) {
    return api.get('/dashboard/campaigns', { params });
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
   * Sinh nhận xét AI (Gemini, backend gọi bằng API key server-side). Chỉ gửi BỘ LỌC — số liệu do server tự tính bằng
   * đúng các hàm của trang Báo cáo, nên lời phân tích luôn khớp các thẻ.
   *
   * @param {object} payload
   * @param {object} [payload.filters] - bộ lọc đang áp dụng { startDate, endDate, campaignType, campaignIds }
   * @param {string} [payload.locale]
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

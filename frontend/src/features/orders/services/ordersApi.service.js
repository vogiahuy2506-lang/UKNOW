import api from '../../../services/api';

/**
 * Orders API service.
 *
 * Tập trung các gọi API liên quan đến danh sách đơn hàng.
 * Tái dụng endpoint dashboard/orders vì dữ liệu nguồn là giống nhau.
 */
const ordersApiService = {
  /**
   * Lấy danh sách đơn hàng phân trang với bộ lọc.
   *
   * @param {object} params
   * @param {string} [params.startDate] - Ngày bắt đầu (YYYY-MM-DD)
   * @param {string} [params.endDate] - Ngày kết thúc (YYYY-MM-DD)
   * @param {string} [params.campaignIds] - Danh sách campaign ID cách dấu phẩy
   * @param {string} [params.campaignType] - Loại kênh: all | email | zalo | zalo_group
   * @param {'all'|'pending'|'completed'} [params.orderStatus] - Trạng thái đơn hàng
   * @param {number} [params.page] - Số trang
   * @param {number} [params.limit] - Số item mỗi trang
   * @returns {Promise}
   */
  getOrders(params = {}) {
    return api.get('/dashboard/orders', { params });
  },
};

export default ordersApiService;

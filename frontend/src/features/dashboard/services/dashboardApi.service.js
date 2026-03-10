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
};

export default dashboardApiService;

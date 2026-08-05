import api from '../../../services/api';

const adminFunnelApiService = {
  getOverview(since) {
    return api.get('/admin/funnel/overview', { params: since ? { since } : {} });
  },
};

export default adminFunnelApiService;

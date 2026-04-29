import api from '../../../services/api';

const adminStatsApiService = {
  getOverview() {
    return api.get('/admin/stats/overview');
  },
};

export default adminStatsApiService;

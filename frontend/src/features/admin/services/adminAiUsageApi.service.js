import api from '../../../services/api';

const adminAiUsageApiService = {
  getOverview(windowDays = 30) {
    return api.get('/admin/ai-usage/overview', { params: { windowDays } });
  },
};

export default adminAiUsageApiService;

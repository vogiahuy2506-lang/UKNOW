import api from '../../../services/api';

const adminAiUsageApiService = {
  /** @param {'month'|'30d'} [range] "Tháng này" | "30 ngày qua" (mốc tính ở máy chủ theo giờ Việt Nam) */
  getOverview(range = '30d') {
    return api.get('/admin/ai-usage/overview', { params: { range } });
  },
};

export default adminAiUsageApiService;

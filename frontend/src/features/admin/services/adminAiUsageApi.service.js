import api from '../../../services/api';

const adminAiUsageApiService = {
  /** @param {'month'|'30d'} [range] "Tháng này" | "30 ngày qua" (mốc tính ở máy chủ theo giờ Việt Nam) */
  getOverview(range = '30d') {
    return api.get('/admin/ai-usage/overview', { params: { range } });
  },
  /** Ô "Lỗi AI 24 giờ": { total, failed, rate, fallback, usageWriteFailed, writer } đọc từ sổ lỗi AI bền (ai_call_events). */
  getErrors24h() {
    return api.get('/admin/ai-usage/errors');
  },
};

export default adminAiUsageApiService;

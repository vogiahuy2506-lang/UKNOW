import api from '../../../services/api';

const userDeliveryMonitorApiService = {
  // PR-4b: trang chỉ trả lời "hôm nay" nên không còn tham số khoảng thời gian (7/30/90 ngày đã bỏ).
  getOverview() {
    return api.get('/delivery-monitor/overview');
  },
  getRunFailures(runId) {
    return api.get(`/delivery-monitor/runs/${runId}/failures`);
  },
  // Thời gian CÒN LẠI của một lượt đang chạy — gọi lười theo từng lượt (có thể đọc Google Sheet ở backend).
  // Lượt chạy mới nhất của MỘT chiến dịch (mục "Lần chạy gần nhất" ở tab Thiết lập) — số gửi / lỗi qua sendStats ở backend.
  getCampaignLatestRun(campaignId) {
    return api.get(`/delivery-monitor/campaigns/${campaignId}/latest-run`);
  },
  getRunEstimate(runId) {
    return api.get(`/delivery-monitor/runs/${runId}/estimate`);
  },
};

export default userDeliveryMonitorApiService;

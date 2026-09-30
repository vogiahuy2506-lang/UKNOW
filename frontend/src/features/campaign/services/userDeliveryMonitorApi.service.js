import api from '../../../services/api';

const userDeliveryMonitorApiService = {
  // PR-4b: trang chỉ trả lời "hôm nay" nên không còn tham số khoảng thời gian (7/30/90 ngày đã bỏ).
  getOverview() {
    return api.get('/delivery-monitor/overview');
  },
  getRunFailures(runId) {
    return api.get(`/delivery-monitor/runs/${runId}/failures`);
  },
};

export default userDeliveryMonitorApiService;

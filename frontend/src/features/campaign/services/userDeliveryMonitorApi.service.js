import api from '../../../services/api';

const userDeliveryMonitorApiService = {
  getOverview(windowDays = 7) {
    return api.get('/delivery-monitor/overview', { params: { windowDays } });
  },
  getRunFailures(runId) {
    return api.get(`/delivery-monitor/runs/${runId}/failures`);
  },
};

export default userDeliveryMonitorApiService;

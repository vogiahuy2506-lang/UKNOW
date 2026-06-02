import api from '../../../services/api';

const userDeliveryMonitorApiService = {
  getOverview(windowDays = 7) {
    return api.get('/delivery-monitor/overview', { params: { windowDays } });
  },
};

export default userDeliveryMonitorApiService;

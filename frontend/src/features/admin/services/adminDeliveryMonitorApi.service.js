import api from '../../../services/api';

const adminDeliveryMonitorApiService = {
  getOverview(windowDays = 7) {
    return api.get('/admin/delivery-monitor/overview', { params: { windowDays } });
  },
};

export default adminDeliveryMonitorApiService;

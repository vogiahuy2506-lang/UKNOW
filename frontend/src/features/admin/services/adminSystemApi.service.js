import api from '../../../services/api';

const adminSystemApiService = {
  getOverview() {
    return api.get('/admin/system/overview');
  },
  getLogs(service = 'backend', tail = 200) {
    return api.get('/admin/system/logs', { params: { service, tail } });
  },
};

export default adminSystemApiService;

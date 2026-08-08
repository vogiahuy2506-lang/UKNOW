import api from '../../../services/api';

const adminAlertsApiService = {
  getOverview() {
    return api.get('/admin/alerts/overview');
  },
  updateRule(id, patch) {
    return api.patch(`/admin/alerts/rules/${id}`, patch);
  },
  resolveEvent(id) {
    return api.post(`/admin/alerts/events/${id}/resolve`);
  },
  evaluateNow() {
    return api.post('/admin/alerts/evaluate');
  },
  getCronStatus(params = {}) {
    return api.get('/admin/alerts/cron-status', { params });
  },
};

export default adminAlertsApiService;

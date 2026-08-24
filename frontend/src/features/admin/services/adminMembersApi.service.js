import api from '../../../services/api';

const adminMembersApiService = {
  getMembers(params = {}) {
    return api.get('/admin/members', { params });
  },
  toggleStatus(id) {
    return api.patch(`/admin/members/${id}/status`);
  },
  promote(id) {
    return api.patch(`/admin/members/${id}/promote`);
  },
  demote(id) {
    return api.patch(`/admin/members/${id}/demote`);
  },
  detachEmail(id, confirmEmail, releaseTrialHistory = false) {
    return api.patch(`/admin/members/${id}/detach-email`, { confirmEmail, releaseTrialHistory: Boolean(releaseTrialHistory) });
  },
  purge(id, confirmEmail) {
    return api.delete(`/admin/members/${id}/purge`, { data: { confirmEmail } });
  },
};

export default adminMembersApiService;

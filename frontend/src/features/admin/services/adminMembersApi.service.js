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
};

export default adminMembersApiService;

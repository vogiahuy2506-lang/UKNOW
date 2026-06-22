import api from '../../../services/api';

const adminMembersApiService = {
  getMembers(params = {}) {
    return api.get('/admin/members', { params });
  },
  toggleStatus(id) {
    return api.patch(`/admin/members/${id}/status`);
  },
  updateRole(id, role) {
    return api.patch(`/admin/members/${id}/role`, { role });
  },
  promote(id) {
    return api.patch(`/admin/members/${id}/promote`);
  },
  demote(id) {
    return api.patch(`/admin/members/${id}/demote`);
  },
};

export default adminMembersApiService;

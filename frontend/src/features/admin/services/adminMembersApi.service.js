import api from '../../../services/api';

const adminMembersApiService = {
  getMembers(params = {}) {
    return api.get('/admin/members', { params });
  },
  // Năm số đầu trang Thành viên (PR-9): khách · trả tiền · dùng thử · sắp hết hạn 7 ngày · hết hạn 30 ngày.
  getSummary() {
    return api.get('/admin/members/summary');
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

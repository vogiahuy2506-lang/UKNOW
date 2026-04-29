import api from '../../../services/api';

/**
 * API quản lý tài khoản nhân viên dành cho user_admin.
 */
export const userManagementApiService = {
  getEmployees() {
    return api.get('/employees');
  },

  /** Tạo tài khoản nhân viên mới (email chưa tồn tại trong hệ thống). */
  createEmployee(payload) {
    return api.post('/employees', payload);
  },

  /** Link tài khoản user_admin có sẵn (chưa có plan) thành employee theo email. */
  linkEmployee(email) {
    return api.post('/employees/link', { email });
  },

  /** Cập nhật thông tin cơ bản: họ tên, email. */
  updateEmployeeInfo(employeeId, payload) {
    return api.patch(`/employees/${employeeId}`, payload);
  },

  updateEmployeeStatus(employeeId, status) {
    return api.patch(`/employees/${employeeId}/status`, { status });
  },

  resetEmployeePassword(employeeId) {
    return api.patch(`/employees/${employeeId}/reset-password`);
  },

  updateEmployeePermissions(employeeId, permissions) {
    return api.patch(`/employees/${employeeId}/permissions`, { permissions });
  },

  /**
   * Cập nhật giới hạn lượt gửi email/zalo theo ngày và tháng.
   * Giá trị null = không giới hạn.
   */
  updateSendLimits(employeeId, limits) {
    return api.patch(`/employees/${employeeId}/limits`, limits);
  },

  deleteEmployee(employeeId) {
    return api.delete(`/employees/${employeeId}`);
  },
};

export default userManagementApiService;

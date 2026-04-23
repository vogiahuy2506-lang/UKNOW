import api from '../../../services/api';

/**
 * API quản lý tài khoản nhân viên dành cho admin.
 */
export const userManagementApiService = {
  getEmployees() {
    return api.get('/users/employees');
  },

  createEmployee(payload) {
    return api.post('/users/employees', payload);
  },

  updateEmployeeStatus(employeeId, status) {
    return api.patch(`/users/employees/${employeeId}/status`, { status });
  },

  resetEmployeePassword(employeeId) {
    return api.patch(`/users/employees/${employeeId}/reset-password`);
  },

  updateEmployeeLimits(employeeId, payload) {
    return api.patch(`/users/employees/${employeeId}/limits`, payload);
  },
};

export default userManagementApiService;

import api from '../../../services/api';

const adminAuditLogsApiService = {
  getAuditLogs(params = {}) {
    return api.get('/admin/audit-logs', { params });
  },
};

export default adminAuditLogsApiService;

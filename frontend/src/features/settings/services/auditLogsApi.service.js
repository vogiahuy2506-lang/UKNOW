import api from '../../../services/api';

const auditLogsApiService = {
  getAuditLogs(params = {}) {
    return api.get('/audit-logs', { params });
  },
};

export default auditLogsApiService;

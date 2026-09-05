import api from './api';

export const affiliateService = {
  // ─── User Endpoints ────────────────────────────────────────────────────────
  getOverview: async () => {
    const response = await api.get('/affiliate/overview');
    return response.data;
  },

  getPrefill: async () => {
    const response = await api.get('/affiliate/withdrawals/prefill');
    return response.data;
  },

  requestWithdrawal: async (payload) => {
    const response = await api.post('/affiliate/withdrawals', payload);
    return response.data;
  },

  getMyWithdrawals: async () => {
    const response = await api.get('/affiliate/withdrawals/my');
    return response.data;
  },

  // ─── Admin Endpoints ───────────────────────────────────────────────────────
  getAdminWithdrawals: async (params = {}) => {
    const response = await api.get('/admin/affiliate/withdrawals', { params });
    return response.data;
  },

  approveWithdrawal: async (id) => {
    const response = await api.post(`/admin/affiliate/withdrawals/${id}/pay`);
    return response.data;
  },

  rejectWithdrawal: async (id, reason) => {
    const response = await api.post(`/admin/affiliate/withdrawals/${id}/reject`, { reason });
    return response.data;
  },

  getAdminPeriods: async (params = {}) => {
    const response = await api.get('/admin/affiliate/periods', { params });
    return response.data;
  },

  getAdminAvailableMonths: async () => {
    const response = await api.get('/admin/affiliate/available-months');
    return response.data;
  },

  adminLedgerAdjustment: async ({ userId, amount, note }) => {
    const response = await api.post('/admin/affiliate/ledger-adjustment', { userId, amount, note });
    return response.data;
  },
};

export default affiliateService;

import api from '../../../services/api';

const adminEinvoicesApiService = {
  getEinvoices(params) { return api.get('/admin/einvoices', { params }); },
  retryEinvoice(id) { return api.post(`/admin/einvoices/${id}/retry`); },
  resendEmail(id) { return api.post(`/admin/einvoices/${id}/resend-email`); },
};

export default adminEinvoicesApiService;

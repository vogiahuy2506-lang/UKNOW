import api from '../../../services/api';

const adminVouchersApiService = {
  getVouchers() {
    return api.get('/admin/vouchers');
  },
  createVoucher(payload) {
    return api.post('/admin/vouchers', payload);
  },
  updateVoucher(id, payload) {
    return api.patch(`/admin/vouchers/${id}`, payload);
  },
  deleteVoucher(id) {
    return api.delete(`/admin/vouchers/${id}`);
  },
};

export default adminVouchersApiService;

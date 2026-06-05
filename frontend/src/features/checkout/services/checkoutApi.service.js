import api from '../../../services/api';

const checkoutApiService = {
  activateFreePlan(payload) {
    return api.post('/payments/activate-free', payload);
  },

  createPayment(payload) {
    return api.post('/payments/create-payment', payload);
  },

  async getPaymentStatus(orderCode) {
    const response = await api.get(`/payments/status/${orderCode}`);
    return response.data;
  },
};

export default checkoutApiService;

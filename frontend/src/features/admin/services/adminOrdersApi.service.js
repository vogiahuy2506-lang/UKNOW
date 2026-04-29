import api from '../../../services/api';

const adminOrdersApiService = {
  getOrders(params)         { return api.get('/admin/orders', { params }); },
  cancelOrder(orderCode)    { return api.patch(`/admin/orders/${orderCode}/cancel`); },
};

export default adminOrdersApiService;

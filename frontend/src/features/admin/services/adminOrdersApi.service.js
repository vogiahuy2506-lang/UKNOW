import api from '../../../services/api';

const adminOrdersApiService = {
  getOrders(params)         { return api.get('/admin/orders', { params }); },
  cancelOrder(orderCode)    { return api.patch(`/admin/orders/${orderCode}/cancel`); },
  markPaidAfterCancelledHandled(orderCode) {
    return api.patch(`/admin/orders/${orderCode}/paid-after-cancelled/handled`);
  },
  // PLAN_HOAN_TIEN_DON_HANG — ghi nhận hoàn tiền (kế toán đã chuyển khoản tay trước đó).
  getRefundPreview(orderCode) { return api.get(`/admin/orders/${orderCode}/refund-preview`); },
  refundOrder(orderCode, body) { return api.post(`/admin/orders/${orderCode}/refund`, body); },
};

export default adminOrdersApiService;

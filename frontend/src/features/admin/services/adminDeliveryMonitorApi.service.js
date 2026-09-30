import api from '../../../services/api';

const adminDeliveryMonitorApiService = {
  // PLAN_SO_LIEU_DUNG_GON_KHOP PR-6: cửa sổ là 'today' | '7d' | '30d' (thay `windowDays` 7/30/90 của trang cũ);
  // `includeInternal` gồm cả tài khoản nội bộ; `ownerId` chỉ xem một chủ tài khoản.
  getOverview({ window = 'today', includeInternal = false, ownerId = null } = {}) {
    const params = { window };
    if (includeInternal) params.includeInternal = 1;
    if (ownerId) params.ownerId = ownerId;
    return api.get('/admin/delivery-monitor/overview', { params });
  },
};

export default adminDeliveryMonitorApiService;

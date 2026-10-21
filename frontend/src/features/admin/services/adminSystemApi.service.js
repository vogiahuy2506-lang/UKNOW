import api from '../../../services/api';

const adminSystemApiService = {
  getOverview() {
    return api.get('/admin/system/overview');
  },
  getLogs(service = 'backend', tail = 200) {
    return api.get('/admin/system/logs', { params: { service, tail } });
  },
  /** Đặt chỗ hạn mức `uncertain` chờ đối soát (kèm gợi ý bằng chứng tin nhắn). */
  getUncertainSendQuotaReservations(params = {}) {
    return api.get('/admin/system/send-quota-reservations/uncertain', { params });
  },
  /** Đối soát một đặt chỗ: outcome = 'sent' | 'not_sent'. */
  reconcileSendQuotaReservation(id, { outcome, note }) {
    return api.post(`/admin/system/send-quota-reservations/${id}/reconcile`, { outcome, note: note || undefined });
  },
};

export default adminSystemApiService;

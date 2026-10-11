import api from '../../../services/api';

/**
 * Customer feature API wrappers.
 * Keeps page layer free from raw endpoint literals.
 */
export const customerApiService = {
  /**
   * @param {object} params page, limit, search, consentSource, emailStatus, source, status, campaignId
   * @param {import('axios').AxiosRequestConfig} [config] vd { signal } để huỷ lượt cũ khi đổi trang/bộ lọc
   */
  getCustomers(params = {}, config = {}) {
    return api.get('/customers', { ...config, params });
  },

  getCustomerById(customerId) {
    return api.get(`/customers/${customerId}`);
  },

  getCustomerCampaignParticipations(customerId) {
    return api.get(`/customers/${customerId}/campaign-participations`);
  },

  getCustomerCampaignJourney(customerId, campaignId) {
    return api.get(`/customers/${customerId}/campaigns/${campaignId}/journey`);
  },

  getCampaignZaloGroupMessages(campaignId, params = {}) {
    return api.get(`/customers/campaigns/${campaignId}/zalo-group/messages`, { params });
  },

  createCustomer(payload) {
    return api.post('/customers', payload);
  },

  updateCustomer(customerId, payload) {
    return api.put(`/customers/${customerId}`, payload);
  },

  deleteCustomer(customerId) {
    return api.delete(`/customers/${customerId}`);
  },

  /**
   * Nhập/cập nhật khách hàng loạt. Backend trần 2.000 dòng mỗi lần — người gọi tự chia lô.
   * Trả `{ inserted, updated, skipped, invalid, errors: [{ index, field, message }] }`; `index` tính trong CHÍNH lô này.
   *
   * @param {object[]} items
   */
  bulkUpsertCustomers(items) {
    return api.post('/customers/bulk', { items });
  },

  /** Xuất CSV theo bộ lọc danh sách (tối đa 10.000 dòng). Trả Blob; header `x-export-truncated` báo bị cắt. */
  exportCustomersCsv(params = {}) {
    return api.get('/customers/export.csv', { params, responseType: 'blob' });
  },

  getCustomerJourney(customerId, params = {}) {
    return api.get(`/customers/${customerId}/journey`, { params });
  },

  getCampaignById(campaignId) {
    return api.get(`/campaigns/${campaignId}`);
  },

  getCustomersByQueryString(queryString, config = {}) {
    return api.get(`/customers?${queryString}`, config);
  },

  getAttachmentPresignedDownload(fileId, { preview = false } = {}) {
    const endpoint = preview
      ? `/attachments/${fileId}/presigned-download?preview=true`
      : `/attachments/${fileId}/presigned-download`;
    return api.get(endpoint);
  },

  /**
   * Lấy presigned URL tải/xem tệp Zalo theo storage key (S3 key).
   * Dùng cho tệp đính kèm trong Zalo message không lưu fileId riêng.
   *
   * @param {string} storageKey - S3 storage key (phải bắt đầu bằng uploads/)
   * @param {{ preview?: boolean }} [options]
   * @returns {Promise<{ data: { url: string, fileName: string } }>}
   */
  getAttachmentPresignedByKey(storageKey, { preview = false } = {}) {
    return api.get('/attachments/presigned-by-key', {
      params: { key: storageKey, ...(preview ? { preview: 'true' } : {}) },
    });
  },
};

export default customerApiService;

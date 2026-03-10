import api from '../../../services/api';

/**
 * Customer feature API wrappers.
 * Keeps page layer free from raw endpoint literals.
 */
export const customerApiService = {
  getCustomers(params = {}) {
    return api.get('/customers', { params });
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

  bulkUpsertCustomers(payload) {
    return api.post('/customers/bulk-upsert', payload);
  },

  getCustomerJourney(customerId, params = {}) {
    return api.get(`/customers/${customerId}/journey`, { params });
  },

  getCustomerCampaignJourneyDetail(customerId, campaignId, params = {}) {
    return api.get(`/customers/${customerId}/campaigns/${campaignId}/journey-detail`, { params });
  },

  getCampaignById(campaignId) {
    return api.get(`/campaigns/${campaignId}`);
  },

  getCustomersByQueryString(queryString) {
    return api.get(`/customers?${queryString}`);
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

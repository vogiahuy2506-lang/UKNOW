import api from '../../../services/api';

/**
 * Campaign feature API wrappers.
 * Centralizes campaign-related endpoints so pages/hooks avoid direct endpoint strings.
 */
export const campaignApiService = {
  getCampaigns(params = {}) {
    return api.get('/campaigns', { params });
  },

  getCampaignById(campaignId) {
    return api.get(`/campaigns/${campaignId}`);
  },

  // PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 1 — kênh 'adapter' nào đang bật (cờ tắt -> []).
  getChannels() {
    return api.get('/campaigns/channels');
  },

  createCampaign(payload) {
    return api.post('/campaigns', payload);
  },

  updateCampaign(campaignId, payload) {
    return api.put(`/campaigns/${campaignId}`, payload);
  },

  deleteCampaign(campaignId) {
    return api.delete(`/campaigns/${campaignId}`);
  },

  runCampaign(campaignId, payload = {}) {
    return api.post(`/campaigns/${campaignId}/run`, payload);
  },

  publishCampaign(campaignId) {
    return api.post(`/campaigns/${campaignId}/publish`);
  },

  pauseCampaign(campaignId) {
    return api.post(`/campaigns/${campaignId}/pause`);
  },

  resumeCampaign(campaignId) {
    return api.post(`/campaigns/${campaignId}/resume`);
  },

  approveCampaign(campaignId) {
    return api.post(`/campaigns/${campaignId}/approve`);
  },

  rejectCampaign(campaignId, payload = {}) {
    return api.post(`/campaigns/${campaignId}/reject`, payload);
  },

  duplicateCampaign(campaignId, payload) {
    return api.post(`/campaigns/${campaignId}/duplicate`, payload);
  },

  // Campaign sharing
  getSharedWithMe(params = {}) {
    return api.get('/campaigns/shared/with-me', { params });
  },

  getSharedByMe(params = {}) {
    return api.get('/campaigns/shared/by-me', { params });
  },

  shareCampaign(campaignId, payload) {
    return api.post(`/campaigns/${campaignId}/share`, payload);
  },

  getCampaignShares(campaignId) {
    return api.get(`/campaigns/${campaignId}/shares`);
  },

  revokeShare(campaignId) {
    return api.delete(`/campaigns/${campaignId}/share`);
  },

  /**
   * Trình tạo chiến dịch "Từng bước" (PLAN_TAO_CHIEN_DICH_TUNG_BUOC_2026-10-14, PR-1/PR-2).
   * Body theo hợp đồng PR-1: `{ campaignName?, channel, senderId, audience, content }` — server tự dựng intent,
   * trình duyệt KHÔNG gửi `CampaignIntentV1`. Preview KHÔNG ghi DB.
   *
   * @param {object} body
   * @param {object} [options] tuỳ chọn axios
   * @returns {Promise<object>} `{ readyToCreate, issues[], estimate, recipientCount, summary }` (có thể bọc trong `data`)
   */
  previewSimpleCampaign(body, options = {}) {
    return api.post('/campaigns/simple/preview', body, options);
  },

  /**
   * Tạo chiến dịch nháp từ trình "Từng bước". 201 → `{ campaignId, campaignName, channel, recipientCountHint }`.
   * Việc chạy làm riêng bằng `runCampaign` (campaignRunApi.service) để dùng chung kiểm hạn mức/duyệt/preflight.
   *
   * @param {object} body cùng hợp đồng với preview
   * @param {object} [options] tuỳ chọn axios
   */
  createSimpleCampaign(body, options = {}) {
    return api.post('/campaigns/simple', body, options);
  },
};

export default campaignApiService;

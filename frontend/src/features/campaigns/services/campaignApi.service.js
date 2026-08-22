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

  // Quick send estimate & test send
  getQuickSendEstimate(params = {}) {
    return api.get('/campaigns/quick-send/estimate', { params });
  },

  testSendQuickCampaign(payload) {
    return api.post('/campaigns/quick-send/test-send', payload);
  },
};

export default campaignApiService;

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

  pauseCampaign(campaignId) {
    return api.post(`/campaigns/${campaignId}/pause`);
  },

  resumeCampaign(campaignId) {
    return api.post(`/campaigns/${campaignId}/resume`);
  },
};

export default campaignApiService;

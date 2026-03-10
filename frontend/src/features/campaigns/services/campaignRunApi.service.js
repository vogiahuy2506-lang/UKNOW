import api from '../../../services/api';

const campaignRunApiService = {
  getCampaignById(campaignId, options = {}) {
    return api.get(`/campaigns/${campaignId}`, options);
  },

  getCampaignsByStatus(status, limit = 100, options = {}) {
    return api.get(`/campaigns?status=${status}&limit=${limit}`, options);
  },

  getCampaignSchedules(options = {}) {
    return api.get('/campaign-schedules', options);
  },

  getCampaignRuns(paramsQuery = 'limit=100', options = {}) {
    return api.get(`/campaign-runs?${paramsQuery}`, options);
  },

  getCampaignRunDetail(runId, options = {}) {
    return api.get(`/campaign-runs/${runId}`, options);
  },

  runCampaign(campaignId, payload = {}, options = {}) {
    return api.post(`/campaigns/${campaignId}/run`, payload, options);
  },

  stopCampaignRun(runId, options = {}) {
    return api.post(`/campaign-runs/${runId}/stop`, {}, options);
  },

  createCampaignSchedule(payload, options = {}) {
    return api.post('/campaign-schedules', payload, options);
  },

  deleteCampaignSchedule(scheduleId, options = {}) {
    return api.delete(`/campaign-schedules/${scheduleId}`, options);
  },

  updateCampaignSchedule(scheduleId, payload, options = {}) {
    return api.patch(`/campaign-schedules/${scheduleId}`, payload, options);
  },

  publishCampaign(campaignId, options = {}) {
    return api.post(`/campaigns/${campaignId}/publish`, {}, options);
  },
};

export default campaignRunApiService;

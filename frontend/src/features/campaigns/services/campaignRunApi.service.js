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

  /**
   * Chi tiết một lượt chạy. `queryParams` bật data loader (cursor) cho `executionLogs`.
   *
   * @param {number|string} runId id run
   * @param {object} [queryParams={}] executionLogsLimit, executionLogsAfterId, executionLogsUpdatedAfter
   * @param {object} [options={}] tùy chọn axios (vd cancel token)
   * @returns {Promise<object>}
   */
  getCampaignRunDetail(runId, queryParams = {}, options = {}) {
    const q = new URLSearchParams();
    if (queryParams.executionLogsLimit != null && queryParams.executionLogsLimit !== '') {
      q.set('executionLogsLimit', String(queryParams.executionLogsLimit));
    }
    if (queryParams.executionLogsAfterId != null && queryParams.executionLogsAfterId !== '') {
      q.set('executionLogsAfterId', String(queryParams.executionLogsAfterId));
    }
    if (queryParams.executionLogsUpdatedAfter) {
      q.set('executionLogsUpdatedAfter', String(queryParams.executionLogsUpdatedAfter));
    }
    const qs = q.toString();
    return api.get(`/campaign-runs/${runId}${qs ? `?${qs}` : ''}`, options);
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

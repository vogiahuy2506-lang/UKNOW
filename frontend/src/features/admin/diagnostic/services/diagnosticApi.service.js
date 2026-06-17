import api from '../../../../services/api';

const diagnosticApiService = {
  getConfig() {
    return api.get('/admin/diagnostic/config');
  },
  getPolicy({ channel, accountId }) {
    return api.get('/admin/diagnostic/policy', {
      params: { channel, accountId: accountId || undefined },
    });
  },
  getSupportedChannels() {
    return api.get('/admin/diagnostic/channels');
  },
  createRun({ channel, accountId, messageText, interMessageDelayMs, recipients, mode }) {
    return api.post('/admin/diagnostic/runs', {
      channel,
      accountId,
      messageText,
      interMessageDelayMs,
      recipients,
      mode,
    });
  },
  getRun(runId) {
    return api.get(`/admin/diagnostic/runs/${runId}`);
  },
  listRuns() {
    return api.get('/admin/diagnostic/runs');
  },
  listCampaigns() {
    return api.get('/admin/diagnostic/campaigns');
  },
  getCampaignPrefill(campaignId) {
    return api.get(`/admin/diagnostic/campaigns/${campaignId}/prefill`);
  },
};

export default diagnosticApiService;

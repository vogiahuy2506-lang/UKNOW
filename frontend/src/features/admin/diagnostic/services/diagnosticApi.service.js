import api from '../../../../services/api';

const diagnosticApiService = {
  getSupportedChannels() {
    return api.get('/admin/diagnostic/channels');
  },
  createRun({ channel, accountId, messageText, interMessageDelayMs, recipients }) {
    return api.post('/admin/diagnostic/runs', {
      channel, accountId, messageText, interMessageDelayMs, recipients,
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

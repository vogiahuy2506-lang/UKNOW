import api from '../../../services/api';

/**
 * API helpers dedicated to CampaignBuilder workflows.
 * Keeps endpoint construction out of large page components.
 */
const getInterestedCustomersEndpoint = (dataSource = 'database') =>
  dataSource === 'api' ? '/customers/interested-courses-from-api' : '/customers/interested-courses';

const campaignBuilderApiService = {
  getEmailTemplateById(templateId, options = {}) {
    return api.get(`/email-templates/${templateId}`, options);
  },

  getEmailTemplates(options = {}) {
    return api.get('/email-templates', options);
  },

  getActiveEmailSettings(options = {}) {
    return api.get('/email-settings', {
      params: { status: 'active', page: 1, limit: 100 },
      ...options,
    });
  },

  getCampaignById(campaignId, options = {}) {
    return api.get(`/campaigns/${campaignId}`, options);
  },

  createCampaign(payload, options = {}) {
    return api.post('/campaigns', payload, options);
  },

  updateCampaign(campaignId, payload, options = {}) {
    return api.put(`/campaigns/${campaignId}`, payload, options);
  },

  getInterestedCustomersByQuery(queryString, dataSource = 'database', options = {}) {
    const endpoint = getInterestedCustomersEndpoint(dataSource);
    return api.get(`${endpoint}?${queryString}`, options);
  },

  getCourses(params = {}, options = {}) {
    return api.get('/courses', { params, ...options });
  },

  previewGoogleSheet(payload, options = {}) {
    return api.post('/google-sheets/preview', payload, options);
  },

  checkGoogleSheet(payload, options = {}) {
    return api.post('/google-sheets/check', payload, options);
  },

  sendPreviewEmail(payload, options = {}) {
    return api.post('/email-settings/send-email', payload, options);
  },

  getZaloAccounts(options = {}) {
    return api.get('/zalo/accounts', options);
  },

  restoreZaloAccountSession(accountId, options = {}) {
    return api.post(`/zalo/accounts/${accountId}/restore-session`, {}, options);
  },

  getZaloTemplates(options = {}) {
    return api.get('/zalo-templates', options);
  },

  getZaloTemplateById(templateId, options = {}) {
    return api.get(`/zalo-templates/${templateId}`, options);
  },

  sendPreviewZaloPersonal(payload, options = {}) {
    return api.post('/zalo/preview/send-personal', payload, options);
  },

  sendPreviewZaloFriendRequest(payload, options = {}) {
    return api.post('/zalo/preview/send-friend-request', payload, options);
  },

  sendPreviewZaloGroup(payload, options = {}) {
    return api.post('/zalo/preview/send-group', payload, options);
  },

  getAttachmentPreviewUrlByKey(key, options = {}) {
    return api.get('/attachments/presigned-by-key', {
      params: { key, preview: 'true' },
      ...options,
    });
  },

  getPreviewZaloFriends(params = {}, options = {}) {
    return api.get('/zalo/preview/friends', { params, ...options });
  },

  getPreviewZaloGroups(params = {}, options = {}) {
    return api.get('/zalo/preview/groups', { params, ...options });
  },
};

export default campaignBuilderApiService;

import api from '../../../services/api';

/**
 * API helpers dedicated to CampaignBuilder workflows.
 * Keeps endpoint construction out of large page components.
 */
const getInterestedCustomersEndpoint = (dataSource = 'database') =>
  dataSource === 'api' ? '/customers/interested-courses-from-api' : '/customers/interested-courses';

/** Zalo getAllGroups + enrich tên nhóm có thể lâu — tránh cắt sớm so với timeout axios mặc định 10s. */
const PREVIEW_ZALO_LIST_TIMEOUT_MS = 180000;

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

  getProducts(params = {}, options = {}) {
    return api.get('/products', { params, ...options });
  },

  /**
   * Preview lead landing (GET /api/leads/preview) — dùng cho node read_landing_leads trong Builder.
   *
   * @param {object} params query (occupations/interests JSON string)
   * @param {object} options axios options
   */
  previewLandingLeads(params = {}, options = {}) {
    const q = {
      ...params,
      landingLeadsUseDateRange:
        params.landingLeadsUseDateRange === true
        || params.landingLeadsUseDateRange === 'true'
        || params.landingLeadsUseDateRange === '1'
          ? 'true'
          : 'false',
    };
    return api.get('/leads/preview', { params: q, ...options });
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
    return api.get('/zalo/preview/friends', {
      params,
      timeout: PREVIEW_ZALO_LIST_TIMEOUT_MS,
      ...options,
    });
  },

  getPreviewZaloGroups(params = {}, options = {}) {
    return api.get('/zalo/preview/groups', {
      params,
      timeout: PREVIEW_ZALO_LIST_TIMEOUT_MS,
      ...options,
    });
  },
  getDelayConfig(options = {}) {
    return api.get('/campaigns/delay-config', options);
  },
};

export default campaignBuilderApiService;

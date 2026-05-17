import api from './api';

const aiApi = {
  /**
   * Generate campaign script from AI.
   * @param {string} prompt
   * @param {Array} files Array of { tempId, originalName, ... }
   */
  generateCampaign: async (prompt, files = []) => {
    const response = await api.post('/ai/generate-campaign', { prompt, files }, {
      timeout: 120000 // 2 minutes for thinking models
    });
    return response.data;
  },

  /**
   * Execute (Create & Run) the generated campaign.
   * @param {object} script The campaign script from generateCampaign
   * @param {boolean} autoRun Whether to run the campaign immediately
   */
  executeCampaign: async (script, autoRun = true) => {
    const response = await api.post('/ai/execute-campaign', { ...script, autoRun });
    return response.data;
  },

  /**
   * Create campaign from AI draft (NO auto-run).
   * User will review and run manually.
   * @param {object} script The campaign script from AI
   */
  createCampaignFromDraft: async (script) => {
    const response = await api.post('/ai/create-from-draft', { script });
    return response.data;
  },

  /**
   * Push AI script to an existing campaign.
   * @param {number} campaignId Target campaign ID
   * @param {object} script The campaign script
   * @param {boolean} autoRun Whether to run the campaign immediately
   */
  pushToCampaign: async (campaignId, script, autoRun = false) => {
    const response = await api.post(`/ai/push-to-campaign/${campaignId}`, { script, autoRun });
    return response.data;
  },

  /**
   * Create AND RUN campaign automatically (no confirmation).
   * @param {object} script The campaign script from AI
   */
  createAndRunCampaign: async (script) => {
    const response = await api.post('/ai/create-and-run-campaign', { script }, {
      timeout: 120000
    });
    return response.data;
  },

  /**
   * Smart interactive chat.
   * @param {Array} history Array of { role, content }
   * @param {Array} files Array of current attached files
   */
  chat: async (history, files = []) => {
    const response = await api.post('/ai/chat', { history, files }, {
      timeout: 120000
    });
    return response.data;
  },

  getBusinessProfile: async () => {
    const response = await api.get('/ai/business-profile');
    return response.data;
  },

  saveBusinessProfile: async (data) => {
    const response = await api.put('/ai/business-profile', data);
    return response.data;
  },

  // Landing Page Templates
  getLandingTemplates: async (category = null) => {
    const params = category ? { category } : {};
    const response = await api.get('/landing-templates', { params });
    return response.data;
  },

  getLandingTemplateCategories: async () => {
    const response = await api.get('/landing-templates/categories');
    return response.data;
  },

  getLandingTemplate: async (id) => {
    const response = await api.get(`/landing-templates/${id}`);
    return response.data;
  },

  generateLandingPage: async (prompt, templateId = null, files = []) => {
    const response = await api.post('/landing-templates/generate', { prompt, templateId, files }, {
      timeout: 120000
    });
    return response.data;
  },
};

export default aiApi;

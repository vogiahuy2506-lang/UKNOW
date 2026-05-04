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
   * Smart interactive chat.
   * @param {Array} history Array of { role, content }
   * @param {Array} files Array of current attached files
   */
  chat: async (history, files = []) => {
    const response = await api.post('/ai/chat', { history, files }, {
      timeout: 120000
    });
    return response.data;
  }
};

export default aiApi;

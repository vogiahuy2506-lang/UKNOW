import api from '../../../services/api';
import rootChatbotApi from '../../../services/chatbotApi';

const chatbotApiService = {
  ...rootChatbotApi,

  testInboxConnection(channelType) {
    return api.post(`/ai/chatbot/inbox/test-connection/${channelType}`);
  },

  listCustomChatDocuments(chatbotId) {
    return api.get(`/ai/custom-chat/documents/${chatbotId}`);
  },

  uploadCustomChatDocument(formData) {
    return api.post('/ai/custom-chat/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  sendCustomChat(payload) {
    return api.post('/ai/custom-chat', payload);
  },

  getPublicChatbot(chatbotId) {
    return api.get(`/chatbot-public/chatbot/${chatbotId}`);
  },

  sendPublicChatbotMessage(chatbotId, payload) {
    return api.post(`/chatbot-public/custom-chatbot/id/${chatbotId}/chat`, payload);
  },

  async initFacebookOAuth(payload) {
    const response = await api.post('/webhooks/oauth/facebook/init', payload);
    return response.data;
  },

  async initZaloOAuth(payload) {
    const response = await api.post('/webhooks/oauth/zalo-oa/init', payload);
    return response.data;
  },

  // ── Zalo Personal Account Chatbot Settings ─────────────────────────────────

  // Get chatbot settings for a specific Zalo account
  getZaloAccountChatbotSettings(zaloSettingId) {
    return api.get(`/ai/chatbot/zalo-account/${zaloSettingId}/chatbot`);
  },

  // Update chatbot settings for a Zalo account
  updateZaloAccountChatbotSettings(zaloSettingId, data) {
    return api.put(`/ai/chatbot/zalo-account/${zaloSettingId}/chatbot`, data);
  },

  // Toggle chatbot for a Zalo account
  toggleZaloAccountChatbot(zaloSettingId, enabled) {
    return api.post(`/ai/chatbot/zalo-account/${zaloSettingId}/chatbot/toggle`, { enabled });
  },

  // List all Zalo accounts with chatbot settings
  listZaloAccountsWithChatbotSettings() {
    return api.get('/ai/chatbot/zalo-accounts/chatbot');
  },

  // Delete a conversation
  deleteConversation(conversationId, type = 'zalo_personal') {
    return api.delete(`/ai/chatbot/inbox/conversations/${conversationId}?type=${type}`);
  },
};

export default chatbotApiService;

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

  uploadChatbotLogo(formData) {
    return api.post('/ai/custom-chat/logo', formData, {
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

  // ── Knowledge Base ────────────────────────────────────────────────────────

  deleteDocument(chatbotId, docId) {
    return api.delete(`/ai/custom-chat/documents/${chatbotId}/${encodeURIComponent(docId)}`);
  },

  addCustomChatTextDocument(chatbotId, data) {
    return api.post(`/ai/custom-chat/text/${chatbotId}`, data);
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

  // ── Zalo Personal Sync ──────────────────────────────────────────────────────

  // Get sync status
  getZaloSyncStatus() {
    return api.get('/ai/chatbot/zalo-personal/sync/status');
  },

  // Sync all (contacts + groups)
  syncZaloAll() {
    return api.get('/ai/chatbot/zalo-personal/sync');
  },

  // Sync contacts only
  syncZaloContacts() {
    return api.get('/ai/chatbot/zalo-personal/sync/contacts');
  },

  // Sync groups only
  syncZaloGroups() {
    return api.get('/ai/chatbot/zalo-personal/sync/groups');
  },

  // Sync chat history for a specific conversation
  syncZaloChatHistory(externalId, isGroup, options = {}) {
    return api.post('/ai/chatbot/zalo-personal/sync/chat-history', {
      externalId,
      isGroup,
      limit: options.limit || 50,
      beforeMsgId: options.beforeMsgId,
    });
  },

  // Sync all group histories
  syncZaloAllGroupHistory(limit = 50) {
    return api.post(`/ai/chatbot/zalo-personal/sync/group-history?limit=${limit}`);
  },

  // Get chat history from DB for AI context
  getZaloChatHistory(conversationId, limit = 50) {
    return api.get(`/ai/chatbot/zalo-personal/history?conversationId=${conversationId}&limit=${limit}`);
  },
};

export default chatbotApiService;

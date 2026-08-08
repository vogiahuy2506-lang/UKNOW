import api from '../../../services/api';
import rootChatbotApi from '../../../services/chatbotApi';

/** Gemini + RAG có thể mất 30–90s; đồng bộ với aiApi.chat (120s). */
const AI_CHAT_TIMEOUT_MS = 120000;

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
      timeout: AI_CHAT_TIMEOUT_MS,
    });
  },

  uploadChatbotLogo(formData) {
    return api.post('/ai/custom-chat/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  sendCustomChat(payload) {
    return api.post('/ai/custom-chat', payload, { timeout: AI_CHAT_TIMEOUT_MS });
  },

  // Chatbot Studio Conversations
  getChatbotStudioConversations(params = {}) {
    return api.get('/ai/chatbot-studio/conversations', { params: { ...params } });
  },
  getChatbotStudioConversation(conversationId) {
    return api.get(`/ai/chatbot-studio/conversations/${conversationId}`);
  },
  getChatbotStudioMessages(conversationId, params = {}) {
    return api.get(`/ai/chatbot-studio/conversations/${conversationId}/messages`, { params });
  },
  createChatbotStudioConversation(chatbotId) {
    return api.post('/ai/chatbot-studio/conversations', { chatbot_id: chatbotId });
  },
  addChatbotStudioMessage(conversationId, message) {
    return api.post(`/ai/chatbot-studio/conversations/${conversationId}/messages`, message);
  },
  deleteChatbotStudioConversation(conversationId) {
    return api.delete(`/ai/chatbot-studio/conversations/${conversationId}`);
  },
  clearChatbotStudioConversation(conversationId) {
    return api.delete(`/ai/chatbot-studio/conversations/${conversationId}/messages`);
  },

  getPublicChatbot(chatbotId) {
    return api.get(`/chatbot-public/chatbot/${chatbotId}`);
  },

  sendPublicChatbotMessage(chatbotId, payload) {
    return api.post(`/chatbot-public/custom-chatbot/id/${chatbotId}/chat`, payload, {
      timeout: AI_CHAT_TIMEOUT_MS,
    });
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
    // encode twice because the server decodes it once automatically by Express,
    // and if there are special chars like '/', a double encode prevents routing errors.
    return api.delete(`/ai/custom-chat/documents/${chatbotId}/${encodeURIComponent(encodeURIComponent(docId))}`);
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

  setConversationAiPaused(conversationId, type, paused) {
    return api.post(`/ai/chatbot/inbox/conversations/${conversationId}/ai-pause`, { type, paused });
  },

  // ── Zalo Personal Sync ──────────────────────────────────────────────────────

  // Get sync status
  getZaloSyncStatus() {
    return api.get('/ai/chatbot/zalo-personal/sync/status');
  },

  // Sync all (contacts + groups)
  syncZaloAll(accountId) {
    return api.get('/ai/chatbot/zalo-personal/sync', {
      params: accountId != null ? { accountId } : undefined,
    });
  },

  // Sync contacts only
  syncZaloContacts(accountId) {
    return api.get('/ai/chatbot/zalo-personal/sync/contacts', {
      params: accountId != null ? { accountId } : undefined,
    });
  },

  // Sync groups only
  syncZaloGroups(accountId) {
    return api.get('/ai/chatbot/zalo-personal/sync/groups', {
      params: accountId != null ? { accountId } : undefined,
    });
  },

  // Sync chat history for a specific conversation
  syncZaloChatHistory(externalId, isGroup, options = {}) {
    return api.post('/ai/chatbot/zalo-personal/sync/chat-history', {
      externalId,
      isGroup,
      limit: options.limit || 50,
      beforeMsgId: options.beforeMsgId,
      accountId: options.accountId,
    });
  },

  // Sync all group histories
  syncZaloAllGroupHistory(limit = 50, accountId = null) {
    return api.post('/ai/chatbot/zalo-personal/sync/group-history', null, {
      params: {
        limit,
        ...(accountId != null ? { accountId } : {}),
      },
    });
  },

  // Get chat history from DB for AI context
  getZaloChatHistory(conversationId, limit = 50) {
    return api.get(`/ai/chatbot/zalo-personal/history?conversationId=${conversationId}&limit=${limit}`);
  },
};

export default chatbotApiService;

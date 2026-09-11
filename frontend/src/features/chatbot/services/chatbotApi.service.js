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

  uploadChatAttachment(formData) {
    return api.post('/ai/chat-attachment', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: AI_CHAT_TIMEOUT_MS,
    });
  },

  deleteChatAttachment(payload) {
    return api.delete('/ai/chat-attachment', { data: payload });
  },

  uploadPublicChatAttachment(chatbotId, formData) {
    return api.post(`/chatbot-public/custom-chatbot/id/${chatbotId}/attachment`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: AI_CHAT_TIMEOUT_MS,
    });
  },

  deletePublicChatAttachment(chatbotId, payload) {
    return api.delete(`/chatbot-public/custom-chatbot/id/${chatbotId}/attachment`, { data: payload });
  },

  uploadPublicChatAttachmentByWidgetKey(widgetKey, formData) {
    return api.post(`/chatbot-public/custom-chatbot/${widgetKey}/attachment`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: AI_CHAT_TIMEOUT_MS,
    });
  },

  deletePublicChatAttachmentByWidgetKey(widgetKey, payload) {
    return api.delete(`/chatbot-public/custom-chatbot/${widgetKey}/attachment`, { data: payload });
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

  getDocument(chatbotId, docId) {
    return api.get(`/ai/custom-chat/documents/${chatbotId}/${docId}`);
  },

  deleteDocument(chatbotId, docId) {
    // encode twice because the server decodes it once automatically by Express,
    // and if there are special chars like '/', a double encode prevents routing errors.
    return api.delete(`/ai/custom-chat/documents/${chatbotId}/${encodeURIComponent(encodeURIComponent(docId))}`);
  },

  addCustomChatTextDocument(chatbotId, data) {
    return api.post(`/ai/custom-chat/text/${chatbotId}`, data);
  },

  scrapeCustomChatWebsite(chatbotId, payload) {
    return api.post(`/ai/custom-chat/scrape/${chatbotId}`, payload, {
      timeout: AI_CHAT_TIMEOUT_MS,
    });
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

  // List all Zalo accounts with chatbot settings, optionally scoped to one chatbot
  listZaloAccountsWithChatbotSettings(chatbotId) {
    const params = chatbotId == null || chatbotId === ''
      ? null
      : { chatbot_id: chatbotId };
    return api.get('/ai/chatbot/zalo-accounts/chatbot', { params });
  },

  // Toggle chatbot for a Zalo account + chatbot combination.
  // If idChatbot is omitted, the toggle applies to the default (unlinked) row.
  toggleZaloAccountChatbot(zaloSettingId, enabled, idChatbot) {
    return api.post(
      `/ai/chatbot/zalo-account/${zaloSettingId}/chatbot/toggle`,
      { enabled, id_chatbot: idChatbot ?? null }
    );
  },

  // ── WhatsApp per-chatbot enable (DeployTab modal) ──────────────────────────

  // List all WhatsApp accounts owned by the user, optionally scoped to one chatbot.
  // The flag `chatbot_enabled` reflects per-chatbot enable for the chosen chatbot.
  listWhatsAppAccountsWithChatbotSettings(chatbotId) {
    const params = chatbotId == null || chatbotId === ''
      ? null
      : { chatbot_id: chatbotId };
    return api.get('/ai/chatbot/whatsapp-accounts/chatbot', { params });
  },

  // Toggle per-chatbot AI enable for a WhatsApp account. Lazily creates the
  // (user, whatsapp account, chatbot) tuple on first call.
  //
  // accountId shape:
  //   - string starting with "<userId>-" → Baileys session_key (gửi kèm session_key)
  //   - number                       → Cloud API id_channel_connection (legacy)
  //   - object { provider, id, session_key } → caller có thể truyền sẵn
  toggleWhatsAppAccountChatbot(accountId, enabled, idChatbot) {
    let payload = { enabled, id_chatbot: idChatbot ?? null };
    let url;

    if (typeof accountId === 'string') {
      // Baileys: accountId chính là session_key ("${userId}-${shortKey}")
      payload.session_key = accountId;
      url = `/ai/chatbot/whatsapp-account/chatbot/toggle`;
    } else if (typeof accountId === 'object' && accountId !== null) {
      // Caller đã biết provider
      if (accountId.provider === 'baileys' && accountId.session_key) {
        payload.session_key = accountId.session_key;
        url = `/ai/chatbot/whatsapp-account/chatbot/toggle`;
      } else if (accountId.id != null) {
        payload.id_channel_connection = accountId.id;
        url = `/ai/chatbot/whatsapp-account/${accountId.id}/chatbot/toggle`;
      } else {
        url = `/ai/chatbot/whatsapp-account/chatbot/toggle`;
      }
    } else {
      payload.id_channel_connection = accountId;
      url = `/ai/chatbot/whatsapp-account/${accountId}/chatbot/toggle`;
    }
    return api.post(url, payload);
  },

  // ── Studio chatbots (used by WhatsAppSettings to pick a chatbot) ───────────

  listCustomChatbots(params = {}) {
    return api.get('/ai/chatbot/custom-chatbots', { params });
  },

  // ── Telegram Personal Account (managed by Python telegram-gateway) ──────

  // Bắt đầu QR login flow, trả về QR image base64.
  initTelegramLogin() {
    return api.post('/ai/chatbot/telegram-accounts/init');
  },

  // Poll trạng thái QR login. Khi success, trả về account row.
  checkTelegramLoginStatus(sessionId) {
    return api.get(`/ai/chatbot/telegram-accounts/status/${encodeURIComponent(sessionId)}`);
  },

  // Hủy QR login flow.
  cancelTelegramLogin(sessionId) {
    return api.delete(`/ai/chatbot/telegram-accounts/login/${encodeURIComponent(sessionId)}`);
  },

  // List Telegram accounts (Channel Settings).
  listTelegramAccounts() {
    return api.get('/ai/chatbot/telegram-accounts');
  },

  // Xóa tài khoản Telegram vĩnh viễn.
  deleteTelegramAccount(id) {
    return api.delete(`/ai/chatbot/telegram-accounts/${id}`);
  },

  // Ngắt kết nối Telegram, giữ row lịch sử.
  logoutTelegramAccount(id) {
    return api.post(`/ai/chatbot/telegram-accounts/${id}/logout`);
  },

  // DeployTab modal: list accounts kèm enable flag cho một chatbot cụ thể.
  listTelegramAccountsWithChatbotSettings(chatbotId) {
    const params = chatbotId == null || chatbotId === ''
      ? null
      : { chatbot_id: chatbotId };
    return api.get('/ai/chatbot/telegram-accounts/chatbot', { params });
  },

  // DeployTab modal: bật/tắt chatbot cho Telegram account.
  toggleTelegramAccountChatbot(accountId, enabled, idChatbot) {
    return api.post('/ai/chatbot/telegram-account/chatbot/toggle', {
      enabled,
      id_account: accountId,
      id_chatbot: idChatbot ?? null,
    });
  },

  // Delete a conversation
  deleteConversation(conversationId, type = 'zalo_personal') {
    return api.delete(`/ai/chatbot/inbox/conversations/${conversationId}?type=${type}`);
  },

  setConversationAiPaused(conversationId, type, paused) {
    return api.post(`/ai/chatbot/inbox/conversations/${conversationId}/ai-pause`, { type, paused })
      .then((res) => res.data);
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

  // Get synced friends from DB
  getZaloFriends({ accountId, search = '', page = 1, limit = 50 } = {}) {
    return api.get('/ai/chatbot/zalo-personal/friends', {
      params: {
        accountId,
        ...(search ? { search } : {}),
        page,
        limit,
      },
    });
  },

  // AI Activity Daily Report
  getAiActivityReport({ date, accountId } = {}) {
    return api.get('/ai/chatbot/inbox/ai-activity', {
      params: {
        ...(date ? { date } : {}),
        ...(accountId != null ? { accountId } : {}),
      },
    });
  },

  // Resume all paused AI conversations
  resumeAllAi() {
    return api.post('/ai/chatbot/inbox/ai-activity/resume-all');
  },

  // Summarize daily conversations with Gemini
  summarizeAiActivity({ date } = {}) {
    return api.post('/ai/chatbot/inbox/ai-activity/summarize', { date });
  },
};

export default chatbotApiService;


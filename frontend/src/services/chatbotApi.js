import api from './api';

const chatbotApi = {
  // ── Knowledge Base ─────────────────────────────────────────────

  listKBs: async () => {
    const response = await api.get('/ai/chatbot/kb');
    return response.data;
  },

  getKB: async (id) => {
    const response = await api.get(`/ai/chatbot/kb/${id}`);
    return response.data;
  },

  createKB: async (data) => {
    const response = await api.post('/ai/chatbot/kb', data);
    return response.data;
  },

  updateKB: async (id, data) => {
    const response = await api.put(`/ai/chatbot/kb/${id}`, data);
    return response.data;
  },

  deleteKB: async (id) => {
    const response = await api.delete(`/ai/chatbot/kb/${id}`);
    return response.data;
  },

  listDocuments: async (kbId) => {
    const response = await api.get(`/ai/chatbot/kb/${kbId}/documents`);
    return response.data;
  },

  uploadDocument: async (kbId, formData) => {
    const response = await api.post(`/ai/chatbot/kb/${kbId}/documents/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    return response.data;
  },

  addTextDocument: async (kbId, { title, content }) => {
    const response = await api.post(`/ai/chatbot/kb/${kbId}/documents/text`, { title, content });
    return response.data;
  },

  addUrlDocument: async (kbId, { title, url }) => {
    const response = await api.post(`/ai/chatbot/kb/${kbId}/documents/url`, { title, url });
    return response.data;
  },

  deleteDocument: async (kbId, docId) => {
    const response = await api.delete(`/ai/chatbot/kb/${kbId}/documents/${docId}`);
    return response.data;
  },

  reprocessDocument: async (kbId, docId) => {
    const response = await api.post(`/ai/chatbot/kb/${kbId}/documents/${docId}/reprocess`);
    return response.data;
  },

  getChunks: async (kbId, { limit = 100, offset = 0 } = {}) => {
    const response = await api.get(`/ai/chatbot/kb/${kbId}/chunks`, {
      params: { limit, offset },
    });
    return response.data;
  },

  // ── Sub-Assistant ───────────────────────────────────────────

  listSubAssistants: async () => {
    const response = await api.get('/ai/chatbot/sub-assistants');
    return response.data;
  },

  getSubAssistant: async (id) => {
    const response = await api.get(`/ai/chatbot/sub-assistants/${id}`);
    return response.data;
  },

  createSubAssistant: async (data) => {
    const response = await api.post('/ai/chatbot/sub-assistants', data);
    return response.data;
  },

  updateSubAssistant: async (id, data) => {
    const response = await api.put(`/ai/chatbot/sub-assistants/${id}`, data);
    return response.data;
  },

  deleteSubAssistant: async (id) => {
    const response = await api.delete(`/ai/chatbot/sub-assistants/${id}`);
    return response.data;
  },

  // ── Chatbot Settings ─────────────────────────────────────────

  getChatbotSettings: async (channel) => {
    const response = await api.get(`/ai/chatbot/chatbot/settings/${channel}`);
    return response.data;
  },

  updateChatbotSettings: async (channel, data) => {
    const response = await api.put(`/ai/chatbot/chatbot/settings/${channel}`, data);
    return response.data;
  },

  // ── Channel Connections ────────────────────────────────────────

  listChannels: async () => {
    const response = await api.get('/ai/chatbot/channels');
    return response.data;
  },

  connectZaloOA: async (data) => {
    const response = await api.post('/ai/chatbot/channels/connect/zalo-oa', data);
    return response.data;
  },

  connectFacebook: async (data) => {
    const response = await api.post('/ai/chatbot/channels/connect/facebook', data);
    return response.data;
  },

  disconnectChannel: async (channel) => {
    const response = await api.delete(`/ai/chatbot/channels/${channel}`);
    return response.data;
  },

  // ── Web Widget ───────────────────────────────────────────────

  listWidgets: async () => {
    const response = await api.get('/ai/chatbot/widgets');
    return response.data;
  },

  createWidget: async (data) => {
    const response = await api.post('/ai/chatbot/widgets', data);
    return response.data;
  },

  updateWidget: async (id, data) => {
    const response = await api.put(`/ai/chatbot/widgets/${id}`, data);
    return response.data;
  },

  deleteWidget: async (id) => {
    const response = await api.delete(`/ai/chatbot/widgets/${id}`);
    return response.data;
  },

  // ── Unified Chatbot (Studio) ────────────────────────────────────────

  // List all chatbots
  listChatbots: async () => {
    const response = await api.get('/ai/chatbot/studio/chatbots');
    return response.data;
  },

  // Create a new chatbot
  createChatbot: async (data) => {
    const response = await api.post('/ai/chatbot/studio/chatbots', data);
    return response.data;
  },

  // Get chatbot details
  getChatbot: async (id) => {
    const response = await api.get(`/ai/chatbot/studio/chatbots/${id}`);
    return response.data;
  },

  // Update chatbot
  updateChatbot: async (id, data) => {
    const response = await api.put(`/ai/chatbot/studio/chatbots/${id}`, data);
    return response.data;
  },

  // Delete chatbot
  deleteChatbot: async (id) => {
    const response = await api.delete(`/ai/chatbot/studio/chatbots/${id}`);
    return response.data;
  },

  // Chat with chatbot (returns AI response)
  chatWithChatbot: async (chatbotId, messages) => {
    const response = await api.post(`/ai/chatbot/studio/chatbots/${chatbotId}/chat`, { messages });
    return response.data;
  },

  // Chat sessions
  getChatbotSessions: async (chatbotId) => {
    const response = await api.get(`/ai/chatbot/studio/chatbots/${chatbotId}/sessions`);
    return response.data;
  },

  getChatbotSessionMessages: async (chatbotId, sessionId) => {
    const response = await api.get(`/ai/chatbot/studio/chatbots/${chatbotId}/sessions/${sessionId}/messages`);
    return response.data;
  },

  deleteChatbotSession: async (chatbotId, sessionId) => {
    const response = await api.delete(`/ai/chatbot/studio/chatbots/${chatbotId}/sessions/${sessionId}`);
    return response.data;
  },

  // ── Unified Inbox ────────────────────────────────────────────────

  getConversations: async ({ channel, status, search, limit = 20, offset = 0 } = {}) => {
    const response = await api.get('/ai/chatbot/inbox/conversations', {
      params: { channel, status, search, limit, offset },
    });
    return response.data;
  },

  getConversation: async (id, type = 'channel') => {
    const response = await api.get(`/ai/chatbot/inbox/conversations/${id}`, {
      params: { type },
    });
    return response.data;
  },

  getMessages: async (id, type = 'channel', { limit = 50, before } = {}) => {
    const response = await api.get(`/ai/chatbot/inbox/conversations/${id}/messages`, {
      params: { type, limit, before },
    });
    return response.data;
  },

  markAsRead: async (id, type = 'channel') => {
    const response = await api.post(`/ai/chatbot/inbox/conversations/${id}/read`, { type });
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get('/ai/chatbot/inbox/unread-count');
    return response.data;
  },

  sendMessage: async (id, { type = 'channel', content, attachments } = {}) => {
    const response = await api.post(`/ai/chatbot/inbox/conversations/${id}/messages`, {
      type,
      content,
      attachments,
    });
    return response.data;
  },

  // ── Outbox ───────────────────────────────────────────────────────

  getOutboxMessages: async ({ channel, search, startDate, endDate, limit = 20, offset = 0 } = {}) => {
    const response = await api.get('/ai/chatbot/inbox/outbox', {
      params: { channel, search, startDate, endDate, limit, offset },
    });
    return response.data;
  },

  getOutboxMessage: async (id) => {
    const response = await api.get(`/ai/chatbot/inbox/outbox/${id}`);
    return response.data;
  },
};

export default chatbotApi;

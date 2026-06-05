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
};

export default chatbotApiService;

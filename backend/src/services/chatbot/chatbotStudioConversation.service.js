import chatbotStudioConversationRepository from '../../repositories/chatbot/chatbotStudioConversation.repository.js';
import { v4 as uuidv4 } from 'uuid';

class ChatbotStudioConversationService {
  async createOrGetConversation({ userId, chatbotId }) {
    const sessionId = uuidv4();
    return await chatbotStudioConversationRepository.createOrGetConversation({
      userId,
      chatbotId,
      sessionId,
    });
  }

  async getConversations({ userId, chatbotId, limit, offset, status }) {
    return await chatbotStudioConversationRepository.getConversationsByUser(userId, chatbotId, {
      limit,
      offset,
      status,
    });
  }

  async getConversation({ userId, conversationId }) {
    const conversation = await chatbotStudioConversationRepository.getConversationById(userId, conversationId);
    if (!conversation) {
      throw new Error('Không tìm thấy cuộc hội thoại');
    }
    return conversation;
  }

  async getMessages({ userId, conversationId, limit, offset }) {
    const conversation = await chatbotStudioConversationRepository.getConversationById(userId, conversationId);
    if (!conversation) {
      throw new Error('Không tìm thấy cuộc hội thoại');
    }
    return await chatbotStudioConversationRepository.getMessagesByConversation(conversationId, {
      limit,
      offset,
    });
  }

  async addMessage({ userId, conversationId, role, content, messageType, aiModel, aiTokensUsed, aiLatencyMs, attachments, metadata }) {
    // Verify conversation belongs to user
    const conversation = await chatbotStudioConversationRepository.getConversationById(userId, conversationId);
    if (!conversation) {
      throw new Error('Không tìm thấy cuộc hội thoại');
    }

    // Create message
    const message = await chatbotStudioConversationRepository.createMessage({
      conversationId,
      role,
      content,
      messageType,
      aiModel,
      aiTokensUsed,
      aiLatencyMs,
      attachments,
      metadata,
    });

    // Update conversation
    const title = conversation.title === 'Cuộc trò chuyện mới' && role === 'user'
      ? content.substring(0, 50) + (content.length > 50 ? '...' : '')
      : conversation.title;

    await chatbotStudioConversationRepository.updateConversation(conversationId, {
      title,
      lastMessageAt: new Date(),
      incrementMessageCount: true,
    });

    return message;
  }

  async deleteConversation({ userId, conversationId }) {
    const deleted = await chatbotStudioConversationRepository.deleteConversation(userId, conversationId);
    if (!deleted) {
      throw new Error('Không tìm thấy cuộc hội thoại');
    }
    return true;
  }

  async clearConversation({ userId, conversationId }) {
    const conversation = await chatbotStudioConversationRepository.getConversationById(userId, conversationId);
    if (!conversation) {
      throw new Error('Không tìm thấy cuộc hội thoại');
    }
    await chatbotStudioConversationRepository.deleteMessagesByConversation(conversationId);
    await chatbotStudioConversationRepository.updateConversation(conversationId, {
      title: 'Cuộc trò chuyện mới',
      message_count: 0,
    });
    return true;
  }
}

export default new ChatbotStudioConversationService();

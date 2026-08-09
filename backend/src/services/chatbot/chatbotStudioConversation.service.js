import chatbotStudioConversationRepository from '../../repositories/chatbot/chatbotStudioConversation.repository.js';
import chatAttachmentService from './chatAttachment.service.js';
import { v4 as uuidv4 } from 'uuid';

function parseAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

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
    const messages = await chatbotStudioConversationRepository.getMessagesByConversation(conversationId, {
      limit,
      offset,
    });

    const bind = { chatbotId: conversation.id_chatbot, uid: userId };
    return messages.map((msg) => {
      const stored = parseAttachments(msg.attachments);
      return {
        ...msg,
        attachments: chatAttachmentService.presentAttachmentsForClient(stored, bind),
      };
    });
  }

  async addMessage({ userId, conversationId, role, content, messageType, aiModel, aiTokensUsed, aiLatencyMs, attachments, metadata }) {
    // Verify conversation belongs to user
    const conversation = await chatbotStudioConversationRepository.getConversationById(userId, conversationId);
    if (!conversation) {
      throw new Error('Không tìm thấy cuộc hội thoại');
    }

    const bind = { chatbotId: conversation.id_chatbot, uid: userId };
    let storedAttachments = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      storedAttachments = chatAttachmentService.enrichAttachmentsForStorage(attachments, bind);
    }

    // Create message (DB keeps key, not ref)
    const message = await chatbotStudioConversationRepository.createMessage({
      conversationId,
      role,
      content,
      messageType,
      aiModel,
      aiTokensUsed,
      aiLatencyMs,
      attachments: storedAttachments,
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

    // Return client shape (fresh ref, no key)
    return {
      ...message,
      attachments: chatAttachmentService.presentAttachmentsForClient(
        parseAttachments(message.attachments?.length ? message.attachments : storedAttachments),
        bind
      ),
    };
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

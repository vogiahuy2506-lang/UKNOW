import unifiedInboxRepository from '../../repositories/ai/unifiedInbox.repository.js';
import zaloOAAdapter from './channelAdapters/zaloOA.adapter.js';
import facebookAdapter from './channelAdapters/facebook.adapter.js';
import zaloPersonalAdapter from './channelAdapters/zaloPersonal.adapter.js';

class UnifiedInboxService {
  /**
   * Get all conversations with pagination and filters
   */
  async getConversations(userId, filters = {}) {
    const [conversations, total, unreadByChannel] = await Promise.all([
      unifiedInboxRepository.getConversations(userId, filters),
      unifiedInboxRepository.getConversationsCount(userId, filters),
      unifiedInboxRepository.getUnreadCountByChannel(userId),
    ]);

    // Add channel info and format
    const formattedConversations = conversations.map(conv => ({
      id: conv.id,
      type: conv.conversation_type,
      channel: conv.channel,
      channelDisplayName: conv.channel_display_name,
      externalId: conv.external_id,
      visitorName: conv.visitor_name,
      visitorInfo: conv.visitor_info,
      lastMessage: conv.last_message,
      unreadCount: parseInt(conv.unread_count || 0),
      startedAt: conv.started_at,
      lastMessageAt: conv.last_message_at_override || conv.last_message_at,
      status: conv.status,
    }));

    // Build unread summary
    const unreadSummary = {};
    unreadByChannel.forEach(item => {
      if (item.unread > 0) {
        unreadSummary[item.channel] = parseInt(item.unread);
      }
    });

    return {
      conversations: formattedConversations,
      total,
      unreadByChannel: unreadSummary,
      page: Math.floor((filters.offset || 0) / (filters.limit || 20)) + 1,
      pageSize: filters.limit || 20,
    };
  }

  /**
   * Get single conversation details
   */
  async getConversation(userId, conversationId, conversationType) {
    const conversation = await unifiedInboxRepository.getConversationById(
      userId,
      parseInt(conversationId),
      conversationType
    );

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    return {
      id: conversation.id,
      type: conversationType,
      channel: conversation.channel,
      channelDisplayName: conversation.channel_display_name,
      externalId: conversation.external_id,
      visitorName: conversation.visitor_name,
      visitorInfo: conversation.visitor_info,
      startedAt: conversation.started_at,
      lastMessageAt: conversation.last_message_at,
      status: conversation.status,
    };
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(userId, conversationId, conversationType, options = {}) {
    // Verify conversation belongs to user
    const conversation = await unifiedInboxRepository.getConversationById(
      userId,
      parseInt(conversationId),
      conversationType
    );

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const messages = await unifiedInboxRepository.getMessages(
      parseInt(conversationId),
      conversationType,
      options
    );

    return messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      attachments: msg.attachments || [],
      createdAt: msg.created_at,
      isRead: msg.is_read || false,
    }));
  }

  /**
   * Mark conversation as read
   */
  async markAsRead(userId, conversationId, conversationType) {
    // Verify conversation belongs to user
    const conversation = await unifiedInboxRepository.getConversationById(
      userId,
      parseInt(conversationId),
      conversationType
    );

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    await unifiedInboxRepository.markAsRead(parseInt(conversationId), conversationType);
    return { success: true };
  }

  /**
   * Get total unread count
   */
  async getUnreadCount(userId) {
    const total = await unifiedInboxRepository.getUnreadCount(userId);
    const byChannel = await unifiedInboxRepository.getUnreadCountByChannel(userId);

    const summary = {};
    let maxUnread = 0;
    let topChannel = null;

    byChannel.forEach(item => {
      if (item.unread > 0) {
        summary[item.channel] = parseInt(item.unread);
        if (item.unread > maxUnread) {
          maxUnread = item.unread;
          topChannel = item.channel;
        }
      }
    });

    return {
      total,
      byChannel: summary,
      topChannel,
    };
  }

  /**
   * Send a message as agent
   */
  async sendMessage(userId, conversationId, conversationType, content, attachments = []) {
    if (!content?.trim()) {
      throw new Error('Message content is required');
    }

    // Verify conversation belongs to user
    const conversation = await unifiedInboxRepository.getConversationById(
      userId,
      parseInt(conversationId),
      conversationType
    );

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Get channel ID for channel conversations
    let channelId = null;
    if (conversationType === 'channel') {
      channelId = conversation.id_channel;
    }

    // Save message to database
    await unifiedInboxRepository.sendMessage(
      parseInt(conversationId),
      userId,
      conversationType,
      channelId,
      { role: 'agent', content: content.trim(), attachments }
    );

    // Send via channel adapter
    try {
      const adapter = this._getChannelAdapter(conversation.channel);
      if (adapter?.sendReply) {
        const params = {
          conversationId: conversation.external_id,
          message: content.trim(),
          attachments,
        };
        
        if (conversationType === 'channel') {
          params.channelId = channelId;
        }
        
        await adapter.sendReply(params);
      }
    } catch (sendError) {
      console.warn('[UnifiedInbox] Failed to send via channel adapter:', sendError.message);
      // Message is still saved, will need manual retry
    }

    return { success: true };
  }

  /**
   * Get channel adapter by channel type
   */
  _getChannelAdapter(channel) {
    const adapters = {
      zalo_oa: zaloOAAdapter,
      facebook: facebookAdapter,
      zalo_personal: zaloPersonalAdapter,
    };
    return adapters[channel];
  }

  /**
   * Get all sent messages (outbox) for a user
   */
  async getOutboxMessages(userId, filters = {}) {
    const [messages, total, statsByChannel] = await Promise.all([
      unifiedInboxRepository.getOutboxMessages(userId, filters),
      unifiedInboxRepository.getOutboxMessagesCount(userId, filters),
      unifiedInboxRepository.getOutboxStatsByChannel(userId),
    ]);

    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      conversationId: msg.id_conversation,
      conversationType: msg.conversation_type,
      channel: msg.channel,
      channelDisplayName: msg.channel_display_name,
      visitorName: msg.visitor_name || 'Khách vãng lai',
      visitorInfo: msg.visitor_info,
      externalId: msg.external_id,
      conversationStatus: msg.conversation_status,
      content: msg.content,
      attachments: msg.attachments || [],
      sentAt: msg.created_at,
      isRead: msg.is_read || false,
      readAt: msg.read_at,
      unreadCount: parseInt(msg.unread_count || 0),
      lastReply: msg.last_reply,
    }));

    const statsSummary = {};
    statsByChannel.forEach(item => {
      if (item.total_sent > 0) {
        statsSummary[item.channel] = {
          totalSent: parseInt(item.total_sent),
          totalRead: parseInt(item.total_read),
          readRate: item.total_sent > 0
            ? Math.round((item.total_read / item.total_sent) * 100)
            : 0,
        };
      }
    });

    return {
      messages: formattedMessages,
      total,
      statsByChannel: statsSummary,
      page: Math.floor((filters.offset || 0) / (filters.limit || 20)) + 1,
      pageSize: filters.limit || 20,
    };
  }

  /**
   * Get a single sent message detail
   */
  async getOutboxMessage(userId, messageId) {
    const message = await unifiedInboxRepository.getOutboxMessageById(userId, parseInt(messageId));

    if (!message) {
      throw new Error('Message not found');
    }

    return {
      id: message.id,
      conversationId: message.id_conversation,
      conversationType: message.conversation_type,
      channel: message.channel,
      channelDisplayName: message.channel_display_name,
      visitorName: message.visitor_name || 'Khách vãng lai',
      visitorInfo: message.visitor_info,
      externalId: message.external_id,
      conversationStatus: message.conversation_status,
      content: message.content,
      attachments: message.attachments || [],
      sentAt: message.created_at,
      isRead: message.is_read || false,
      readAt: message.read_at,
      lastReply: message.last_reply,
    };
  }
}

export default new UnifiedInboxService();

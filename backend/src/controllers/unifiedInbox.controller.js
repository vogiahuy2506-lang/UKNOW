import unifiedInboxService from '../services/chatbot/unifiedInbox.service.js';

function normalizeInboxQueryFilters(query = {}) {
  const rawStatus = String(query.status || '').trim().toLowerCase();
  const status = rawStatus === 'all' || !rawStatus
    ? undefined
    : (rawStatus === 'active' || rawStatus === 'closed' ? rawStatus : undefined);

  const rawDate = String(query.date || '').trim().toLowerCase();
  const date = rawDate === 'all' || !rawDate
    ? undefined
    : (['today', 'week', 'month'].includes(rawDate) ? rawDate : undefined);

  return {
    channel: query.channel || undefined,
    status,
    date,
    search: query.search || undefined,
    limit: parseInt(query.limit, 10) || 20,
    offset: parseInt(query.offset, 10) || 0,
    zaloAccountId: query.zaloAccountId || undefined,
  };
}

class UnifiedInboxController {
  /**
   * Get all conversations
   * GET /api/ai/chatbot/inbox/conversations
   */
  async getConversations(req, res) {
    try {
      const result = await unifiedInboxService.getConversations(req.user.id, normalizeInboxQueryFilters(req.query));

      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      console.error('[UnifiedInbox] Get conversations error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Get single conversation
   * GET /api/ai/chatbot/inbox/conversations/:id
   */
  async getConversation(req, res) {
    try {
      const { id } = req.params;
      const { type = 'channel' } = req.query;

      if (!id) {
        return res.status(400).json({ success: false, message: 'Conversation ID is required' });
      }

      const conversation = await unifiedInboxService.getConversation(req.user.id, id, type);

      return res.json({
        success: true,
        data: conversation,
      });
    } catch (err) {
      console.error('[UnifiedInbox] Get conversation error:', err);
      if (err.message === 'Conversation not found') {
        return res.status(404).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Get messages for a conversation
   * GET /api/ai/chatbot/inbox/conversations/:id/messages
   */
  async getMessages(req, res) {
    try {
      const { id } = req.params;
      const { type = 'channel', limit = 50, before } = req.query;

      if (!id) {
        return res.status(400).json({ success: false, message: 'Conversation ID is required' });
      }

      const messages = await unifiedInboxService.getMessages(req.user.id, id, type, {
        limit: parseInt(limit),
        beforeId: before ? parseInt(before) : null,
      });

      return res.json({
        success: true,
        data: messages,
      });
    } catch (err) {
      console.error('[UnifiedInbox] Get messages error:', err);
      if (err.message === 'Conversation not found') {
        return res.status(404).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Mark conversation as read
   * POST /api/ai/chatbot/inbox/conversations/:id/read
   */
  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const { type = 'channel' } = req.body;

      if (!id) {
        return res.status(400).json({ success: false, message: 'Conversation ID is required' });
      }

      await unifiedInboxService.markAsRead(req.user.id, id, type);

      return res.json({
        success: true,
        message: 'Conversation marked as read',
      });
    } catch (err) {
      console.error('[UnifiedInbox] Mark as read error:', err);
      if (err.message === 'Conversation not found') {
        return res.status(404).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Get unread count
   * GET /api/ai/chatbot/inbox/unread-count
   */
  async getUnreadCount(req, res) {
    try {
      const counts = await unifiedInboxService.getUnreadCount(req.user.id);

      return res.json({
        success: true,
        data: counts,
      });
    } catch (err) {
      console.error('[UnifiedInbox] Get unread count error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Send a message as agent
   * POST /api/ai/chatbot/inbox/conversations/:id/messages
   */
  async sendMessage(req, res) {
    try {
      const { id } = req.params;
      const { type = 'channel', content, attachments } = req.body;

      if (!id) {
        return res.status(400).json({ success: false, message: 'Conversation ID is required' });
      }

      if (!content?.trim()) {
        return res.status(400).json({ success: false, message: 'Message content is required' });
      }

      await unifiedInboxService.sendMessage(req.user.id, id, type, content, attachments || []);

      return res.json({
        success: true,
        message: 'Message sent',
      });
    } catch (err) {
      console.error('[UnifiedInbox] Send message error:', err);
      if (err.message === 'Conversation not found') {
        return res.status(404).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Get all sent messages (outbox)
   * GET /api/ai/chatbot/inbox/outbox
   */
  async getOutboxMessages(req, res) {
    try {
      const { channel, search, startDate, endDate, limit = 20, offset = 0 } = req.query;

      const result = await unifiedInboxService.getOutboxMessages(req.user.id, {
        channel,
        search,
        startDate,
        endDate,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      console.error('[UnifiedInbox] Get outbox messages error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Get single outbox message detail
   * GET /api/ai/chatbot/inbox/outbox/:id
   */
  async getOutboxMessage(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ success: false, message: 'Message ID is required' });
      }

      const message = await unifiedInboxService.getOutboxMessage(req.user.id, id);

      return res.json({
        success: true,
        data: message,
      });
    } catch (err) {
      console.error('[UnifiedInbox] Get outbox message error:', err);
      if (err.message === 'Message not found') {
        return res.status(404).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Delete a conversation
   * DELETE /api/ai/chatbot/inbox/conversations/:id
   */
  async deleteConversation(req, res) {
    try {
      const { id } = req.params;
      const { type = 'zalo_personal' } = req.query;

      if (!id) {
        return res.status(400).json({ success: false, message: 'Conversation ID is required' });
      }

      await unifiedInboxService.deleteConversation(req.user.id, id, type);

      return res.json({
        success: true,
        message: 'Conversation deleted',
      });
    } catch (err) {
      console.error('[UnifiedInbox] Delete conversation error:', err);
      if (err.message === 'Conversation not found') {
        return res.status(404).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

export default new UnifiedInboxController();

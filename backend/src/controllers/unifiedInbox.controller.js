import unifiedInboxService from '../services/chatbot/unifiedInbox.service.js';
import {
  CHAT_ATTACHMENT_SOURCES,
  persistChatBlob,
} from '../services/chatbot/chatAttachment.service.js';
import { checkSendQuota } from '../utils/userSendLimit.util.js';

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
   * Upload an attachment for inbox outbound (no chatbotId / no signed ref).
   * POST /api/ai/chatbot/inbox/attachments
   */
  async uploadInboxAttachment(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Không có file được tải lên' });
      }

      const stored = await persistChatBlob({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        ownerUserId: req.user.id,
        source: CHAT_ATTACHMENT_SOURCES.INBOX_OUTBOUND,
      });

      const { _key, ...clientPayload } = stored;
      return res.status(201).json({ success: true, data: clientPayload });
    } catch (err) {
      console.error('[UnifiedInbox] Upload attachment error:', err);
      return res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Không thể tải file lên',
      });
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

      const hasFiles = Array.isArray(attachments) && attachments.length > 0;
      if (!content?.trim() && !hasFiles) {
        return res.status(400).json({
          success: false,
          message: 'Cần nội dung hoặc tệp đính kèm',
        });
      }

      if (String(type) === 'zalo_personal') {
        const quota = await checkSendQuota({
          userId: req.user.id,
          channel: 'zalo',
          roleCode: req.user.role,
          ownerContextId: req.user.activeContext?.type === 'employee'
            ? req.user.activeContext.ownerId
            : null,
        });
        if (!quota.allowed) {
          return res.status(403).json({
            success: false,
            code: 'RESOURCE_LIMIT_EXCEEDED',
            resource: 'zalo_send',
            upgradeRequired: true,
            resetAt: quota.resetAt,
            message: quota.message
              || 'Đã đạt giới hạn gửi tin Zalo của gói dịch vụ. Vui lòng nâng cấp gói để tiếp tục.',
          });
        }
      }

      const result = await unifiedInboxService.sendMessage(
        req.user.id,
        id,
        type,
        content,
        attachments || [],
        {
          ownerContextId: req.user.activeContext?.type === 'employee'
            ? req.user.activeContext.ownerId
            : null,
        }
      );

      return res.json({
        success: true,
        message: 'Message sent',
        messageId: result.messageId,
        sendStatus: result.sendStatus,
        error: result.error,
        aiPaused: result.aiPaused === true,
        aiPausedAt: result.aiPausedAt ?? null,
        aiResumeAt: result.aiResumeAt ?? null,
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
   * Retry a failed outbound agent message.
   * POST /api/ai/chatbot/inbox/messages/:messageId/retry
   * body: { type: 'zalo_personal' | 'channel' }
   * Không gọi checkSendQuota — tin đã tính hạn mức lúc lưu.
   */
  async retryMessage(req, res) {
    try {
      const { messageId } = req.params;
      const { type } = req.body || {};
      if (!messageId) {
        return res.status(400).json({ success: false, message: 'Message ID is required' });
      }
      if (!type || !['zalo_personal', 'channel'].includes(String(type))) {
        return res.status(400).json({
          success: false,
          message: 'type must be zalo_personal or channel',
          code: 'INVALID_TYPE',
        });
      }

      const result = await unifiedInboxService.retryMessage(req.user.id, messageId, type);
      return res.json({
        success: true,
        messageId: result.messageId,
        sendStatus: result.sendStatus,
        error: result.error,
        metadata: result.metadata,
      });
    } catch (err) {
      console.error('[UnifiedInbox] Retry message error:', err);
      const status = err.status || (err.message === 'Message not found' || err.message === 'Conversation not found'
        ? 404
        : 500);
      return res.status(status).json({
        success: false,
        message: err.message,
        code: err.code,
      });
    }
  }

  /**
   * Pause / resume AI auto-reply for a conversation (handoff).
   * POST /api/ai/chatbot/inbox/conversations/:id/ai-pause
   * body: { type, paused }
   */
  async setAiPaused(req, res) {
    try {
      const { id } = req.params;
      const { type = 'zalo_personal', paused } = req.body;
      if (typeof paused !== 'boolean') {
        return res.status(400).json({ success: false, message: 'paused (boolean) is required' });
      }
      const result = await unifiedInboxService.setConversationAiPaused(req.user.id, id, type, paused);
      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('[UnifiedInbox] setAiPaused error:', err);
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

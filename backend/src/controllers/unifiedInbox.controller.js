import unifiedInboxService from '../services/chatbot/unifiedInbox.service.js';
import {
  CHAT_ATTACHMENT_SOURCES,
  persistChatBlob,
} from '../services/chatbot/chatAttachment.service.js';
import { checkSendQuota } from '../utils/userSendLimit.util.js';
import { resolveWorkspaceOwnerId } from '../services/storage/storageQuota.service.js';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  logWorkspace,
} from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';
import { resolveRequestIdempotencyKey } from '../services/quota/sendQuotaKey.service.js';
import { issueSseTicket } from '../services/sseTicket.service.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';
import {
  getAccessibleChannelScope,
  getAccessibleZaloAccountIds,
  isChannelAccountNotAssignedError,
  isZaloAccountNotAssignedError,
} from '../services/user/memberChannelAccess.service.js';

/**
 * `type` của hội thoại quyết định BẢNG nào được kiểm quyền và bảng nào được ghi. Các hàm repository không
 * ánh xạ giá trị lạ giống nhau (getConversationById: lạ → webchat; setAiPaused: lạ → channel) nên một `type`
 * tự chế cho phép kiểm quyền trên hội thoại web của mình rồi ghi sang hội thoại Zalo OA của khách khác cùng số
 * id (RA_SOAT_BAT_TAT_AI_2026-09-28 mục 1). Chặn ngay cửa: chỉ 3 giá trị FE thật sự gửi.
 */
const CONVERSATION_TYPES = new Set(['channel', 'zalo_personal', 'webchat']);
const INVALID_CONVERSATION_TYPE_BODY = {
  success: false,
  message: 'type phải là channel, zalo_personal hoặc webchat',
  code: 'INVALID_CONVERSATION_TYPE',
};

/**
 * Phạm vi tài khoản Zalo cá nhân của người thao tác (PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN G2): `null` = chủ / super
 * admin thấy hết; mảng = nhân viên, chỉ các tài khoản được giao (lỗi đọc bảng giao → [] = không thấy gì). Mọi handler
 * Hộp thư đụng tới hội thoại / tin Zalo cá nhân phải truyền giá trị này xuống service.
 */
async function resolveZaloScope(req) {
  return getAccessibleZaloAccountIds(getWorkspaceContext(req.user));
}

/**
 * Phạm vi tài khoản Telegram / WhatsApp (Baileys) của người thao tác (PLAN_GIAO_TK_TG_WA PR-H3): `{ telegram, whatsapp_baileys }`,
 * mỗi kênh `null` = chủ / super admin thấy hết, mảng = nhân viên chỉ các tài khoản được giao (lỗi đọc → [] = không thấy gì).
 * Truyền xuống service cùng `accessibleZaloAccountIds`; THIẾU ở bất kỳ tầng nào = không thấy gì (hỏng thì chặn).
 */
async function resolveChannelScope(req) {
  return getAccessibleChannelScope(getWorkspaceContext(req.user));
}

/**
 * Nhân viên đụng vào hội thoại / tin của tài khoản Zalo chưa được giao → 403 `ZALO_ACCOUNT_NOT_ASSIGNED`. PHẢI đứng trước
 * các nhánh `status === 403` khác (sendMessage / retryMessage coi 403 là hết hạn mức gói và đòi nâng cấp).
 * @returns {boolean} true = đã trả lời, handler phải dừng
 */
function respondIfZaloNotAssigned(res, err) {
  // H3: cùng cổng cho Telegram / WhatsApp chưa giao (`CHANNEL_ACCOUNT_NOT_ASSIGNED`).
  if (!isZaloAccountNotAssignedError(err) && !isChannelAccountNotAssignedError(err)) return false;
  res.status(403).json({ success: false, message: err.message, code: err.code });
  return true;
}

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
    // Trần 100: mỗi bảng lấy `limit + offset` hội thoại mới nhất trước khi cắt trang (H-06).
    limit: Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100),
    offset: Math.max(parseInt(query.offset, 10) || 0, 0),
    zaloAccountId: query.zaloAccountId || undefined,
    // Chip lọc phía server (H-13, C1): Cá nhân / Nhóm, và chỉ hội thoại có tin chưa đọc.
    kind: ['personal', 'group'].includes(String(query.kind || '').trim().toLowerCase())
      ? String(query.kind).trim().toLowerCase()
      : undefined,
    unreadOnly: ['1', 'true'].includes(String(query.unreadOnly || '').trim().toLowerCase()),
  };
}

class UnifiedInboxController {
  /**
   * Get all conversations
   * GET /api/ai/chatbot/inbox/conversations
   */
  async getConversations(req, res) {
    try {
      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);
      const result = await unifiedInboxService.getConversations(resolveWorkspaceOwnerId(req.user), {
        ...normalizeInboxQueryFilters(req.query),
        accessibleZaloAccountIds,
        accessibleChannelRefs,
      });

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
   * Kênh user có trong Hộp thư (có kết nối/tài khoản hoặc đã có hội thoại)
   * GET /api/ai/chatbot/inbox/channels
   */
  async getAvailableChannels(req, res) {
    try {
      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);
      const channels = await unifiedInboxService.getAvailableChannels(resolveWorkspaceOwnerId(req.user), { accessibleZaloAccountIds, accessibleChannelRefs });
      return res.json({ success: true, data: { channels } });
    } catch (err) {
      console.error('[UnifiedInbox] Get available channels error:', err);
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
      if (!CONVERSATION_TYPES.has(type)) {
        return res.status(400).json(INVALID_CONVERSATION_TYPE_BODY);
      }

      if (!id) {
        return res.status(400).json({ success: false, message: 'Conversation ID is required' });
      }

      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);
      const conversation = await unifiedInboxService.getConversation(resolveWorkspaceOwnerId(req.user), id, type, { accessibleZaloAccountIds, accessibleChannelRefs });

      return res.json({
        success: true,
        data: conversation,
      });
    } catch (err) {
      if (respondIfZaloNotAssigned(res, err)) return;
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
      if (!CONVERSATION_TYPES.has(type)) {
        return res.status(400).json(INVALID_CONVERSATION_TYPE_BODY);
      }

      if (!id) {
        return res.status(400).json({ success: false, message: 'Conversation ID is required' });
      }

      const beforeId = Number.parseInt(before, 10);
      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);
      const { messages, hasMore } = await unifiedInboxService.getMessages(resolveWorkspaceOwnerId(req.user), id, type, {
        limit: Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 200),
        beforeId: Number.isInteger(beforeId) && beforeId > 0 ? beforeId : null,
        accessibleZaloAccountIds,
        accessibleChannelRefs,
      });

      return res.json({
        success: true,
        data: messages,
        // true khi còn tin cũ hơn trang này — FE hiện nút "Tải tin cũ hơn" (H-01).
        hasMore,
      });
    } catch (err) {
      if (respondIfZaloNotAssigned(res, err)) return;
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
      const { type = 'channel', fromMessageId } = req.body;
      if (!CONVERSATION_TYPES.has(type)) {
        return res.status(400).json(INVALID_CONVERSATION_TYPE_BODY);
      }

      if (!id) {
        return res.status(400).json({ success: false, message: 'Conversation ID is required' });
      }

      // fromMessageId (tuỳ chọn): chỉ đánh dấu đọc phần khung đọc đã tải. Thiếu → đánh dấu hết (client cũ).
      const fromId = Number.parseInt(fromMessageId, 10);
      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);
      const result = await unifiedInboxService.markAsRead(resolveWorkspaceOwnerId(req.user), id, type, {
        fromMessageId: Number.isInteger(fromId) && fromId > 0 ? fromId : null,
        accessibleZaloAccountIds,
        accessibleChannelRefs,
      });

      return res.json({
        success: true,
        message: 'Conversation marked as read',
        data: { remainingUnread: result.remainingUnread },
      });
    } catch (err) {
      if (respondIfZaloNotAssigned(res, err)) return;
      console.error('[UnifiedInbox] Mark as read error:', err);
      if (err.message === 'Conversation not found') {
        return res.status(404).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Đánh dấu tất cả đã đọc theo bộ lọc đang xem (kênh, tài khoản Zalo, tìm kiếm, ngày, Cá nhân/Nhóm).
   * POST /api/ai/chatbot/inbox/read-all
   */
  async markAllAsRead(req, res) {
    try {
      // Cùng chuẩn hoá với danh sách để "đang xem" và "đánh dấu" là MỘT tập; bộ lọc đọc từ body.
      const filters = normalizeInboxQueryFilters(req.body || {});
      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);
      const result = await unifiedInboxService.markAllAsRead(resolveWorkspaceOwnerId(req.user), {
        channel: filters.channel,
        zaloAccountId: filters.zaloAccountId,
        search: filters.search,
        status: filters.status,
        date: filters.date,
        kind: filters.kind,
        accessibleZaloAccountIds,
        accessibleChannelRefs,
      });
      return res.json({ success: true, data: { updatedMessages: result.updatedMessages } });
    } catch (err) {
      console.error('[UnifiedInbox] Mark all as read error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Get unread count
   * GET /api/ai/chatbot/inbox/unread-count
   */
  async getUnreadCount(req, res) {
    try {
      // Cùng phạm vi với danh sách đang xem: tab kênh + tài khoản Zalo (H-03).
      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);
      const counts = await unifiedInboxService.getUnreadCount(resolveWorkspaceOwnerId(req.user), {
        channel: req.query.channel || undefined,
        zaloAccountId: req.query.zaloAccountId || undefined,
        accessibleZaloAccountIds,
        accessibleChannelRefs,
      });

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
   * Cấp vé SSE ngắn hạn, dùng một lần (H-04).
   * POST /api/ai/chatbot/inbox/stream-ticket — Bearer + X-Owner-Context như mọi API; quyền inbox_view.
   * Vé ghi nhận chủ không gian làm việc ở phía server: nhân viên chỉ nhận luồng của chủ mà mình đang ở
   * ngữ cảnh (resolveUserContext vẫn kiểm lại thành viên còn hoạt động lúc nối).
   */
  async createStreamTicket(req, res) {
    try {
      const ownerContextId = req.user.activeContext?.type === 'employee'
        ? req.user.activeContext.ownerId
        : null;
      const { ticket, expiresInMs } = issueSseTicket({ userId: req.user.id, ownerContextId });
      res.set('Cache-Control', 'no-store');
      return res.json({
        success: true,
        data: { ticket, expiresInSeconds: Math.round(expiresInMs / 1000) },
      });
    } catch (err) {
      console.error('[UnifiedInbox] Create stream ticket error:', err);
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
        ownerUserId: resolveWorkspaceOwnerId(req.user),
        actorUserId: req.user.id,
        source: CHAT_ATTACHMENT_SOURCES.INBOX_OUTBOUND,
      });

      const { _key, _storageObjectId, ...clientPayload } = stored;
      await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.MEDIA_UPLOADED, AUDIT_ENTITY_TYPES.MEDIA_OBJECT, _storageObjectId, { source: CHAT_ATTACHMENT_SOURCES.INBOX_OUTBOUND, size: stored.size, mime: stored.mime });
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
      if (!CONVERSATION_TYPES.has(type)) {
        return res.status(400).json(INVALID_CONVERSATION_TYPE_BODY);
      }

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

      const rawKey = req.headers['idempotency-key']
        || req.headers['x-idempotency-key']
        || req.body?.idempotencyKey
        || req.body?.clientKey
        || null;
      const idempotencyKey = resolveRequestIdempotencyKey(rawKey);
      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);

      const result = await unifiedInboxService.sendMessage(
        resolveWorkspaceOwnerId(req.user),
        id,
        type,
        content,
        attachments || [],
        {
          ownerContextId: req.user.activeContext?.type === 'employee'
            ? req.user.activeContext.ownerId
            : null,
          actorUserId: req.user.id,
          roleCode: req.user.role,
          membershipId: req.user.activeContext?.membershipId || null,
          idempotencyKey,
          accessibleZaloAccountIds,
          accessibleChannelRefs,
        }
      );
      await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.INBOX_REPLY_SENT, AUDIT_ENTITY_TYPES.INBOX_MESSAGE, result.messageId, { conversationId: Number(id), conversationType: type, attachmentCount: Array.isArray(attachments) ? attachments.length : 0 });

      return res.json({
        success: true,
        message: 'Message sent',
        messageId: result.messageId,
        sendStatus: result.sendStatus,
        error: result.error,
        aiPaused: result.aiPaused === true,
        aiPausedAt: result.aiPausedAt ?? null,
        aiResumeAt: result.aiResumeAt ?? null,
        isReplay: result.isReplay || false,
      });
    } catch (err) {
      if (respondIfZaloNotAssigned(res, err)) return;
      console.error('[UnifiedInbox] Send message error:', err);
      if (err.status === 403 || err.statusCode === 403 || err.code === 'RESOURCE_LIMIT_EXCEEDED' || err.code === 'SEND_QUOTA_EXCEEDED') {
        return res.status(403).json({
          success: false,
          code: 'RESOURCE_LIMIT_EXCEEDED',
          resource: 'zalo_send',
          upgradeRequired: true,
          resetAt: err.resetAt,
          message: err.message || 'Đã đạt giới hạn gửi tin Zalo của gói dịch vụ. Vui lòng nâng cấp gói để tiếp tục.',
        });
      }
      if (err.status === 409 || err.statusCode === 409 || err.code === 'CONCURRENT_SEND_IN_PROGRESS' || err.code === 'IDEMPOTENCY_KEY_REUSED' || err.code === 'RESERVATION_UNCERTAIN') {
        return res.status(409).json({
          success: false,
          code: err.code || 'IDEMPOTENCY_CONFLICT',
          message: err.message,
        });
      }
      if (err.status === 503 || err.statusCode === 503 || err.code === 'SEND_QUOTA_UNAVAILABLE') {
        return res.status(503).json({
          success: false,
          code: err.code || 'SERVICE_UNAVAILABLE',
          message: err.message,
        });
      }
      if (err.message === 'Conversation not found') {
        return res.status(404).json({ success: false, message: err.message });
      }
      if (err.status === 400 || err.statusCode === 400) {
        return res.status(400).json({ success: false, message: err.message, code: err.code });
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

      const rawKey = req.headers['idempotency-key']
        || req.headers['x-idempotency-key']
        || req.body?.idempotencyKey
        || req.body?.clientKey
        || null;
      const idempotencyKey = resolveRequestIdempotencyKey(rawKey);
      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);

      const result = await unifiedInboxService.retryMessage({
        userId: resolveWorkspaceOwnerId(req.user),
        messageId,
        type,
      }, {
        ownerContextId: req.user.activeContext?.type === 'employee'
          ? req.user.activeContext.ownerId
          : null,
        actorUserId: req.user.id,
        roleCode: req.user.role,
        membershipId: req.user.activeContext?.membershipId || null,
        idempotencyKey,
        accessibleZaloAccountIds,
        accessibleChannelRefs,
      });
      await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.INBOX_REPLY_RETRIED, AUDIT_ENTITY_TYPES.INBOX_MESSAGE, Number(messageId), { conversationType: type, sendStatus: result.sendStatus });
      return res.json({
        success: true,
        messageId: result.messageId,
        sendStatus: result.sendStatus,
        error: result.error,
        metadata: result.metadata,
      });
    } catch (err) {
      if (respondIfZaloNotAssigned(res, err)) return;
      console.error('[UnifiedInbox] Retry message error:', err);
      if (err.status === 403 || err.statusCode === 403 || err.code === 'RESOURCE_LIMIT_EXCEEDED' || err.code === 'SEND_QUOTA_EXCEEDED') {
        return res.status(403).json({
          success: false,
          code: 'RESOURCE_LIMIT_EXCEEDED',
          message: err.message,
        });
      }
      if (err.status === 409 || err.statusCode === 409 || err.code === 'CONCURRENT_SEND_IN_PROGRESS' || err.code === 'IDEMPOTENCY_KEY_REUSED' || err.code === 'RESERVATION_UNCERTAIN') {
        return res.status(409).json({
          success: false,
          code: err.code || 'IDEMPOTENCY_CONFLICT',
          message: err.message,
        });
      }
      if (err.status === 503 || err.statusCode === 503 || err.code === 'SEND_QUOTA_UNAVAILABLE') {
        return res.status(503).json({
          success: false,
          code: err.code || 'SERVICE_UNAVAILABLE',
          message: err.message,
        });
      }
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
      if (!CONVERSATION_TYPES.has(type)) {
        return res.status(400).json(INVALID_CONVERSATION_TYPE_BODY);
      }
      if (typeof paused !== 'boolean') {
        return res.status(400).json({ success: false, message: 'paused (boolean) is required' });
      }
      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);
      const result = await unifiedInboxService.setConversationAiPaused(resolveWorkspaceOwnerId(req.user), id, type, paused, { accessibleZaloAccountIds, accessibleChannelRefs });
      await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.INBOX_AI_PAUSE_UPDATED, AUDIT_ENTITY_TYPES.INBOX_CONVERSATION, Number(id), { conversationType: type, paused });
      return res.json({ success: true, data: result });
    } catch (err) {
      if (respondIfZaloNotAssigned(res, err)) return;
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

      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);
      const result = await unifiedInboxService.getOutboxMessages(resolveWorkspaceOwnerId(req.user), {
        channel,
        search,
        startDate,
        endDate,
        limit: parseInt(limit),
        offset: parseInt(offset),
        accessibleZaloAccountIds,
        accessibleChannelRefs,
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

      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);
      const message = await unifiedInboxService.getOutboxMessage(resolveWorkspaceOwnerId(req.user), id, { accessibleZaloAccountIds, accessibleChannelRefs });

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
      if (!CONVERSATION_TYPES.has(type)) {
        return res.status(400).json(INVALID_CONVERSATION_TYPE_BODY);
      }

      if (!id) {
        return res.status(400).json({ success: false, message: 'Conversation ID is required' });
      }

      const accessibleZaloAccountIds = await resolveZaloScope(req);
      const accessibleChannelRefs = await resolveChannelScope(req);
      await unifiedInboxService.deleteConversation(resolveWorkspaceOwnerId(req.user), id, type, { accessibleZaloAccountIds, accessibleChannelRefs });
      await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.INBOX_CONVERSATION_DELETED, AUDIT_ENTITY_TYPES.INBOX_CONVERSATION, Number(id), { conversationType: type });

      return res.json({
        success: true,
        message: 'Conversation deleted',
      });
    } catch (err) {
      if (respondIfZaloNotAssigned(res, err)) return;
      console.error('[UnifiedInbox] Delete conversation error:', err);
      if (err.message === 'Conversation not found') {
        return res.status(404).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

export default new UnifiedInboxController();

import crypto from 'crypto';
import db from '../../config/database.js';
import unifiedInboxRepository from '../../repositories/ai/unifiedInbox.repository.js';
import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
import chatbotZaloAccountRepository from '../../repositories/chatbot/chatbotZaloAccount.repository.js';
import zaloOAAdapter from './channelAdapters/zaloOA.adapter.js';
import facebookAdapter from './channelAdapters/facebook.adapter.js';
import zaloPersonalAdapter from './channelAdapters/zaloPersonal.adapter.js';
import sseService from '../sse.service.js';
import { formatWebchatDisplayName } from '../../utils/webchatDisplayName.util.js';
import { resolveBillingUserId } from '../../utils/billingCycle.util.js';
import { debitZaloPersonalInboxIfNeeded } from '../payment/topupWallet.service.js';
import {
  isZaloGroupConversation,
  resolveZaloGroupSendId,
} from '../../utils/zaloGroupName.util.js';
import chatAttachmentService from './chatAttachment.service.js';
import { sanitizeOwnedInboxAttachments } from '../../utils/inboxOwnedAttachments.util.js';
import {
  buildAiPausePayload,
  computeAiResumeAt,
  getCachedAutoResumeMinutes,
  normalizeAiPausedAt,
} from '../../utils/aiHandoffResume.util.js';
import {
  reserveSendQuota,
  markSendQuotaSending,
  consumeSendQuota,
  releaseSendQuota,
  markSendQuotaUncertain,
} from '../quota/sendQuotaReservation.service.js';
import {
  buildDirectReservationKey,
  computeRequestFingerprint,
  resolveRequestIdempotencyKey,
} from '../quota/sendQuotaKey.service.js';
import {
  findReservationById,
} from '../../repositories/sendQuota.repository.js';
import { classifyZaloSendError } from '../../utils/zaloSendErrorClassifier.util.js';
import { isZaloPartialDeliveryResult } from '../../utils/zaloDispatchDelivery.util.js';

function presentInboxAttachments(raw) {
  return chatAttachmentService.presentAttachmentsForClient(raw || [], { includeRef: false });
}

class UnifiedInboxService {
  /**
   * Build conversationInfo for Zalo Personal send/retry (group vs 1-1).
   */
  _buildZaloConversationInfo(conversation, owned = null) {
    const visitorInfo = conversation?._parsedVisitorInfo
      || owned?._parsedVisitorInfo
      || (typeof conversation?.visitor_info === 'string'
        ? (() => { try { return JSON.parse(conversation.visitor_info); } catch { return {}; } })()
        : (conversation?.visitor_info || {}));
    const externalId = conversation?.external_id || owned?.external_id || null;
    const info = {
      is_group: conversation?._isGroup === true
        || owned?.is_group === true
        || visitorInfo.is_group === true,
      group_id: visitorInfo.group_id || owned?.group_id || conversation?.group_id || null,
    };
    if (isZaloGroupConversation({ externalId, conversationInfo: info })) {
      info.is_group = true;
      info.group_id = resolveZaloGroupSendId(info.group_id, externalId) || info.group_id;
    }
    return info;
  }
  /**
   * Map id_zalo_setting → is_enabled for a user (single query, no N+1).
   */
  async _loadZaloAccountChatbotEnabledMap(userId) {
    const rows = await chatbotZaloAccountRepository.getAllSettingsForUser(userId);
    const map = new Map();
    // Reverse so newest (created_at DESC in repo) wins for the default fallback
    const reversedRows = [...rows].reverse();
    for (const row of reversedRows) {
      const isEnabled = row.is_enabled === true;
      map.set(Number(row.id_zalo_setting), isEnabled);
      if (row.id_chatbot != null) {
        map.set(`${row.id_zalo_setting}:${row.id_chatbot}`, isEnabled);
      }
    }
    return map;
  }

  /**
   * Resolve chatbotEnabled for one conversation type.
   * zalo_personal: account-level only (missing row = false).
   * Other channels: true for now (no per-account gate change).
   */
  _resolveChatbotEnabled(conversation, zaloEnabledMap) {
    if (conversation.type === 'zalo_personal' || conversation.channel === 'zalo_personal') {
      const settingId = Number(conversation.idZaloSetting || conversation.id_zalo_setting);
      if (!Number.isFinite(settingId) || !settingId) {
        return { enabled: false, reason: 'no_account' };
      }
      const isAccountActive = conversation.channelIsActive === true || conversation.channel_is_active === true;
      if (!isAccountActive) {
        return { enabled: false, reason: 'account_disconnected' };
      }
      
      const chatbotId = conversation.idChatbot || conversation.id_chatbot;
      let enabled;
      if (chatbotId != null && zaloEnabledMap.has(`${settingId}:${chatbotId}`)) {
        enabled = zaloEnabledMap.get(`${settingId}:${chatbotId}`);
      } else {
        enabled = zaloEnabledMap.get(settingId) === true;
      }
      
      return { enabled, reason: enabled ? null : 'chatbot_off' };
    }
    return { enabled: true, reason: null };
  }

  /**
   * Get all conversations with pagination and filters
   */
  async getConversations(userId, filters = {}) {
    console.log('[UnifiedInboxService] getConversations called:', { userId, filters });

    const [conversations, total, unreadByChannel, zaloEnabledMap, autoResumeMinutes] = await Promise.all([
      unifiedInboxRepository.getConversations(userId, filters),
      unifiedInboxRepository.getConversationsCount(userId, filters),
      unifiedInboxRepository.getUnreadCountByChannel(userId),
      this._loadZaloAccountChatbotEnabledMap(userId),
      getCachedAutoResumeMinutes(userId),
    ]);

    const formattedConversations = conversations.map(conv => {
      const aiPaused = conv.aiPaused === true;
      const aiPausedAt = aiPaused ? normalizeAiPausedAt(conv.aiPausedAt) : null;
      return {
        id: conv.id,
        type: conv.type,
        channel: conv.channel,
        channelDisplayName: conv.channelDisplayName,
        externalId: conv.externalId,
        visitorName: conv.visitorName,
        visitorInfo: conv.visitorInfo,
        isGroup: conv.isGroup || false,
        groupId: conv.groupId || null,
        groupName: conv.groupName || null,
        lastMessage: conv.lastMessage,
        unreadCount: parseInt(conv.unreadCount || 0),
        startedAt: conv.startedAt,
        lastMessageAt: conv.lastMessageAt,
        status: conv.status,
        aiPaused,
        aiPausedAt,
        aiResumeAt: computeAiResumeAt({
          aiPaused,
          aiPausedAt,
          autoResumeMinutes,
        }),
        chatbotEnabled: this._resolveChatbotEnabled(conv, zaloEnabledMap).enabled,
        chatbotDisabledReason: this._resolveChatbotEnabled(conv, zaloEnabledMap).reason,
        idZaloSetting: conv.idZaloSetting || null,
        channelIsActive: conv.channelIsActive === true,
      };
    });

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

    // Parse visitor_info for zalo_personal
    let isGroup = false;
    let groupId = null;
    let groupName = null;
    let displayName = conversation.visitor_name;
    
    if (conversationType === 'zalo_personal' && conversation._parsedVisitorInfo) {
      isGroup = conversation._isGroup || false;
      groupId = isGroup ? conversation._parsedVisitorInfo.group_id : null;
      groupName = isGroup ? conversation._parsedVisitorInfo.group_name : null;
    }

    // For webchat: prefer visitor name / first message over "{widget} - {id}"
    if (conversationType === 'webchat') {
      displayName = formatWebchatDisplayName({
        visitorName: conversation.visitor_name,
        channelDisplayName: conversation.channel_display_name,
        conversationId: conversation.id,
      });
    }

    let chatbotRes = { enabled: true, reason: null };
    if (conversationType === 'zalo_personal') {
      const zaloSettingId = conversation.id_zalo_setting;
      if (zaloSettingId) {
        const isAccountActive = conversation.channel_is_active === true;
        if (!isAccountActive) {
          chatbotRes = { enabled: false, reason: 'account_disconnected' };
        } else {
          const accountSettings = await chatbotZaloAccountRepository.getSettings(userId, zaloSettingId);
          const enabled = accountSettings?.is_enabled === true;
          chatbotRes = { enabled, reason: enabled ? null : 'chatbot_off' };
        }
      } else {
        chatbotRes = { enabled: false, reason: 'no_account' };
      }
    }

    const pauseState = await buildAiPausePayload({
      aiPaused: conversation.ai_paused === true,
      aiPausedAt: conversation.ai_paused_at,
      ownerUserId: userId,
    });

    return {
      id: conversation.id,
      type: conversationType,
      channel: conversation.channel,
      channelDisplayName: conversation.channel_display_name,
      externalId: conversation.external_id,
      visitorName: displayName,
      visitorInfo: conversation._parsedVisitorInfo || conversation.visitor_info,
      isGroup,
      groupId,
      groupName,
      startedAt: conversation.started_at,
      lastMessageAt: conversation.last_message_at,
      status: conversation.status,
      ...pauseState,
      chatbotEnabled: chatbotRes.enabled,
      chatbotDisabledReason: chatbotRes.reason,
      idZaloSetting: conversation.id_zalo_setting || null,
      channelIsActive: conversation.channel_is_active === true,
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

    return messages.map(msg => {
      // Parse metadata to extract sender info
      const metadata = msg.metadata || {};
      const senderName = metadata.sender_name || null;
      const senderId = metadata.sender_id || null;
      const isGroupMsg = metadata.is_group === true;
      const groupId = isGroupMsg ? metadata.group_id : null;
      const groupName = isGroupMsg ? metadata.group_name : null;

      return {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        senderName,
        senderId,
        attachments: presentInboxAttachments(msg.attachments),
        metadata: {
          ...metadata,
          isGroup: isGroupMsg,
          groupId,
          groupName,
        },
        createdAt: msg.createdAt,
        isRead: msg.isRead || false,
      };
    });
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
   * @param {object} [options]
   * @param {number|string|null} [options.ownerContextId]
   * @param {number|string|null} [options.actorUserId]
   * @param {number|string|null} [options.membershipId]
   */
  async sendMessage(userId, conversationId, conversationType, content, attachments = [], options = {}) {
    const ownedAttachments = sanitizeOwnedInboxAttachments(attachments, userId);
    if (!content?.trim() && !ownedAttachments.length) {
      throw new Error('Cần nội dung hoặc tệp đính kèm');
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

    // For Zalo Personal, get the zalo_setting.id (accountId) from the conversation
    let zaloAccountId = null;
    if (conversationType === 'zalo_personal') {
      zaloAccountId = conversation.id_zalo_setting;
    }

    const resolvedIdempotencyKey = resolveRequestIdempotencyKey(options.idempotencyKey || options.clientKey || null);
    const messagePayload = {
      role: 'agent',
      content: String(content || '').trim(),
      attachments: ownedAttachments,
      metadata: {
        source: 'manual_inbox',
        actor_user_id: options.actorUserId || userId,
        membership_id: options.membershipId || null,
        idempotency_key: resolvedIdempotencyKey,
      },
    };

    // Zalo Personal: atomic quota reservation + insert message
    let messageId = null;
    let reservation = null;
    if (conversationType === 'zalo_personal') {
      const billingOptions = options.ownerContextId != null && options.ownerContextId !== ''
        ? { ownerContextId: options.ownerContextId }
        : {};
      const billingUserId = await resolveBillingUserId(userId, billingOptions);
      const recipient = conversation.external_id || String(conversationId);
      const idempotencyKey = resolvedIdempotencyKey;

      const reservationKey = buildDirectReservationKey({
        channel: 'zalo',
        billingUserId: billingUserId || userId,
        clientKey: idempotencyKey,
        recipient,
      });

      const requestPayload = {
        conversationId: parseInt(conversationId),
        recipient,
        content: String(content || '').trim(),
        attachments: attachments || [],
      };
      const requestFingerprint = computeRequestFingerprint(requestPayload);

      reservation = await reserveSendQuota({
        userId: options.actorUserId || userId,
        roleCode: options.roleCode || 'user',
        ownerContextId: options.ownerContextId || null,
        membershipId: options.membershipId || null,
        channel: 'zalo',
        quantity: 1,
        reservationKey,
        requestFingerprint,
        requestPayload,
        sourceType: 'inbox',
      }, options);

      if (reservation.mode === 'enforce' || reservation.mode === 'test_enforce') {
        if (reservation.status === 'consumed') {
          return {
            messageId: reservation.responseSnapshot?.messageId || reservation.response_snapshot?.messageId || null,
            conversationId: parseInt(conversationId),
            isReplay: true,
            pauseState: { aiPaused: true, aiPausedAt: null, aiResumeAt: null },
          };
        }
        await markSendQuotaSending({ reservationId: reservation.id }, options);
      }

      try {
        messageId = await unifiedInboxRepository.withTransaction(async (client) => {
          const msgId = await unifiedInboxRepository.insertZaloPersonalAgentMessage(
            client,
            parseInt(conversationId),
            userId,
            {
              ...messagePayload,
              quotaReservationId: reservation?.id || null,
            }
          );
          // Chỉ tự trừ ví ở đây khi KHÔNG enforce: mode enforce/test_enforce đã trừ ví
          // bên trong reserveSendQuota/consumeSendQuota (Tier 3 wallet fallback) rồi —
          // gọi lại sẽ trừ đôi. Ở mode off/shadow, reserveSendQuota không giữ ví nên đây
          // là chỗ duy nhất trừ ví cho lượt gửi vượt hạn mức tháng qua inbox.
          //
          // billingUserId phải lấy từ reservation.legacyDecision, KHÔNG tự resolve lại:
          // với admin bypass (roleCode=admin, không có ownerContextId), reserveSendQuota
          // cố ý trả legacyDecision.billingUserId = null (bypass:true) — tự resolve lại
          // qua resolveBillingUserId() bỏ qua quyết định đó và trừ nhầm ví admin.
          const legacyDecision = reservation?.legacyDecision || reservation?.legacyResult;
          const debitBillingUserId = legacyDecision?.billingUserId || null;
          if (
            reservation
            && reservation.mode !== 'enforce'
            && reservation.mode !== 'test_enforce'
            && debitBillingUserId
            && msgId
          ) {
            await debitZaloPersonalInboxIfNeeded(client, {
              billingUserId: debitBillingUserId,
              messageId: msgId,
            });
          }
          return msgId;
        });
      } catch (persistErr) {
        // Provider CHƯA từng được gọi (adapter nằm sau đoạn này) — an toàn để release,
        // không phải trạng thái mơ hồ. Không release thì reservation mắc kẹt ở 'sending'
        // vĩnh viễn dù chưa hề gửi gì, chặn retry và phải đối soát tay không cần thiết.
        if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
          try {
            await releaseSendQuota({
              reservationId: reservation.id,
              failureCode: 'INBOX_PERSIST_FAILED',
              reason: persistErr.message || 'Failed to persist inbox message before send',
            }, options);
          } catch (releaseErr) {
            console.warn('[UnifiedInbox] releaseSendQuota after persist failure error:', releaseErr.message);
          }
        }
        throw persistErr;
      }
    }

    if (!messageId) {
      messageId = await unifiedInboxRepository.sendMessage(
        parseInt(conversationId),
        userId,
        conversationType,
        channelId,
        messagePayload
      );
    }

    if (ownedAttachments.length > 0) {
      await chatAttachmentService.promoteChatAttachments(ownedAttachments).catch((promoteErr) => {
        console.warn('[UnifiedInbox] promoteChatAttachments failed:', promoteErr.message);
      });
    }

    // Handoff: pause AI for this conversation when owner replies from inbox.
    let pauseState = { aiPaused: true, aiPausedAt: null, aiResumeAt: null };
    try {
      const pausedRow = await unifiedInboxRepository.setAiPaused(
        parseInt(conversationId),
        conversationType,
        true,
        'handoff'
      );
      pauseState = await buildAiPausePayload({
        aiPaused: pausedRow.aiPaused,
        aiPausedAt: pausedRow.aiPausedAt,
        ownerUserId: userId,
      });
    } catch (e) {
      console.warn('[UnifiedInbox] setAiPaused failed:', e.message);
    }

    // Send via channel adapter
    let sendStatus = 'sent';
    let sendError = null;
    // Giữ nguyên object trả về của adapter (không chỉ chuỗi lỗi) để nhánh quota-finalize
    // bên dưới còn phân biệt được "gửi thất bại thật" với "partial" (một phần tin đã tới
    // khách — release ở trường hợp này cho retry gửi lại toàn bộ, khách nhận trùng).
    let lastSendResult = null;
    const canTrackSend = messageId
      && (conversationType === 'zalo_personal' || conversationType === 'channel');

    try {
      const adapter = this._getChannelAdapter(conversation.channel);
      if (adapter?.sendReply) {
        const params = {
          externalId: conversation.external_id,
          message: content,
          attachments: ownedAttachments.length > 0 ? ownedAttachments : attachments,
          userId,
          accountId: zaloAccountId,
          conversationInfo: this._buildZaloConversationInfo(conversation),
          forceReply: true,
          persist: false,
        };
        if (conversationType === 'channel') {
          params.channelId = channelId;
        }

        const result = await adapter.sendReply(params);
        lastSendResult = result;
        if (result && result.success === false) {
          sendStatus = 'failed';
          sendError = result.error || 'Channel send failed';
        } else if (conversationType === 'zalo_personal' && zaloAccountId && messageId) {
          // Durable echo keys: bind Zalo msgId(s) onto the pre-inserted inbox row so
          // later sync ON CONFLICT / isSelf skip does not re-pause after owner resumes AI.
          const msgIds = Array.isArray(result?.msgIds) ? result.msgIds : [];
          const primaryMsgId = result?.msgId ?? msgIds[0] ?? null;
          if (primaryMsgId || msgIds.length > 0) {
            try {
              await unifiedInboxRepository.bindZaloPersonalOutboundMsgIds(messageId, {
                externalId: primaryMsgId,
                msgIds: msgIds.length > 0 ? msgIds : (primaryMsgId ? [primaryMsgId] : []),
              });
            } catch (bindErr) {
              console.warn('[UnifiedInbox] bind outbound msgIds failed:', bindErr.message);
            }
          }
          // Gửi OK chứng tỏ session API còn; inbox handler có thể đã lệch listener sau restore.
          // Gắn lại ngay (không đợi cron 5 phút) để tin bạn bè / app về hộp thư.
          try {
            const { default: zaloPersonalInboxService } = await import('./zaloInbox.service.js');
            await zaloPersonalInboxService.registerAccountListener(zaloAccountId);
          } catch (rebindErr) {
            console.warn('[UnifiedInbox] Re-bind inbox listener after send failed:', rebindErr.message);
          }
        }
      }
    } catch (adapterErr) {
      sendStatus = 'failed';
      sendError = adapterErr.message || 'Lỗi gửi tin qua kênh';
    }

    // Quota finalize & message status sync
    if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
      const optArg = [options];
      if (sendStatus === 'sent') {
        const respSnap = { messageId, conversationId: parseInt(conversationId) };
        try {
          await consumeSendQuota({
            reservationId: reservation.id,
            responseSnapshot: respSnap,
            responsePayload: respSnap,
            persistSource: async () => ({
              sourceKey: `inbox_msg:${messageId}`,
            }),
          }, ...optArg);
        } catch (consumeErr) {
          // Tin đã gửi thật (provider đã trả success) nhưng ghi nhận quota lỗi — KHÔNG
          // được release (sẽ cho phép gửi trùng), đánh dấu uncertain để đối soát tay.
          console.warn('[UnifiedInbox] consumeSendQuota failed after successful send:', consumeErr.message);
          try {
            await markSendQuotaUncertain({
              reservationId: reservation.id,
              failureCode: 'CONSUME_DB_FAILED',
              reason: 'Failed to settle inbox reservation after successful send',
            }, ...optArg);
          } catch (_) {}
        }
      } else {
        const classified = classifyZaloSendError(sendError);
        const failureCode = classified.failureCode || classified.category || 'INBOX_SEND_FAILED';
        // Partial: một phần nội dung đã tới khách thật (adapter đã gắn code/errorCategory
        // tương ứng — xem zaloPersonal.adapter.js). Release ở đây mở lại slot cho retry
        // gửi LẠI TOÀN BỘ — khách nhận trùng phần đã tới. Coi như timeout: giữ 'uncertain'.
        if (classified.isTimeout || isZaloPartialDeliveryResult(lastSendResult)) {
          await markSendQuotaUncertain({
            reservationId: reservation.id,
            failureCode: isZaloPartialDeliveryResult(lastSendResult) ? 'PARTIAL_DELIVERY' : 'TIMEOUT',
            reason: classified.label || (isZaloPartialDeliveryResult(lastSendResult) ? 'Partial delivery' : 'Timeout'),
          }, ...optArg);
        } else {
          await releaseSendQuota({
            reservationId: reservation.id,
            failureCode,
            reason: classified.label || 'Send failed',
          }, ...optArg);
        }
      }
    }

    if (canTrackSend) {
      await unifiedInboxRepository.updateMessageSendStatus(conversationType, messageId, {
        status: sendStatus,
        error: sendError,
        attempts: 1,
      }).catch((e) => {
        console.warn('[UnifiedInbox] updateMessageSendStatus failed:', e.message);
      });
    }

    return {
      success: true,
      messageId,
      conversationId: parseInt(conversationId),
      sendStatus,
      sendError,
      error: sendStatus === 'failed' ? sendError : undefined,
      pauseState,
      ...pauseState,
    };
  }

  /**
   * Gửi lại một tin nhắn của agent bị thất bại (retry).
   *
   * Hỗ trợ 2 chữ ký gọi:
   * 1. retryMessage({ userId, messageId, type }, options)
   * 2. retryMessage(userId, messageId, type, options)
   */
  async retryMessage(paramOrUserId, maybeMessageId, maybeType, maybeOptions) {
    let userId;
    let messageId;
    let type;
    let options = {};

    if (paramOrUserId && typeof paramOrUserId === 'object') {
      userId = paramOrUserId.userId;
      messageId = paramOrUserId.messageId;
      type = paramOrUserId.type;
      options = maybeMessageId || {};
    } else {
      userId = paramOrUserId;
      messageId = maybeMessageId;
      type = maybeType;
      options = maybeOptions || {};
    }

    if (type !== 'zalo_personal' && type !== 'channel') {
      const err = new Error('Invalid conversation type for retry');
      err.status = 400;
      err.code = 'INVALID_TYPE';
      throw err;
    }

    const owned = await unifiedInboxRepository.findAgentMessageForRetry(
      userId,
      parseInt(messageId, 10),
      type
    );
    if (!owned) {
      const err = new Error('Message not found');
      err.status = 404;
      throw err;
    }

    // Check if message is already sent (idempotent replay)
    if (owned.metadata?.send?.status === 'sent') {
      return {
        success: true,
        messageId: owned.id,
        sendStatus: 'sent',
        isReplay: true,
      };
    }

    // Check existing reservation status BEFORE claiming
    if (type === 'zalo_personal' && owned.quota_reservation_id) {
      const prevRes = await findReservationById(db, owned.quota_reservation_id);
      if (prevRes?.status === 'consumed') {
        return {
          success: true,
          messageId: owned.id,
          sendStatus: 'sent',
          isReplay: true,
        };
      }
      if (prevRes?.status === 'uncertain') {
        const err = new Error('Trạng thái gửi tin nhắn trước đó chưa xác định. Vui lòng kiểm tra lại trước khi gửi.');
        err.status = 409;
        err.code = 'RESERVATION_UNCERTAIN';
        throw err;
      }
      if (prevRes?.status === 'reserved' || prevRes?.status === 'sending') {
        const err = new Error('Tin nhắn đang được xử lý gửi trong một tiến trình khác');
        err.status = 409;
        err.code = 'CONCURRENT_SEND_IN_PROGRESS';
        throw err;
      }
    }

    const claimed = await unifiedInboxRepository.claimMessageForRetry(type, owned.id);
    if (!claimed) {
      // If message was completed concurrently, return replay success
      const refreshed = await unifiedInboxRepository.findAgentMessageForRetry(userId, parseInt(messageId, 10), type);
      if (refreshed?.metadata?.send?.status === 'sent') {
        return {
          success: true,
          messageId: owned.id,
          sendStatus: 'sent',
          isReplay: true,
        };
      }
      const err = new Error('Tin đang được gửi lại hoặc không ở trạng thái thất bại');
      err.status = 409;
      err.code = 'RETRY_NOT_AVAILABLE';
      throw err;
    }

    const conversation = await unifiedInboxRepository.getConversationById(
      userId,
      Number(owned.id_conversation),
      type
    );
    if (!conversation) {
      await unifiedInboxRepository.updateMessageSendStatus(type, owned.id, {
        status: 'failed',
        error: 'Conversation not found',
      }).catch(() => {});
      const err = new Error('Conversation not found');
      err.status = 404;
      throw err;
    }

    let sendStatus = 'sent';
    let sendError = null;

    let reservation = null;
    if (type === 'zalo_personal') {
      const retryClientKey = resolveRequestIdempotencyKey(options.idempotencyKey || options.clientKey || null);
      const recipient = conversation.external_id || owned.external_id || String(owned.id_conversation);
      // retryClientKey có thể dài tới 128 ký tự (trần của resolveRequestIdempotencyKey).
      // Nối thẳng tiền tố `inbox_retry_${owned.id}_` vào sẽ đẩy vượt trần 128 của
      // hashClientSegment và bị từ chối oan (cùng lỗi đã sửa ở zaloSettings.controller.js
      // cho preview) — băm cả cụm trước để độ dài luôn cố định, không phụ thuộc key gốc.
      const retryKeyDigest = crypto
        .createHash('sha256')
        .update(`inbox_retry_${owned.id}_${retryClientKey}`)
        .digest('hex')
        .slice(0, 32);
      const reservationKey = buildDirectReservationKey({
        channel: 'zalo',
        billingUserId: options.ownerContextId || userId,
        clientKey: `inbox_retry_${retryKeyDigest}`,
        recipient,
      });

      let parsedAttachments = [];
      try {
        parsedAttachments = Array.isArray(owned.attachments)
          ? owned.attachments
          : (typeof owned.attachments === 'string' ? JSON.parse(owned.attachments || '[]') : []);
      } catch {
        parsedAttachments = [];
      }

      const requestPayload = {
        messageId: owned.id,
        conversationId: Number(owned.id_conversation),
        recipient,
        content: owned.content,
        attachments: parsedAttachments,
      };
      const requestFingerprint = computeRequestFingerprint(requestPayload);

      try {
        reservation = await reserveSendQuota({
          // Controller truyền workspace owner vào `userId` và người thao tác thật vào
          // `options.actorUserId` (xem unifiedInbox.controller.js:retryMessage). Thiếu
          // fallback này thì policy luôn coi đây là owner gửi, bỏ qua trần Tier 1 của
          // nhân viên khi họ bấm gửi lại một tin lỗi.
          userId: options.actorUserId || userId,
          roleCode: options.roleCode || 'user',
          ownerContextId: options.ownerContextId || null,
          membershipId: options.membershipId || null,
          channel: 'zalo',
          quantity: 1,
          reservationKey,
          requestFingerprint,
          requestPayload,
          sourceType: 'inbox',
        }, options);

        if (reservation.mode === 'enforce' || reservation.mode === 'test_enforce') {
          if (reservation.status === 'consumed') {
            return {
              success: true,
              messageId: owned.id,
              sendStatus: 'sent',
              isReplay: true,
            };
          }
          await markSendQuotaSending({ reservationId: reservation.id }, options);
        }

        await unifiedInboxRepository.updateMessageQuotaReservationId(type, owned.id, reservation.id);
      } catch (quotaErr) {
        if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
          await releaseSendQuota({
            reservationId: reservation.id,
            failureCode: 'RETRY_INIT_FAILED',
            reason: quotaErr.message || 'retry_init_failed',
          }, options).catch(() => {});
        }
        await unifiedInboxRepository.updateMessageSendStatus(type, owned.id, {
          status: 'failed',
          error: quotaErr.message || 'Lỗi kiểm tra hạn mức gửi tin Zalo',
        }).catch(() => {});
        throw quotaErr;
      }
    }

    try {
      const adapter = this._getChannelAdapter(conversation.channel || owned.channel);
      if (!adapter?.sendReply) {
        sendStatus = 'failed';
        sendError = 'Channel adapter not available';
      } else {
        const params = {
          externalId: conversation.external_id || owned.external_id,
          message: owned.content,
          attachments: sanitizeOwnedInboxAttachments(owned.attachments || [], userId),
          userId,
          accountId: type === 'zalo_personal'
            ? (owned.id_zalo_setting || conversation.id_zalo_setting)
            : undefined,
          conversationInfo: this._buildZaloConversationInfo(conversation, owned),
          forceReply: true,
          persist: false,
        };
        if (type === 'channel') {
          params.channelId = owned.id_channel || conversation.id_channel;
        }
        const sendResult = await adapter.sendReply(params);
        if (sendResult && sendResult.success === false) {
          sendStatus = 'failed';
          sendError = sendResult.error || 'Send failed';
          if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
            const classified = classifyZaloSendError(sendError);
            try {
              // Partial: một phần nội dung đã tới khách thật. Release ở đây mở lại slot
              // cho retry gửi LẠI TOÀN BỘ — khách nhận trùng phần đã tới. Coi như timeout.
              if (classified.isTimeout || isZaloPartialDeliveryResult(sendResult)) {
                await markSendQuotaUncertain({
                  reservationId: reservation.id,
                  failureCode: isZaloPartialDeliveryResult(sendResult) ? 'PARTIAL_DELIVERY' : 'TIMEOUT',
                  reason: classified.label || (isZaloPartialDeliveryResult(sendResult) ? 'Partial delivery' : 'Network timeout'),
                }, options);
              } else {
                await releaseSendQuota({
                  reservationId: reservation.id,
                  failureCode: classified.failureCode || classified.category || 'PROVIDER_ERROR',
                  reason: classified.label || sendError,
                }, options);
              }
            } catch (_) {}
          }
        } else {
          if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
            try {
              await consumeSendQuota({
                reservationId: reservation.id,
                responseSnapshot: sendResult,
              }, options);
            } catch (consumeErr) {
              console.warn('[UnifiedInbox] retry consumeSendQuota error:', consumeErr.message);
              await markSendQuotaUncertain({
                reservationId: reservation.id,
                failureCode: 'CONSUME_DB_FAILED',
              }, options).catch(() => {});
            }
          }
          if (type === 'zalo_personal' && params.accountId) {
            const msgIds = Array.isArray(sendResult?.msgIds) ? sendResult.msgIds : [];
            const primaryMsgId = sendResult?.msgId ?? msgIds[0] ?? null;
            if (primaryMsgId || msgIds.length > 0) {
              try {
                await unifiedInboxRepository.bindZaloPersonalOutboundMsgIds(owned.id, {
                  externalId: primaryMsgId,
                  msgIds: msgIds.length > 0 ? msgIds : (primaryMsgId ? [primaryMsgId] : []),
                });
              } catch (bindErr) {
                console.warn('[UnifiedInbox] bind outbound msgIds on retry failed:', bindErr.message);
              }
            }
            try {
              const { default: zaloPersonalInboxService } = await import('./zaloInbox.service.js');
              await zaloPersonalInboxService.registerAccountListener(params.accountId);
            } catch (rebindErr) {
              console.warn('[UnifiedInbox] Re-bind inbox listener after retry send failed:', rebindErr.message);
            }
          }
        }
      }
    } catch (err) {
      sendStatus = 'failed';
      sendError = err.message || 'Send failed';
      if (reservation?.id && (reservation.mode === 'enforce' || reservation.mode === 'test_enforce')) {
        const classified = classifyZaloSendError(sendError);
        try {
          if (classified.isTimeout) {
            await markSendQuotaUncertain({
              reservationId: reservation.id,
              failureCode: 'TIMEOUT',
              reason: classified.label || 'Network timeout',
            }, options);
          } else {
            await releaseSendQuota({
              reservationId: reservation.id,
              failureCode: classified.failureCode || classified.category || 'PROVIDER_ERROR',
              reason: classified.label || sendError,
            }, options);
          }
        } catch (_) {}
      }
    }

    const updated = await unifiedInboxRepository.updateMessageSendStatus(type, owned.id, {
      status: sendStatus,
      error: sendStatus === 'failed' ? sendError : null,
    });

    return {
      success: true,
      messageId: owned.id,
      sendStatus,
      error: sendStatus === 'failed' ? sendError : undefined,
      metadata: updated?.metadata || null,
    };
  }

  /**
   * Pause / resume AI auto-reply for one conversation.
   * Toggle always uses reason=manual when pausing (stay until toggled on).
   */
  async setConversationAiPaused(userId, conversationId, conversationType, paused) {
    const conversation = await unifiedInboxRepository.getConversationById(
      userId,
      parseInt(conversationId),
      conversationType
    );
    if (!conversation) throw new Error('Conversation not found');
    const reason = paused ? 'manual' : 'handoff';
    const pausedRow = await unifiedInboxRepository.setAiPaused(
      parseInt(conversationId),
      conversationType,
      !!paused,
      reason
    );
    const pauseState = await buildAiPausePayload({
      aiPaused: pausedRow.aiPaused,
      aiPausedAt: pausedRow.aiPausedAt,
      ownerUserId: userId,
    });
    return { success: true, ...pauseState };
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
      visitorName: msg.conversation_type === 'webchat' 
        ? `${msg.channel_display_name} - ${msg.id_conversation}` 
        : (msg.visitor_name || 'Khách vãng lai'),
      visitorInfo: msg.visitor_info,
      externalId: msg.external_id,
      conversationStatus: msg.conversation_status,
      content: msg.content,
      attachments: presentInboxAttachments(msg.attachments),
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
      visitorName: message.conversation_type === 'webchat'
        ? `${message.channel_display_name} - ${message.id_conversation}`
        : (message.visitor_name || 'Khách vãng lai'),
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

  /**
   * Delete a conversation by ID
   */
  async deleteConversation(userId, conversationId, type = 'zalo_personal') {
    console.log('[UnifiedInboxService] deleteConversation:', { userId, conversationId, type });

    // Delegate to the appropriate adapter
    switch (type) {
      case 'zalo_personal': {
        const result = await zaloPersonalAdapter.deleteConversation(userId, conversationId);
        console.log('[UnifiedInboxService] zalo_personal delete result:', result);
        return result;
      }
      case 'webchat': {
        const result = await chatbotRepository.deleteWebChatConversation(conversationId, userId);
        console.log('[UnifiedInboxService] webchat delete result:', result);
        return result;
      }
      default:
        throw new Error('Unsupported conversation type');
    }
  }
}

export default new UnifiedInboxService();

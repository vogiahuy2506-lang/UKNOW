/**
 * Zalo Personal Inbox Service
 *
 * Xß╗¡ l├╜ tin nhß║»n ─æß║┐n tß╗½ Zalo c├í nh├ón qua zca-js event listener.
 *
 * Luß╗ông hoß║ít ─æß╗Öng:
 * 1. User login/connect Zalo c├í nh├ón ΓåÆ ─æ─âng k├╜ listener
 * 2. Khi c├│ tin nhß║»n ─æß║┐n ΓåÆ xß╗¡ l├╜ qua event handler
 * 3. L╞░u tin nhß║»n visitor v├áo zalo_personal_messages vß╗¢i role='visitor'
 * 4. Tß║ío conversation nß║┐u ch╞░a c├│
 * 5. Route ─æß║┐n AI chatbot (nß║┐u c├│ cß║Ñu h├¼nh cho t├ái khoß║ún n├áy)
 * 6. L╞░u response cß╗ºa AI (role='bot')
 */
import zaloInboxRepository from '../../repositories/chatbot/zaloInbox.repository.js';
import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
import zaloPersonalAdapter from './channelAdapters/zaloPersonal.adapter.js';
import zaloPersonalRepository from '../../repositories/chatbot/zaloPersonal.repository.js';
import chatRouterService from './chatRouter.service.js';
import chatbotZaloAccountRepository from '../../repositories/chatbot/chatbotZaloAccount.repository.js';
import zaloAccountSessionService from '../zalo/zaloAccountSession.service.js';
import sseService from '../sse.service.js';
import unifiedInboxRepository from '../../repositories/ai/unifiedInbox.repository.js';
import { isZaloAccountChatbotEnabled } from '../../utils/zaloAccountChatbotGate.util.js';
import inboundReplyDebounceService from './inboundReplyDebounce.service.js';
import { formatBatchedContent } from '../../utils/chatbotReplyBatch.util.js';
import {
  drainPendingAccounts,
  markAccountRegistered,
  isAccountRegistered,
  unmarkAccountRegistered,
  removeAccount,
  listRegisteredAccounts,
} from '../zalo/zaloAccountRegistry.service.js';
import {
  buildPlaceholderGroupName,
  extractGroupNameFromApiResult,
  isPlaceholderGroupName,
  normalizeZaloGroupId,
} from '../../utils/zaloGroupName.util.js';
import { resolveConversationExternalId, isInboxSendEcho } from '../../utils/zaloPersonalMessage.util.js';
import { buildAiPausePayload } from '../../utils/aiHandoffResume.util.js';

class ZaloPersonalInboxService {
  constructor() {
    // Map accountId ΓåÆ zalo_setting_id cache
    this.zaloSettingCache = new Map();
    // Cache danh s├ích active accounts (tr├ính query DB mß╗ùi 5 ph├║t)
    this._accountCache = {
      data: [],
      timestamp: 0,
      ttlMs: 5 * 60 * 1000, // 5 ph├║t
    };
    // Track accounts ─æ├ú ─æ─âng k├╜ (─æß╗â tr├ính duplicate log)
    this._registeredAccounts = new Set();
    // Mutex ─æß╗â tr├ính race condition khi nhiß╗üu cron chß║íy ─æß╗ông thß╗¥i
    this._isRefreshing = false;
    // Cache group info ─æß╗â tr├ính gß╗ìi API nhiß╗üu lß║ºn
    this._groupNameCache = new Map();
  }

  /**
   * Lß║Ñy t├¬n nh├│m tß╗½ Zalo API (c├│ cache)
   */
  async getGroupName(accountId, groupId) {
    const { bare, raw } = normalizeZaloGroupId(groupId);
    if (!bare) return null;

    const cacheKey = `group_${accountId}_${bare}`;
    if (this._groupNameCache.has(cacheKey)) {
      return this._groupNameCache.get(cacheKey);
    }

    const dbName = await zaloInboxRepository.findGroupNameById(accountId, bare);
    if (dbName && !isPlaceholderGroupName(dbName, bare)) {
      this._groupNameCache.set(cacheKey, dbName);
      return dbName;
    }

    const api = zaloAccountSessionService.getAccountApi(accountId);
    if (!api) {
      console.warn(`[ZaloInbox] getGroupName: No API for account ${accountId}`);
      return null;
    }

    const apiIds = [...new Set([bare, raw].filter(Boolean))];
    for (const apiId of apiIds) {
      try {
        console.log(`[ZaloInbox] getGroupName: Calling API for group ${apiId}`);
        const result = await api.getGroupInfo(apiId);
        const groupName = extractGroupNameFromApiResult(result, apiId);
        if (groupName && !isPlaceholderGroupName(groupName, apiId)) {
          this._groupNameCache.set(cacheKey, groupName);
          console.log(`[ZaloInbox] getGroupName(${apiId}) = "${groupName}"`);
          return groupName;
        }
        console.warn(`[ZaloInbox] getGroupName: No name found in result for ${apiId}`);
      } catch (err) {
        console.warn(`[ZaloInbox] getGroupName failed for ${apiId}:`, err.message);
      }
    }

    return null;
  }

  /**
   * Lß║Ñy th├┤ng tin user profile tß╗½ uid (c├│ cache)
   */
  async getUserProfile(accountId, uid) {
    const cacheKey = `user_${accountId}_${uid}`;
    if (this._groupNameCache.has(cacheKey)) {
      return this._groupNameCache.get(cacheKey);
    }

    const api = zaloAccountSessionService.getAccountApi(accountId);
    if (!api) return null;

    try {
      const result = await api.getUserInfo(uid);
      // Response format: { changed_profiles: { [uid]: { displayName, zaloName, ... } } }
      const profile = result?.changed_profiles?.[uid];
      if (profile) {
        this._groupNameCache.set(cacheKey, profile);
        console.log(`[ZaloInbox] getUserProfile(${uid}) = "${profile.displayName || profile.zaloName}"`);
        return profile;
      }
      return null;
    } catch (err) {
      console.warn(`[ZaloInbox] Failed to get user profile for ${uid}:`, err.message);
      return null;
    }
  }

  /**
   * Kh├┤i phß╗Ñc zca-js session tß╗½ DB (cookie_text) cho c├íc connected accounts
   * Cß║ºn gß╗ìi khi startup ─æß╗â ─æß║úm bß║úo session ─æ╞░ß╗úc restore sau restart
   */
  async restoreSessionsFromDb() {
    console.log('[ZaloInbox] restoreSessionsFromDb: STARTING');
    try {
      let accounts, queryError;
      try {
        accounts = await zaloInboxRepository.findConnectedAccountsWithSessions();
      } catch (e) {
        accounts = [];
        queryError = e;
      }

      if (queryError) {
        console.error('[ZaloInbox] Query error:', queryError.message);
        return;
      }

      console.log(`[ZaloInbox] Found ${accounts.length} accounts with valid sessions to restore`);
      if (accounts.length > 0) {
        console.log(`[ZaloInbox] Accounts:`, accounts.map(a => ({ id: a.account_id, is_active: a.is_active, status: a.status, has_cookie: !!a.cookie_text })));
      }

      if (accounts.length === 0) {
        // Debug: check what accounts exist
        const allAccounts = await zaloInboxRepository.findAllAccountsSample();
        console.log('[ZaloInbox] All zalo_settings (sample):', JSON.stringify(allAccounts));
        return;
      }

      // Import zaloSettingsController ─æß╗â gß╗ìi restore
      console.log('[ZaloInbox] Importing zaloSettingsController...');
      const { default: zaloSettingsController } = await import('../../controllers/zaloSettings.controller.js');
      console.log('[ZaloInbox] zaloSettingsController imported successfully');
      
      for (const account of accounts) {
        // Skip nß║┐u ─æ├ú c├│ session
        if (zaloAccountSessionService.getAccountApi(account.account_id)) {
          console.log(`[ZaloInbox] Account ${account.account_id} already has active session`);
          continue;
        }

        try {
          console.log(`[ZaloInbox] Restoring session for account ${account.account_id}...`);
          // Tß║ío mock request/response ─æß╗â gß╗ìi restoreAccountSessionByCookie
          // skipMarkDisconnectedOnFail: true ΓåÆ nß║┐u cookie hß╗Ång tho├íng qua th├¼ KH├öNG mark
          // disconnected trong DB; giß╗» nguy├¬n 'connected' ─æß╗â cron retry sau 5 ph├║t.
          // Chß╗ë mark disconnected khi user chß╗º ─æß╗Öng restore tß╗½ UI.
          const mockReq = {
            user: { id: account.id_user, role: 'user' },
            params: { id: String(account.account_id) },
            skipMarkDisconnectedOnFail: true,
          };
          const mockRes = {
            status: () => mockRes,
            json: (data) => {
              if (data.success) {
                console.log(`[ZaloInbox] Γ£à Restored session for account ${account.account_id}`);
              } else {
                console.log(`[ZaloInbox] Γ¥î Failed to restore session for account ${account.account_id}: ${data.message}`);
              }
            }
          };
          
          await zaloSettingsController.restoreAccountSessionByCookie(mockReq, mockRes);
        } catch (error) {
          console.error(`[ZaloInbox] Error restoring session for account ${account.account_id}:`, error.message);
        }
      }

      // Log tß╗òng kß║┐t
      const successCount = accounts.filter(a => zaloAccountSessionService.getAccountApi(a.account_id)).length;
      if (successCount < accounts.length) {
        console.log(`[ZaloInbox] ΓÜá∩╕Å ${accounts.length - successCount}/${accounts.length} accounts need QR re-scan (cookie expired)`);
        console.log(`[ZaloInbox] ≡ƒÆí Go to Zalo Settings to scan QR code for affected accounts`);
      }
    } catch (error) {
      console.error('[ZaloInbox] Error in restoreSessionsFromDb:', error.message, error.stack);
    }
    console.log('[ZaloInbox] restoreSessionsFromDb: DONE');
  }

  /**
   * Lß║Ñy danh s├ích accounts tß╗½ cache, chß╗ë query DB khi cache hß║┐t hß║ín
   */
  async getActiveZaloPersonalAccounts(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && (now - this._accountCache.timestamp) < this._accountCache.ttlMs) {
      return this._accountCache.data;
    }
    const rows = await zaloInboxRepository.findActiveConnectedAccounts();
    this._accountCache.data = rows;
    this._accountCache.timestamp = now;
    return rows;
  }

  /**
   * Invalidate cache khi c├│ account connect/disconnect
   */
  invalidateAccountCache() {
    this._accountCache.timestamp = 0;
    console.log('[ZaloInbox] Account cache invalidated');
  }

  /**
   * Dß╗ìn dß║╣p cache v├á trß║íng th├íi khi t├ái khoß║ún Zalo bß╗ï x├│a
   */
  forgetAccount(userId, accountId) {
    if (userId && accountId) {
      this.zaloSettingCache.delete(`${userId}_${accountId}`);
    }
    this._accountCache.timestamp = 0;
  }

  /**
   * Get zalo_setting_id for a zalo_personal account
   * Caches the mapping to avoid repeated DB lookups
   */
  async getZaloSettingId(userId, accountId) {
    const cacheKey = `${userId}_${accountId}`;
    if (this.zaloSettingCache.has(cacheKey)) {
      return this.zaloSettingCache.get(cacheKey);
    }

    // Verify account exists and is active
    const row = await zaloInboxRepository.findActiveAccount(accountId, userId);

    if (row) {
      this.zaloSettingCache.set(cacheKey, accountId);
      return accountId;
    }
    return null;
  }

  /**
   * X├íc ─æß╗ïnh message type tß╗½ Zalo msgType
   */
  getMessageType(msgType) {
    const typeMap = {
      1: 'text',
      2: 'image',
      3: 'audio',
      4: 'video',
      5: 'link',
      6: 'sticker',
      7: 'location',
      8: 'contact',
      9: 'file',
      10: 'gif',
      11: 'video',
      12: 'voice',
    };
    return typeMap[msgType] || 'text';
  }

  /**
   * Kiß╗âm tra tin nhß║»n ─æ├ú ─æ╞░ß╗úc l╞░u ch╞░a
   */
  async isMessageProcessed(externalId, zaloSettingId) {
    if (!externalId || !zaloSettingId) return false;
    return zaloInboxRepository.isMessageProcessed(externalId, zaloSettingId);
  }

  /**
   * Xß╗¡ l├╜ mß╗Öt tin nhß║»n ─æß║┐n tß╗½ Zalo c├í nh├ón
   */
  async processIncomingMessage(userId, accountId, zaloSettingId, rawMessage, saveResult = null) {
    try {
      const messageId = rawMessage?.msgId || rawMessage?.messageId || rawMessage?.id;
      const senderId = rawMessage?.fromUid || rawMessage?.senderId || rawMessage?.uid;
      let content = rawMessage?.content || rawMessage?.message || rawMessage?.msg || '';
      if (typeof content !== 'string') {
        content = content?.text || content?.message || JSON.stringify(content) || '';
      }
      const timestamp = rawMessage?.timestamp || rawMessage?.time || rawMessage?.createdAt;

      console.log(`[ZaloInbox] processIncomingMessage: msgId=${messageId}, senderId=${senderId}, isSelf=${rawMessage?.isSelf === true}`);

      const zaloThreadType = rawMessage?.type;
      const rawData = rawMessage?._raw || rawMessage;
      const isGroup = zaloThreadType === 1 || zaloThreadType === 2;

      // Skip entire AI routing for group messages (no AI reply for group chats)
      if (isGroup) {
        return;
      }

      // Extract groupId for group messages ΓÇö lu├┤n chuß║⌐n ho├í qua resolveConversationExternalId
      let groupId = null;
      if (isGroup) {
        groupId = rawData?.clientGroupId || rawData?.threadId || rawData?.idTo || null;
      }

      // Lß║Ñy t├¬n sender tß╗½ raw message
      const senderName = rawMessage?.senderName || rawMessage?.dName || null;
      const groupName = rawMessage?.groupName || null;

      // Validate
      if (!messageId) {
        console.warn('[ZaloInbox] Bß╗Å qua tin nhß║»n kh├┤ng hß╗úp lß╗ç (no msgId)');
        return;
      }

      // The adapter must persist an inbound row before this handler runs. Do
      // not generate an AI reply for a message that could not be recorded or
      // assigned a stable history ID.
      if (!saveResult?.messageId) {
        console.warn(`[ZaloInbox] Bß╗Å qua AI routing v├¼ inbound message ch╞░a ─æ╞░ß╗úc persist: msgId=${messageId}`);
        return;
      }

      // Owner typed from Zalo app: already saved as agent by adapter; pause AI + SSE.
      // Echo of bot replies / inbox-send: skip pause+broadcast (see isInboxSendEcho).
      if (rawMessage.isSelf === true) {
        const externalIdSelf = resolveConversationExternalId({
          isGroup,
          groupId,
          threadId: rawMessage.threadId,
          fromUid: senderId,
        });
        try {
          const conv = await zaloPersonalRepository.findConversation(zaloSettingId, externalIdSelf);
          if (conv?.id) {
            let isEcho = false;
            try {
              const candidates = await zaloPersonalRepository.listRecentAgentEchoCandidates(conv.id);
              isEcho = isInboxSendEcho({
                incomingMsgId: messageId,
                incomingContent: content,
                candidates,
              });
            } catch (echoErr) {
              console.warn('[ZaloInbox] Echo check failed (will pause):', echoErr.message);
            }

            if (isEcho) {
              console.log(`[ZaloInbox] Skip handoff pause for inbox-send echo msgId=${messageId} conv=${conv.id}`);
              return;
            }

            const pausedRow = await zaloPersonalRepository.setAiPaused(conv.id, true);
            const pauseState = await buildAiPausePayload({
              aiPaused: pausedRow.aiPaused,
              aiPausedAt: pausedRow.aiPausedAt,
              ownerUserId: userId,
            });
            sseService.broadcast(String(userId), 'inbox:new_message', {
              conversationId: conv.id,
              channel: 'zalo_personal',
              type: 'zalo_personal',
              message: content,
              messageType: this.getMessageType(rawMessage?.msgType || rawMessage?.type || 1),
              attachments: rawMessage?.attachments || [],
              attachmentUrl: rawMessage?.attachmentUrl || null,
              senderId: senderId,
              senderName: senderName,
              senderAvatar: rawMessage?.senderAvatar || null,
              isGroup: isGroup,
              groupId: isGroup ? groupId : null,
              groupName: isGroup ? groupName : null,
              visitorName: conv.visitor_name || null,
              role: 'agent',
              isSelf: true,
              timestamp,
              ...pauseState,
            });
          }
        } catch (e) {
          console.warn('[ZaloInbox] Failed to pause AI / SSE after owner message:', e.message);
        }
        return;
      }

      // Determine externalId ΓÇö c├╣ng c├┤ng thß╗⌐c vß╗¢i adapter.saveMessageToDatabase
      const externalId = resolveConversationExternalId({
        isGroup,
        groupId,
        threadId: rawMessage.threadId,
        fromUid: senderId,
      });
      const { bare: bareGroupId } = isGroup
        ? normalizeZaloGroupId(groupId)
        : { bare: null };

      // Check existing conversation
      let existingConv = null;
      try {
        existingConv = await zaloPersonalRepository.findConversation(zaloSettingId, externalId);
      } catch (e) {
        console.error(`[ZaloInbox] findConversation error: ${e.message}`);
      }

      // Skip AI for group messages
      let skipAiRouting = isGroup;
      
      // Additional check for personal messages that were previously in a group
      if (!isGroup && existingConv?.visitor_info) {
        try {
          const convInfo = typeof existingConv.visitor_info === 'string' 
            ? JSON.parse(existingConv.visitor_info) 
            : existingConv.visitor_info;
          if (convInfo?.is_group === true) {
            skipAiRouting = false;
          }
        } catch {
          // ignore parse errors
        }
      }

      // Message type
      const msgType = rawMessage?.msgType || rawMessage?.type || 1;
      const messageType = this.getMessageType(msgType);

      // Resolve sender name via API if not available
      let resolvedSenderName = senderName;
      if (!senderName && senderId) {
        try {
          const profile = await this.getUserProfile(accountId, senderId);
          if (profile) {
            resolvedSenderName = profile.displayName || profile.zaloName;
          }
        } catch (e) {
          console.warn(`[ZaloInbox] getUserProfile error: ${e.message}`);
        }
      }

      // Resolve group name via API if not available
      let resolvedGroupName = groupName;
      if (isGroup && !groupName && groupId) {
        try {
          resolvedGroupName = await this.getGroupName(accountId, groupId);
        } catch (e) {
          console.warn(`[ZaloInbox] getGroupName error: ${e.message}`);
        }
      }

      // Display name:
      // - For groups: use group name (resolved or from message)
      // - For personal: use sender name (resolved or from message)
      // IMPORTANT: Don't use "Nh├│m group_XXX" format - use "Nh├│m" + short ID
      let displayName;
      if (isGroup) {
        if (resolvedGroupName || groupName) {
          displayName = resolvedGroupName || groupName;
        } else {
          displayName = buildPlaceholderGroupName(groupId);
        }
      } else {
        displayName = resolvedSenderName || senderName || `User ${senderId}`;
      }

      // Build visitor info
      const visitorInfo = {
        source: isGroup ? 'zalo_group' : 'zalo_personal',
        message_id: messageId,
        account_id: accountId,
        is_group: isGroup,
        group_id: isGroup ? (bareGroupId || groupId) : null,
        group_name: isGroup ? (resolvedGroupName || groupName) : null,
        sender_id: senderId,
        sender_name: resolvedSenderName || senderName,
        sender_avatar: rawMessage?.senderAvatar || null,
        message_type: messageType,
        attachment_url: rawMessage?.attachmentUrl || null,
      };

      // Create or get conversation (message already persisted by adapter)
      const conversation = await this.getOrCreateConversation(zaloSettingId, userId, externalId, displayName, visitorInfo);

      // Broadcast SSE
      sseService.broadcast(String(userId), 'inbox:new_message', {
        conversationId: conversation.id,
        channel: 'zalo_personal',
        type: 'zalo_personal',
        message: content,
        messageType: messageType,
        attachments: rawMessage?.attachments || [],
        attachmentUrl: rawMessage?.attachmentUrl || null,
        senderId: senderId,
        senderName: resolvedSenderName || senderName,
        senderAvatar: rawMessage?.senderAvatar || null,
        isGroup: isGroup,
        groupId: isGroup ? groupId : null,
        groupName: isGroup ? (resolvedGroupName || groupName) : null,
        visitorName: displayName,
        timestamp,
      });

      // Skip AI for group messages
      if (skipAiRouting) {
        return;
      }

      // Build AI content
      let aiContent = content?.trim() || '';
      if (messageType === 'sticker') {
        aiContent = `[Sticker] Ng╞░ß╗¥i d├╣ng gß╗¡i mß╗Öt sticker`;
      }
      if (messageType === 'image') {
        aiContent = '[H├¼nh ß║únh] Ng╞░ß╗¥i d├╣ng gß╗¡i mß╗Öt h├¼nh ß║únh';
      }

      if (!aiContent && messageType !== 'sticker' && messageType !== 'image') {
        return;
      }

      // Enqueue into debounce bucket for this conversation
      const debounceKey = `zalo_personal:${zaloSettingId}:${conversation.id}`;
      inboundReplyDebounceService.enqueue({
        key: debounceKey,
        message: {
          eventId: messageId || rawMessage?.msgId || null,
          persistedMessageId: saveResult?.messageId || null,
          receivedAt: timestamp,
          content: aiContent,
          metadata: {
            userId,
            zaloSettingId,
            conversationId: conversation.id,
            senderId,
            senderName: resolvedSenderName || senderName,
          },
        },
        flushCallback: async (batch) => {
          await this._processZaloPersonalBatch({
            userId,
            zaloSettingId,
            conversation,
            senderId,
            resolvedSenderName: resolvedSenderName || senderName,
            batch,
          });
        },
      });
    } catch (err) {
      console.error(`[ZaloInbox] ERROR in processIncomingMessage:`, err.stack || err.message);
    }
  }

  /**
   * Process a flushed batch of messages for Zalo Personal
   * @private
   */
  async _processZaloPersonalBatch({ userId, zaloSettingId, conversation, senderId, resolvedSenderName, batch }) {
    const prompt = formatBatchedContent(batch.messages);
    if (!prompt) return;

    try {
      // 1. Dynamic check: chatbot & account settings enabled
      const chatbotSettings = await chatbotRepository.getSettings(userId, 'zalo_personal');
      const accountSettings = await chatbotZaloAccountRepository.getSettings(userId, zaloSettingId);

      if (!isZaloAccountChatbotEnabled(accountSettings)) {
        console.log(`[ChatbotDebounce] channel=zalo_personal account=${zaloSettingId} conversation=${conversation.id} batch_size=${batch.messages.length} wait_ms=${batch.waitMs} reason=${batch.reason} result=disabled`);
        return;
      }

      // 2. Dynamic check: resource lock and active session. Both must happen
      // before rate/credit consumption, not only inside sendReply().
      const { resourceIsLocked } = await import('../../utils/topupLockGate.util.js');
      if (await resourceIsLocked('zalo_accounts', zaloSettingId)) {
        console.log(`[ChatbotDebounce] channel=zalo_personal account=${zaloSettingId} conversation=${conversation.id} batch_size=${batch.messages.length} wait_ms=${batch.waitMs} reason=${batch.reason} result=locked`);
        return;
      }
      const session = await zaloPersonalAdapter.getSessionByAccountId(zaloSettingId);
      if (!session?.api) {
        console.log(`[ChatbotDebounce] channel=zalo_personal account=${zaloSettingId} conversation=${conversation.id} batch_size=${batch.messages.length} wait_ms=${batch.waitMs} reason=${batch.reason} result=disabled`);
        return;
      }

      // 3. Dynamic check: handoff / AI paused
      if (await zaloPersonalRepository.isAiPaused(conversation.id)) {
        console.log(`[ChatbotDebounce] channel=zalo_personal account=${zaloSettingId} conversation=${conversation.id} batch_size=${batch.messages.length} wait_ms=${batch.waitMs} reason=${batch.reason} result=paused`);
        return;
      }

      // 4. Dynamic check: rate limit (single check per batch)
      const { default: chatbotRateLimitService } = await import('./chatbotRateLimit.service.js');
      const rate = await chatbotRateLimitService.checkBeforeAi({
        channel: 'zalo_personal',
        ownerUserId: userId,
        chatbotId: zaloSettingId,
        senderKey: senderId,
      });
      if (!rate.allowed) {
        if (rate.shouldNotify) {
          const sent = await zaloPersonalAdapter.sendReply({
            externalId: String(senderId),
            message: rate.staticReply,
            userId,
            accountId: zaloSettingId,
            persist: true,
            replySource: 'ai_rate_limited',
          });
          if (sent?.success !== false) {
            await chatbotRateLimitService.markRateLimitNotified({
              channel: 'zalo_personal',
              ownerUserId: userId,
              chatbotId: zaloSettingId,
              senderKey: senderId,
              reason: rate.reason,
            });
          }
        }
        console.log(`[ChatbotDebounce] channel=zalo_personal account=${zaloSettingId} conversation=${conversation.id} batch_size=${batch.messages.length} wait_ms=${batch.waitMs} reason=${batch.reason} result=rate_limited`);
        return;
      }

      let mergedSettings = {
        ...chatbotSettings,
        ...accountSettings,
        is_enabled: true,
      };

      if (!mergedSettings.system_instruction && accountSettings?.chatbot_system_instruction) {
        mergedSettings.system_instruction = accountSettings.chatbot_system_instruction;
      }
      
      if (!mergedSettings.system_instruction && chatbotSettings?.system_instruction) {
        mergedSettings.system_instruction = chatbotSettings.system_instruction;
      }

      // 5. Snapshot history and exclude just this batch's visitor rows. A bot
      // reply from the preceding batch remains visible even if it was stored
      // after the first message in this batch.
      const historyThroughMessageId = await zaloPersonalRepository.getLatestMessageId(conversation.id);
      const result = await chatRouterService.routeMessageWithSettings({
        channel: 'zalo_personal',
        userId,
        message: prompt,
        conversationId: conversation.id,
        chatbotSettings: mergedSettings,
        throughMessageId: historyThroughMessageId,
        excludeMessageIds: batch.messages
          .map((item) => item.persistedMessageId)
          .filter((id) => id != null),
        visitorInfo: {
          source: 'zalo_personal',
          senderId,
          senderName: resolvedSenderName,
        },
      });

      if (result?.content) {
        // Single persist path: sendReply(persist=true) inserts agent message once.
        const sent = await zaloPersonalAdapter.sendReply({
          externalId: String(senderId),
          message: result.content,
          userId,
          accountId: zaloSettingId,
          persist: true,
          replySource: 'ai_auto_reply',
        });
        if (sent?.success === false) {
          console.log(`[ChatbotDebounce] channel=zalo_personal account=${zaloSettingId} conversation=${conversation.id} batch_size=${batch.messages.length} wait_ms=${batch.waitMs} reason=${batch.reason} result=failed`);
          return;
        }
        sseService.broadcast(String(userId), 'inbox:new_message', {
          conversationId: conversation.id,
          channel: 'zalo_personal',
          message: result.content,
          messageType: 'text',
          role: 'agent',
          senderName: 'AI',
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log(`[ChatbotDebounce] channel=zalo_personal account=${zaloSettingId} conversation=${conversation.id} batch_size=${batch.messages.length} wait_ms=${batch.waitMs} reason=${batch.reason} result=failed`);
        return;
      }

      console.log(`[ChatbotDebounce] channel=zalo_personal account=${zaloSettingId} conversation=${conversation.id} batch_size=${batch.messages.length} wait_ms=${batch.waitMs} reason=${batch.reason} result=sent`);
    } catch (err) {
      console.error(`[ChatbotDebounce] Error processing Zalo Personal batch for conv ${conversation.id}:`, err.stack || err.message);
    }
  }

  /**
   * Get or create conversation for Zalo Personal
   */
  async getOrCreateConversation(zaloSettingId, userId, externalId, visitorName, visitorInfo) {
    const now = new Date().toISOString();
    
    // Try to find existing conversation
    const conv = await zaloInboxRepository.findConversation(zaloSettingId, externalId);

    if (conv) {
      // For groups: update visitor_name if we have a resolved group name (better than "Nh├│m X")
      // For personal: always update visitor_name if changed
      const isExistingGroup = conv.visitor_info?.is_group === true ||
        (typeof conv.visitor_info === 'string' && conv.visitor_info.includes('"is_group":true'));

      // For groups: update name if we have a better (resolved) name
      // For personal: update name if changed
      let newName = null;
      if (isExistingGroup) {
        // For groups: update if current name is just "Nh├│m X" (not real name) and we have resolved name
        if (visitorName && conv.visitor_name !== visitorName && isPlaceholderGroupName(conv.visitor_name, visitorInfo?.group_id || conv.external_id)) {
          newName = visitorName;
          console.log(`[ZaloInbox] Updating group conversation name: ${conv.visitor_name} -> ${visitorName}`);
        }
      } else {
        // For personal: always update if changed
        newName = (visitorName && conv.visitor_name !== visitorName) ? visitorName : null;
      }
      let newInfo = null;

      // Update visitor_info if provided and different
      if (visitorInfo) {
        const currentInfo = conv.visitor_info || {};
        const shouldUpdate =
          visitorInfo.sender_name !== currentInfo.sender_name ||
          visitorInfo.group_name !== currentInfo.group_name ||
          visitorInfo.sender_id !== currentInfo.sender_id;

        if (shouldUpdate) {
          newInfo = visitorInfo;
        }
      }

      if (newName !== null || newInfo !== null) {
        await zaloInboxRepository.updateConversationVisitor(conv.id, newName, newInfo);
        console.log(`[ZaloInbox] Updated conversation ${conv.id} with name: ${visitorName}`);
      }

      // IMPORTANT: Always update last_message_at when receiving new message
      await zaloInboxRepository.touchConversation(conv.id, now);
      console.log(`[ZaloInbox] Touched conversation ${conv.id} - last_message_at updated`);

      return { ...conv, visitor_name: visitorName || conv.visitor_name };
    }

    // Create new conversation
    return zaloInboxRepository.createConversation(userId, zaloSettingId, externalId, visitorName, visitorInfo);
  }

  /**
   * Backfill t├¬n cho tß║Ñt cß║ú conversations c┼⌐ ch╞░a c├│ t├¬n
   */
  async backfillConversationNames(userId, accountId, zaloSettingId) {
    const conversations = await zaloInboxRepository.findConversationsForBackfill(userId, zaloSettingId);

    console.log(`[ZaloInbox] Backfilling names for ${conversations.length} conversations`);

    for (const conv of conversations) {
      try {
        const externalId = conv.external_id;
        const visitorInfo = conv.visitor_info || {};
        const isGroup = visitorInfo.is_group;
        
        let displayName = null;
        let updatedVisitorInfo = { ...visitorInfo };

        if (isGroup) {
          // For groups, use getGroupName
          const groupId = visitorInfo.group_id || externalId;
          const groupName = await this.getGroupName(accountId, groupId);
          if (groupName) {
            displayName = groupName;
            updatedVisitorInfo.group_name = groupName;
          } else {
            displayName = buildPlaceholderGroupName(groupId);
            updatedVisitorInfo.group_name = null;
          }
        } else {
          // For personal, use getUserProfile
          const profile = await this.getUserProfile(accountId, externalId);
          if (profile) {
            displayName = profile.displayName || profile.zaloName;
            updatedVisitorInfo.sender_name = displayName;
            updatedVisitorInfo.sender_id = externalId;
          }
        }

        if (displayName) {
          await zaloInboxRepository.backfillConversationName(conv.id, displayName, updatedVisitorInfo);
          console.log(`[ZaloInbox] Backfilled: ${externalId} -> ${displayName} (${isGroup ? 'group' : 'personal'})`);
        }
      } catch (err) {
        console.warn(`[ZaloInbox] Failed to backfill ${conv.external_id}:`, err.message);
      }
    }
  }

  /**
   * Tß║ío message handler cho mß╗Öt account
   */
  createMessageHandler(userId, accountId, zaloSettingId) {
    return async (rawMessage, saveResult) => {
      await this.processIncomingMessage(userId, accountId, zaloSettingId, rawMessage, saveResult);
    };
  }

  /**
   * Force detach + ─æ─âng k├╜ lß║íi inbox handler tr├¬n session hiß╗çn tß║íi.
   * D├╣ng khi user bß║Ñm ─æß╗ông bß╗Ö chat 1-1 (zca-js kh├┤ng c├│ API lß╗ïch sß╗¡ c├í nh├ón).
   * @param {number|string} accountId
   * @returns {Promise<boolean>}
   */
  async forceRebindListener(accountId) {
    unmarkAccountRegistered(accountId);
    try {
      zaloPersonalAdapter.removeMessageHandler(accountId);
    } catch {
      // ignore
    }
    return this._registerSingleListener(accountId);
  }

  /**
   * Register listener cho mß╗Öt account cß╗Ñ thß╗â (public API ΓÇö delegates to internal).
   * No mutex here; callers (start, refreshListeners) manage concurrency.
   * @param {number} accountId
   * @param {object|null} accountRow - pass sß║╡n ─æß╗â tr├ính query lß║íi zalo_settings
   */
  async registerAccountListener(accountId, accountRow = null) {
    return this._registerSingleListener(accountId, accountRow);
  }

  /**
   * Register listeners cho tß║Ñt cß║ú active accounts (d├╣ng cache, parallel)
   */
  async registerAllListeners() {
    // Skip nß║┐u ─æang refresh
    if (this._isRefreshing) {
      console.log('[ZaloInbox] Skipping registerAll (already refreshing)');
      return;
    }
    this._isRefreshing = true;

    try {
      // QUAN TRß╗îNG: Kh├┤i phß╗Ñc sessions tß╗½ DB tr╞░ß╗¢c khi ─æ─âng k├╜ listeners
      // ─Éiß╗üu n├áy cß║ºn thiß║┐t sau restart v├¼ session zca-js chß╗ë l╞░u trong memory
      await this.restoreSessionsFromDb();

      const accounts = await this.getActiveZaloPersonalAccounts(true); // force refresh
      console.log(`[ZaloInbox] Found ${accounts.length} active Zalo personal accounts`);
      if (accounts.length === 0) {
        return;
      }

      console.log(`[ZaloInbox] ─É─âng k├╜ listeners cho ${accounts.length} Zalo personal accounts`);

      // Parallel register - use internal method without mutex
      const results = await Promise.allSettled(
        accounts.map((acc) => this._registerSingleListener(acc.account_id, acc))
      );
      
      // Log any failures
      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          console.error(`[ZaloInbox] Failed to register account ${accounts[idx].account_id}: ${result.reason}`);
        }
      });
    } catch (error) {
      console.error('[ZaloInbox] Lß╗ùi khi ─æ─âng k├╜ listeners:', error.message);
    } finally {
      this._isRefreshing = false;
    }
  }

  /**
   * Internal: Register single listener (no mutex)
   */
  async _registerSingleListener(accountId, accountRow = null) {
    try {
      let account;
      if (accountRow) {
        account = accountRow;
      } else {
        account = await zaloInboxRepository.findAccountById(accountId);
        if (!account) {
          console.log(`[ZaloInbox] Account ${accountId} not found or not connected`);
          return false;
        }
      }

      const { id_user: userId } = account;
      console.log(`[ZaloInbox] Processing account ${accountId}, user ${userId}`);

      const session = await zaloPersonalAdapter.getSessionByAccountId(accountId);
      const currentListener = session?.api?.listener || null;
      // Chß╗ë skip khi handler c├▓n gß║»n ─æ├║ng listener cß╗ºa session HIß╗åN Tß║áI.
      // Sau websocket close + restore API mß╗¢i, cß╗¥ registered c┼⌐ tß╗½ng khiß║┐n skip
      // ΓåÆ gß╗¡i tß╗½ web vß║½n ─æ╞░ß╗úc (api.sendMessage) nh╞░ng tin bß║ín b├¿ kh├┤ng vß╗ü hß╗Öp th╞░.
      if (
        isAccountRegistered(accountId)
        && currentListener
        && zaloPersonalAdapter.isHandlerAttachedTo(accountId, currentListener)
      ) {
        console.log(`[ZaloInbox] Account ${accountId} already registered on current listener (skipping)`);
        return true;
      }

      const zaloSettingId = await this.getZaloSettingId(userId, accountId);
      if (!zaloSettingId) {
        console.warn(`[ZaloInbox] Kh├┤ng t├¼m thß║Ñy zalo_setting cho account ${accountId}`);
        return false;
      }

      if (isAccountRegistered(accountId)) {
        console.log(`[ZaloInbox] Re-binding inbox handler for account ${accountId} (session/listener changed)`);
        unmarkAccountRegistered(accountId);
      }

      console.log(`[ZaloInbox] Registering message handler for account ${accountId}`);
      const handler = this.createMessageHandler(userId, accountId, zaloSettingId);
      const success = await zaloPersonalAdapter.registerMessageHandler(userId, accountId, handler);

      if (success) {
        markAccountRegistered(accountId);
        console.log(`[ZaloInbox] Γ£à Successfully registered listener for account ${accountId}`);
      } else {
        console.warn(`[ZaloInbox] Γ¥î Failed to register listener for account ${accountId}`);
      }

      return success;
    } catch (error) {
      // Handle "Already started" error gracefully - don't crash the server
      if (error.message?.includes('Already started')) {
        console.warn(`[ZaloInbox] Account ${accountId} listener already started (ignoring)`);
        markAccountRegistered(accountId);
        return true;
      }
      console.error(`[ZaloInbox] Error registering account ${accountId}:`, error.message);
      // Don't throw - just log and return false to prevent server crash
      return false;
    }
  }

  /**
   * Start service - xß╗¡ l├╜ pending accounts v├á ─æ─âng k├╜ tß║Ñt cß║ú listeners
   */
  async start() {
    console.log('[ZaloInbox] Starting service...');
    
    // Kh├┤i phß╗Ñc sessions tß╗½ DB (cookie_text) - cß║ºn thiß║┐t sau restart
    await this.restoreSessionsFromDb();
    
    // Xß╗¡ l├╜ c├íc accounts mß╗¢i login (query DB v├¼ c├│ thß╗â ch╞░a c├│ trong cache)
    const pendingAccountIds = drainPendingAccounts();
    console.log(`[ZaloInbox] Pending accounts: ${JSON.stringify(pendingAccountIds)}`);
    
    for (const accountId of pendingAccountIds) {
      await this.registerAccountListener(accountId);
    }

    // ─É─âng k├╜ tß║Ñt cß║ú active accounts (d├╣ng cache nß║┐u c├▓n hß║ín)
    await this.registerAllListeners();
    console.log('[ZaloInbox] Service started');
  }

  /**
   * Refresh listeners vß╗¢i force refresh (d├╣ng khi account connect/disconnect)
   */
  async refreshListeners(forceAccountRefresh = false) {
    if (this._isRefreshing) return;
    this._isRefreshing = true;

    try {
      // QUAN TRß╗îNG: Kh├┤i phß╗Ñc sessions tß╗½ DB tr╞░ß╗¢c khi ─æ─âng k├╜ listeners
      // ─Éiß╗üu n├áy cß║ºn thiß║┐t sau restart v├¼ session zca-js chß╗ë l╞░u trong memory
      await this.restoreSessionsFromDb();

      const accounts = await this.getActiveZaloPersonalAccounts(forceAccountRefresh);
      if (accounts.length === 0) return;

      const activeKeys = new Set(accounts.map((a) => String(a.account_id)));
      for (const registeredId of listRegisteredAccounts()) {
        if (!activeKeys.has(String(registeredId))) {
          removeAccount(registeredId);
        }
      }
      for (const registeredId of this._registeredAccounts) {
        if (!activeKeys.has(String(registeredId))) {
          this._registeredAccounts.delete(registeredId);
        }
      }

      await Promise.allSettled(
        accounts.map((acc) => this._registerSingleListener(acc.account_id, acc))
      );
    } finally {
      this._isRefreshing = false;
    }
  }
}

export default new ZaloPersonalInboxService();


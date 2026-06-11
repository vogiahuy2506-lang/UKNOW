/**
 * Zalo Personal Inbox Service
 *
 * Xử lý tin nhắn đến từ Zalo cá nhân qua zca-js event listener.
 *
 * Luồng hoạt động:
 * 1. User login/connect Zalo cá nhân → đăng ký listener
 * 2. Khi có tin nhắn đến → xử lý qua event handler
 * 3. Lưu tin nhắn visitor vào zalo_personal_messages với role='visitor'
 * 4. Tạo conversation nếu chưa có
 * 5. Route đến AI chatbot (nếu có cấu hình cho tài khoản này)
 * 6. Lưu response của AI (role='bot')
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
import {
  drainPendingAccounts,
  markAccountRegistered,
  isAccountRegistered
} from '../zalo/zaloAccountRegistry.service.js';

class ZaloPersonalInboxService {
  constructor() {
    // Map accountId → zalo_setting_id cache
    this.zaloSettingCache = new Map();
    // Cache danh sách active accounts (tránh query DB mỗi 5 phút)
    this._accountCache = {
      data: [],
      timestamp: 0,
      ttlMs: 5 * 60 * 1000, // 5 phút
    };
    // Track accounts đã đăng ký (để tránh duplicate log)
    this._registeredAccounts = new Set();
    // Mutex để tránh race condition khi nhiều cron chạy đồng thời
    this._isRefreshing = false;
    // Cache group info để tránh gọi API nhiều lần
    this._groupNameCache = new Map();
  }

  /**
   * Lấy tên nhóm từ Zalo API (có cache)
   */
  async getGroupName(accountId, groupId) {
    const cacheKey = `group_${accountId}_${groupId}`;
    if (this._groupNameCache.has(cacheKey)) {
      return this._groupNameCache.get(cacheKey);
    }

    const api = zaloAccountSessionService.getAccountApi(accountId);
    if (!api) {
      console.warn(`[ZaloInbox] getGroupName: No API for account ${accountId}`);
      return null;
    }

    try {
      console.log(`[ZaloInbox] getGroupName: Calling API for group ${groupId}`);
      const result = await api.getGroupInfo(groupId);
      console.log(`[ZaloInbox] getGroupName result:`, JSON.stringify(result)?.substring(0, 200));
      
      // Try different response formats
      let groupName = null;
      
      // Format 1: { gridInfoMap: { [groupId]: { name: "..." } } } - ACTUAL FORMAT FROM API
      if (result?.gridInfoMap?.[groupId]?.name) {
        groupName = result.gridInfoMap[groupId].name;
      }
      // Format 2: { gridInfoMap: { [groupId]: { groupName: "..." } } }
      else if (result?.gridInfoMap?.[groupId]?.groupName) {
        groupName = result.gridInfoMap[groupId].groupName;
      }
      // Format 3: { groupName: "..." }
      else if (result?.groupName) {
        groupName = result.groupName;
      }
      // Format 4: { name: "..." }
      else if (result?.name) {
        groupName = result.name;
      }
      // Format 5: { data: { groupName: "..." } }
      else if (result?.data?.groupName) {
        groupName = result.data.groupName;
      }
      // Format 6: { data: { name: "..." } }
      else if (result?.data?.name) {
        groupName = result.data.name;
      }

      if (groupName) {
        this._groupNameCache.set(cacheKey, groupName);
        console.log(`[ZaloInbox] getGroupName(${groupId}) = "${groupName}"`);
      } else {
        console.warn(`[ZaloInbox] getGroupName: No name found in result for ${groupId}`);
      }
      return groupName;
    } catch (err) {
      console.warn(`[ZaloInbox] getGroupName failed for ${groupId}:`, err.message);
      return null;
    }
  }

  /**
   * Lấy thông tin user profile từ uid (có cache)
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
   * Khôi phục zca-js session từ DB (cookie_text) cho các connected accounts
   * Cần gọi khi startup để đảm bảo session được restore sau restart
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

      // Import zaloSettingsController để gọi restore
      console.log('[ZaloInbox] Importing zaloSettingsController...');
      const { default: zaloSettingsController } = await import('../../controllers/zaloSettings.controller.js');
      console.log('[ZaloInbox] zaloSettingsController imported successfully');
      
      for (const account of accounts) {
        // Skip nếu đã có session
        if (zaloAccountSessionService.getAccountApi(account.account_id)) {
          console.log(`[ZaloInbox] Account ${account.account_id} already has active session`);
          continue;
        }

        try {
          console.log(`[ZaloInbox] Restoring session for account ${account.account_id}...`);
          // Tạo mock request/response để gọi restoreAccountSessionByCookie
          // skipMarkDisconnectedOnFail: true → nếu cookie hỏng thoáng qua thì KHÔNG mark
          // disconnected trong DB; giữ nguyên 'connected' để cron retry sau 5 phút.
          // Chỉ mark disconnected khi user chủ động restore từ UI.
          const mockReq = {
            user: { id: account.id_user, role: 'user' },
            params: { id: String(account.account_id) },
            skipMarkDisconnectedOnFail: true,
          };
          const mockRes = {
            status: () => mockRes,
            json: (data) => {
              if (data.success) {
                console.log(`[ZaloInbox] ✅ Restored session for account ${account.account_id}`);
              } else {
                console.log(`[ZaloInbox] ❌ Failed to restore session for account ${account.account_id}: ${data.message}`);
              }
            }
          };
          
          await zaloSettingsController.restoreAccountSessionByCookie(mockReq, mockRes);
        } catch (error) {
          console.error(`[ZaloInbox] Error restoring session for account ${account.account_id}:`, error.message);
        }
      }

      // Log tổng kết
      const successCount = accounts.filter(a => zaloAccountSessionService.getAccountApi(a.account_id)).length;
      if (successCount < accounts.length) {
        console.log(`[ZaloInbox] ⚠️ ${accounts.length - successCount}/${accounts.length} accounts need QR re-scan (cookie expired)`);
        console.log(`[ZaloInbox] 💡 Go to Zalo Settings to scan QR code for affected accounts`);
      }
    } catch (error) {
      console.error('[ZaloInbox] Error in restoreSessionsFromDb:', error.message, error.stack);
    }
    console.log('[ZaloInbox] restoreSessionsFromDb: DONE');
  }

  /**
   * Lấy danh sách accounts từ cache, chỉ query DB khi cache hết hạn
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
   * Invalidate cache khi có account connect/disconnect
   */
  invalidateAccountCache() {
    this._accountCache.timestamp = 0;
    console.log('[ZaloInbox] Account cache invalidated');
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
   * Xác định message type từ Zalo msgType
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
   * Kiểm tra tin nhắn đã được lưu chưa
   */
  async isMessageProcessed(externalId, zaloSettingId) {
    if (!externalId || !zaloSettingId) return false;
    return zaloInboxRepository.isMessageProcessed(externalId, zaloSettingId);
  }

  /**
   * Xử lý một tin nhắn đến từ Zalo cá nhân
   */
  async processIncomingMessage(userId, accountId, zaloSettingId, rawMessage) {
    try {
      const messageId = rawMessage?.msgId || rawMessage?.messageId || rawMessage?.id;
      const senderId = rawMessage?.fromUid || rawMessage?.senderId || rawMessage?.uid;
      let content = rawMessage?.content || rawMessage?.message || rawMessage?.msg || '';
      if (typeof content !== 'string') {
        content = content?.text || content?.message || JSON.stringify(content) || '';
      }
      const timestamp = rawMessage?.timestamp || rawMessage?.time || rawMessage?.createdAt;

      console.log(`[ZaloInbox] processIncomingMessage: msgId=${messageId}, senderId=${senderId}, content="${String(content).substring(0, 50)}"`);

      const zaloThreadType = rawMessage?.type;
      const rawData = rawMessage?._raw || rawMessage;
      const isGroup = zaloThreadType === 1 || zaloThreadType === 2;

      console.log(`[ZaloInbox] DEBUG: isGroup=${isGroup}, zaloThreadType=${zaloThreadType}`);
      console.log(`[ZaloInbox] DEBUG: senderName="${rawMessage?.senderName}", dName="${rawMessage?.dName}"`);

      // Extract groupId for group messages
      let groupId = null;
      if (isGroup) {
        groupId = rawData?.clientGroupId || rawData?.threadId || rawData?.idTo || null;
        if (groupId && !String(groupId).startsWith('g_') && !String(groupId).startsWith('group_')) {
          groupId = `group_${groupId}`;
        }
      }

      // Lấy tên sender từ raw message
      const senderName = rawMessage?.senderName || rawMessage?.dName || null;
      const groupName = rawMessage?.groupName || null;

      console.log(`[ZaloInbox] DEBUG: resolved senderName="${senderName}", groupName="${groupName}", groupId="${groupId}"`);

      // Validate
      if (!messageId) {
        console.warn('[ZaloInbox] Bỏ qua tin nhắn không hợp lệ (no msgId)');
        return;
      }

      if (rawMessage.isSelf === true) {
        console.log(`[ZaloInbox] Bỏ qua tin nhắn tự gửi`);
        return;
      }

      // TEMP: Disable duplicate check to test
      // if (await this.isMessageProcessed(messageId, zaloSettingId)) {
      //   console.log(`[ZaloInbox] Tin nhắn đã xử lý trước đó, bỏ qua: ${messageId}`);
      //   return;
      // }
      console.log(`[ZaloInbox] DEBUG: Skipping isMessageProcessed check (temp disable)`);

      // Determine externalId
      // FIX: groupId already has 'group_' prefix, don't add again
      const externalId = isGroup 
        ? groupId  // groupId is already like "group_7445330951687908000"
        : String(senderId);
      console.log(`[ZaloInbox] DEBUG: externalId="${externalId}"`);

      // Check existing conversation
      let existingConv = null;
      try {
        console.log(`[ZaloInbox] DEBUG: Finding conversation for ${externalId}...`);
        existingConv = await zaloPersonalRepository.findConversation(zaloSettingId, externalId);
        console.log(`[ZaloInbox] DEBUG: existingConv=${existingConv ? 'found' : 'null'}`);
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
            console.log(`[ZaloInbox] Personal message from sender who was in a group - will still route to AI`);
            skipAiRouting = false;
          }
        } catch (e) {
          console.log(`[ZaloInbox] visitor_info parse error: ${e.message}`);
        }
      }

      console.log(`[ZaloInbox] DEBUG: skipAiRouting=${skipAiRouting}, will route to AI=${!skipAiRouting}`);

      // Message type
      const msgType = rawMessage?.msgType || rawMessage?.type || 1;
      const messageType = this.getMessageType(msgType);

      // Resolve sender name via API if not available
      let resolvedSenderName = senderName;
      if (!senderName && senderId) {
        console.log(`[ZaloInbox] Calling getUserProfile for ${senderId}...`);
        try {
          const profile = await this.getUserProfile(accountId, senderId);
          if (profile) {
            resolvedSenderName = profile.displayName || profile.zaloName;
            console.log(`[ZaloInbox] Lấy được tên sender ${senderId}: ${resolvedSenderName}`);
          }
        } catch (e) {
          console.log(`[ZaloInbox] getUserProfile error: ${e.message}`);
        }
      }

      // Resolve group name via API if not available
      let resolvedGroupName = groupName;
      if (isGroup && !groupName && groupId) {
        console.log(`[ZaloInbox] Calling getGroupName for ${groupId}...`);
        try {
          resolvedGroupName = await this.getGroupName(accountId, groupId);
          if (resolvedGroupName) {
            console.log(`[ZaloInbox] Lấy được tên nhóm ${groupId}: ${resolvedGroupName}`);
          }
        } catch (e) {
          console.log(`[ZaloInbox] getGroupName error: ${e.message}`);
        }
      }

      // Display name:
      // - For groups: use group name (resolved or from message)
      // - For personal: use sender name (resolved or from message)
      // IMPORTANT: Don't use "Nhóm group_XXX" format - use "Nhóm" + short ID
      let displayName;
      if (isGroup) {
        if (resolvedGroupName || groupName) {
          displayName = resolvedGroupName || groupName;
        } else {
          // Format: "Nhóm" + last 8 chars of group ID
          const shortId = (groupId || '').replace('group_', '').slice(-8);
          displayName = `Nhóm ${shortId}`;
        }
      } else {
        displayName = resolvedSenderName || senderName || `User ${senderId}`;
      }
      console.log(`[ZaloInbox] DEBUG: final displayName="${displayName}"`);

      // Build visitor info
      const visitorInfo = {
        source: isGroup ? 'zalo_group' : 'zalo_personal',
        message_id: messageId,
        account_id: accountId,
        is_group: isGroup,
        group_id: isGroup ? groupId : null,
        group_name: isGroup ? (resolvedGroupName || groupName) : null,
        sender_id: senderId,
        sender_name: resolvedSenderName || senderName,
        sender_avatar: rawMessage?.senderAvatar || null,
        message_type: messageType,
        attachment_url: rawMessage?.attachmentUrl || null,
      };

      // Create or get conversation
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

      console.log(`[ZaloInbox] Đã lưu tin nhắn từ ${isGroup ? 'nhóm' : 'cá nhân'}: ${String(content || '').substring(0, 50)}...`);

      // Skip AI for group messages
      if (skipAiRouting) {
        console.log(`[ZaloInbox] Skipping AI routing for group message`);
        return;
      }

      // Build AI content
      let aiContent = content?.trim() || '';
      if (messageType === 'sticker') {
        const stickerData = rawMessage.stickerInfo || rawMessage.sticker || {};
        aiContent = `[Sticker] Người dùng gửi một sticker`;
      }
      if (messageType === 'image') {
        aiContent = '[Hình ảnh] Người dùng gửi một hình ảnh';
      }

      if (!aiContent && messageType !== 'sticker' && messageType !== 'image') {
        console.log(`[ZaloInbox] Skipping text message without content`);
        return;
      }

      // Unified chatbot settings
      const chatbotSettings = await chatbotRepository.getSettings(userId, 'zalo_personal');
      const accountSettings = await chatbotZaloAccountRepository.getSettings(userId, zaloSettingId);

      console.log(`[ZaloInbox] DEBUG: chatbotSettings=${JSON.stringify(chatbotSettings)}`);
      console.log(`[ZaloInbox] DEBUG: accountSettings=${JSON.stringify(accountSettings)}`);

      if (!chatbotSettings?.is_enabled) {
        console.log(`[ZaloInbox] AI chatbot disabled for user ${userId}`);
        return;
      }
      if (accountSettings?.is_enabled === false) {
        console.log(`[ZaloInbox] AI chatbot disabled for account ${zaloSettingId}`);
        return;
      }

      // Get AI response using chatRouterService
      console.log(`[ZaloInbox] AI routing message from ${senderId}...`);
      
      // Get conversation history using unifiedInboxRepository
      let conversationHistory = [];
      try {
        const historyResult = await unifiedInboxRepository.getMessages(conversation.id, 'zalo_personal', { limit: 10 });
        conversationHistory = historyResult || [];
        console.log(`[ZaloInbox] Got ${conversationHistory.length} history messages`);
      } catch (e) {
        console.log(`[ZaloInbox] getMessages error: ${e.message}`);
      }
      
      // Route to AI using chatRouterService
      const result = await chatRouterService.routeMessageWithSettings({
        channel: 'zalo_personal',
        userId,
        message: aiContent,
        conversationId: conversation.id,
        chatbotSettings: chatbotSettings,
        visitorInfo: {
          source: 'zalo_personal',
          senderId,
          senderName: resolvedSenderName || senderName,
        },
      });

      console.log(`[ZaloInbox] AI result: type=${result?.type}, hasContent=${!!result?.content}, conversationId=${conversation.id}`);

      if (result?.content) {
        console.log(`[ZaloInbox] AI reply: ${String(result.content).substring(0, 100)}...`);
        await zaloPersonalAdapter.sendReply({
          externalId: String(senderId),
          message: result.content,
          userId,
          accountId: zaloSettingId,
        });
        await unifiedInboxRepository.sendMessage(conversation.id, userId, 'zalo_personal', zaloSettingId, {
          role: 'agent',
          content: result.content,
        });
        sseService.broadcast(String(userId), 'inbox:new_message', {
          conversationId: conversation.id,
          channel: 'zalo_personal',
          message: result.content,
          messageType: 'text',
          role: 'agent',
          senderName: 'AI',
          timestamp: new Date().toISOString(),
        });
      }

    } catch (err) {
      console.error(`[ZaloInbox] ERROR in processIncomingMessage:`, err.stack || err.message);
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
      // For groups: update visitor_name if we have a resolved group name (better than "Nhóm X")
      // For personal: always update visitor_name if changed
      const isExistingGroup = conv.visitor_info?.is_group === true ||
        (typeof conv.visitor_info === 'string' && conv.visitor_info.includes('"is_group":true'));

      // For groups: update name if we have a better (resolved) name
      // For personal: update name if changed
      let newName = null;
      if (isExistingGroup) {
        // For groups: update if current name is just "Nhóm X" (not real name) and we have resolved name
        if (visitorName && conv.visitor_name !== visitorName && conv.visitor_name?.startsWith('Nhóm ')) {
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
   * Backfill tên cho tất cả conversations cũ chưa có tên
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
            // Fallback: use "Nhóm" + short ID
            const shortId = (groupId || '').replace('group_', '').slice(-8);
            displayName = `Nhóm ${shortId}`;
            updatedVisitorInfo.group_name = displayName;
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
   * Tạo message handler cho một account
   */
  createMessageHandler(userId, accountId, zaloSettingId) {
    return async (rawMessage) => {
      await this.processIncomingMessage(userId, accountId, zaloSettingId, rawMessage);
    };
  }

  /**
   * Register listener cho một account cụ thể (public API — delegates to internal).
   * No mutex here; callers (start, refreshListeners) manage concurrency.
   * @param {number} accountId
   * @param {object|null} accountRow - pass sẵn để tránh query lại zalo_settings
   */
  async registerAccountListener(accountId, accountRow = null) {
    return this._registerSingleListener(accountId, accountRow);
  }

  /**
   * Register listeners cho tất cả active accounts (dùng cache, parallel)
   */
  async registerAllListeners() {
    // Skip nếu đang refresh
    if (this._isRefreshing) {
      console.log('[ZaloInbox] Skipping registerAll (already refreshing)');
      return;
    }
    this._isRefreshing = true;

    try {
      // QUAN TRỌNG: Khôi phục sessions từ DB trước khi đăng ký listeners
      // Điều này cần thiết sau restart vì session zca-js chỉ lưu trong memory
      await this.restoreSessionsFromDb();

      const accounts = await this.getActiveZaloPersonalAccounts(true); // force refresh
      console.log(`[ZaloInbox] Found ${accounts.length} active Zalo personal accounts`);
      if (accounts.length === 0) {
        return;
      }

      console.log(`[ZaloInbox] Đăng ký listeners cho ${accounts.length} Zalo personal accounts`);

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
      console.error('[ZaloInbox] Lỗi khi đăng ký listeners:', error.message);
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

      if (isAccountRegistered(accountId)) {
        console.log(`[ZaloInbox] Account ${accountId} already registered (skipping)`);
        return true;
      }

      const zaloSettingId = await this.getZaloSettingId(userId, accountId);
      if (!zaloSettingId) {
        console.warn(`[ZaloInbox] Không tìm thấy zalo_setting cho account ${accountId}`);
        return false;
      }

      console.log(`[ZaloInbox] Registering message handler for account ${accountId}`);
      const handler = this.createMessageHandler(userId, accountId, zaloSettingId);
      const success = await zaloPersonalAdapter.registerMessageHandler(userId, accountId, handler);

      if (success) {
        markAccountRegistered(accountId);
        console.log(`[ZaloInbox] ✅ Successfully registered listener for account ${accountId}`);
      } else {
        console.warn(`[ZaloInbox] ❌ Failed to register listener for account ${accountId}`);
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
   * Register listener cho một account cụ thể (public API)
   */
  async registerAccountListener(accountId, accountRow = null) {
    return this._registerSingleListener(accountId, accountRow);
  }

  /**
   * Start service - xử lý pending accounts và đăng ký tất cả listeners
   */
  async start() {
    console.log('[ZaloInbox] Starting service...');
    
    // Khôi phục sessions từ DB (cookie_text) - cần thiết sau restart
    await this.restoreSessionsFromDb();
    
    // Xử lý các accounts mới login (query DB vì có thể chưa có trong cache)
    const pendingAccountIds = drainPendingAccounts();
    console.log(`[ZaloInbox] Pending accounts: ${JSON.stringify(pendingAccountIds)}`);
    
    for (const accountId of pendingAccountIds) {
      await this.registerAccountListener(accountId);
    }

    // Đăng ký tất cả active accounts (dùng cache nếu còn hạn)
    await this.registerAllListeners();
    console.log('[ZaloInbox] Service started');
  }

  /**
   * Refresh listeners với force refresh (dùng khi account connect/disconnect)
   */
  async refreshListeners(forceAccountRefresh = false) {
    if (this._isRefreshing) return;
    this._isRefreshing = true;

    try {
      // QUAN TRỌNG: Khôi phục sessions từ DB trước khi đăng ký listeners
      // Điều này cần thiết sau restart vì session zca-js chỉ lưu trong memory
      await this.restoreSessionsFromDb();

      const accounts = await this.getActiveZaloPersonalAccounts(forceAccountRefresh);
      if (accounts.length === 0) return;

      // Invalidate registry cho accounts không còn active
      const currentActiveIds = new Set(accounts.map((a) => a.account_id));
      for (const registeredId of this._registeredAccounts) {
        if (!currentActiveIds.has(registeredId)) {
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

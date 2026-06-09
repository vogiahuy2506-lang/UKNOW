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
      // Ensure content is always a string (could be object like {text, type, url})
      if (typeof content !== 'string') {
        content = content?.text || content?.message || JSON.stringify(content) || '';
      }
      const timestamp = rawMessage?.timestamp || rawMessage?.time || rawMessage?.createdAt;

      console.log(`[ZaloInbox] processIncomingMessage: msgId=${messageId}, senderId=${senderId}, content="${String(content).substring(0, 50)}"`);

      // Detect message source: personal chat vs group
      // Use the isGroup from msgData if available, otherwise fallback to raw flags
      const isGroup = rawMessage?.isGroup === true || rawMessage?.is_group === true;
      const groupId = rawMessage?.groupId || rawMessage?.group_id || null;
      const groupName = rawMessage?.groupName || rawMessage?.group_name || null;
      const senderName = rawMessage?.senderName || rawMessage?.sender_name || null;

      console.log(`[ZaloInbox] Source detection: isGroup=${isGroup}, groupId=${groupId}, rawMessage.isGroup=${rawMessage?.isGroup}, rawMessage.is_group=${rawMessage?.is_group}`);

      // Check if this is a group message by checking raw flags
      // Zalo sends group messages with additional context in rawMessage
      const rawData = rawMessage?._raw || rawMessage;
      const clientGroupId = rawData?.clientGroupId || rawData?.gridId || null;
      const idTo = rawData?.idTo || '';
      const threadType = rawData?.threadType;
      
      // Strong indicators of group message
      const hasGroupContext = Boolean(
        clientGroupId || 
        rawData?.isGroup === true ||
        rawData?.isPublicGroup === true ||
        rawData?.isChatRoom === true ||
        rawData?.threadType === 1 ||    // 1 = group in zca-js
        rawData?.threadType === 2 ||    // 2 = community in zca-js
        idTo?.startsWith('g_') ||
        idTo?.startsWith('group_') ||
        idTo?.startsWith('c_')
      );
      
      // If threadType is explicitly set and indicates group, log it
      if (threadType !== undefined) {
        console.log(`[ZaloInbox] threadType=${threadType} detected (0=personal, 1=group, 2=community), hasGroupContext=${hasGroupContext}`);
      }
      
      // If message has group context, skip AI routing (someone texting into a group should NOT get personal reply)
      if (hasGroupContext) {
        console.log(`[ZaloInbox] Skipping AI routing: message has group context (clientGroupId=${clientGroupId}, idTo=${idTo}, threadType=${threadType})`);
        return;
      }

      // Check if this sender has ever been part of a group conversation
      // If yes, skip AI routing (they might be a group member texting personally)
      const existingGroupConv = await zaloPersonalRepository.findGroupConversationBySender(
        zaloSettingId,
        String(senderId)
      );
      if (existingGroupConv) {
        const visitorInfo = existingGroupConv.visitor_info ? JSON.parse(existingGroupConv.visitor_info) : {};
        const prevGroupName = visitorInfo?.group_name || existingGroupConv.visitor_name || 'group';
        console.log(`[ZaloInbox] Skipping AI routing: sender ${senderId} was previously in ${prevGroupName}`);
        return;
      }
      
      // Additional check: look at conversation history to see if this externalId was ever marked as group
      const existingConv = await zaloPersonalRepository.findConversation(zaloSettingId, String(senderId));
      if (existingConv?.visitor_info) {
        try {
          const convInfo = typeof existingConv.visitor_info === 'string' 
            ? JSON.parse(existingConv.visitor_info) 
            : existingConv.visitor_info;
          if (convInfo?.is_group === true) {
            const prevGroupName = convInfo?.group_name || 'group';
            console.log(`[ZaloInbox] Skipping AI routing: sender ${senderId} was previously in group ${prevGroupName}`);
            return;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Build message type
      const msgType = rawMessage?.msgType || rawMessage?.type || 1;
      const messageType = this.getMessageType(msgType);

      // Validate - chỉ bỏ qua nếu không có content text
      if (!messageId) {
        console.warn('[ZaloInbox] Bỏ qua tin nhắn không hợp lệ (no msgId)');
        return;
      }

      // Bỏ qua tin nhắn tự gửi
      if (rawMessage.isSelf === true) {
        console.log(`[ZaloInbox] Bỏ qua tin nhắn tự gửi`);
        return;
      }

      // Kiểm tra trùng lặp
      if (await this.isMessageProcessed(messageId, zaloSettingId)) {
        return;
      }

      // Xác định externalId dựa trên nguồn: 
      // - Group: dùng senderId để phân biệt từng người trong nhóm
      // - Personal: dùng senderId
      // Format group message: "group_{groupId}_{senderId}" để tránh trùng lặp
      const externalId = isGroup 
        ? `group_${groupId}_${senderId}` 
        : String(senderId);

      // Lấy tên nhóm nếu là group message và không có sẵn
      let resolvedGroupName = groupName;
      if (isGroup && !groupName && groupId) {
        resolvedGroupName = await this.getGroupName(accountId, groupId);
        if (resolvedGroupName) {
          console.log(`[ZaloInbox] Lấy được tên nhóm ${groupId}: ${resolvedGroupName}`);
        }
      }

      // Lấy tên sender từ API nếu không có sẵn
      let resolvedSenderName = senderName;
      if (!senderName && senderId) {
        const profile = await this.getUserProfile(accountId, senderId);
        if (profile) {
          resolvedSenderName = profile.displayName || profile.zaloName;
          console.log(`[ZaloInbox] Lấy được tên sender ${senderId}: ${resolvedSenderName}`);
        }
      }

      // Xác định tên hiển thị cho conversation
      // - Group: hiển thị tên người gửi + tên nhóm
      // - Personal: hiển thị tên người gửi
      let displayName;
      if (isGroup) {
        const senderDisplay = resolvedSenderName || senderName || `User ${senderId}`;
        const groupDisplay = resolvedGroupName || groupName || `Nhóm ${groupId}`;
        displayName = `${senderDisplay} (${groupDisplay})`;
      } else {
        displayName = resolvedSenderName || senderName || `User ${senderId}`;
      }

      // Build visitor info với đầy đủ metadata
      const visitorInfo = {
        source: isGroup ? 'zalo_group' : 'zalo_personal',
        message_id: messageId,
        account_id: accountId,
        is_group: isGroup,
        // Group info
        group_id: groupId,
        group_name: resolvedGroupName || groupName,
        // Sender info
        sender_id: senderId,
        sender_name: resolvedSenderName || senderName,
        sender_avatar: rawMessage?.senderAvatar || null,
        // Message info
        message_type: messageType,
        attachment_url: rawMessage?.attachmentUrl || null,
      };

      // Tạo hoặc lấy conversation
      const conversation = await this.getOrCreateConversation(zaloSettingId, userId, externalId, displayName, visitorInfo);

      // Broadcast SSE event to frontend for real-time update
      // Note: Message đã được lưu bởi zaloPersonal.adapter.js saveMessageToDatabase()
      sseService.broadcast(String(userId), 'inbox:new_message', {
        conversationId: conversation.id,
        channel: 'zalo_personal',
        message: content,
        senderId: senderId,
        senderName: resolvedSenderName || senderName,
        timestamp,
      });

      const sourceType = isGroup ? `nhóm ${groupName || groupId}` : `cá nhân ${senderId}`;
      console.log(`[ZaloInbox] Đã lưu tin nhắn từ ${sourceType}: ${String(content || '').substring(0, 50)}...`);

      // Skip AI routing for group messages - only reply personal chats
      // Use hasGroupContext as backup check (catches cases where isGroup=false but group indicators exist)
      if (isGroup || hasGroupContext) {
        console.log(`[ZaloInbox] Skipping AI routing for group message (isGroup=${isGroup}, hasGroupContext=${hasGroupContext}, groupId: ${groupId || clientGroupId})`);
        return;
      }

      // Build smart content for AI - handle non-text messages intelligently
      let aiContent = content?.trim() || '';

      // Handle sticker messages - convert to text description for AI
      if (messageType === 'sticker') {
        const stickerData = rawMessage.stickerInfo || rawMessage.sticker || {};
        const stickerId = stickerData.sticker_id || stickerData.id || 'unknown';
        const stickerPkgId = stickerData.package_id || stickerData.pkgId || '';
        aiContent = `[Sticker] Người dùng gửi một sticker (package: ${stickerPkgId}, id: ${stickerId})`;
      }

      // Handle image messages
      if (messageType === 'image') {
        aiContent = '[Hình ảnh] Người dùng gửi một hình ảnh';
      }

      // Skip text messages without content, but allow sticker/image to proceed
      if (!aiContent && messageType !== 'sticker' && messageType !== 'image') {
        console.log(`[ZaloInbox] Skipping text message without content`);
        return;
      }

      // Unified chatbot settings (shared across all channels)
      // Use 'zalo_personal' channel to get shared AI config saved from ChatbotSettings
      const chatbotSettings = await chatbotRepository.getSettings(userId, 'zalo_personal');

      // Check per-account enable/disable
      const accountSettings = await chatbotZaloAccountRepository.getSettings(userId, zaloSettingId);

      // If chatbot is not enabled for this account, skip
      if (!accountSettings?.is_enabled) {
        console.log(`[ZaloInbox] Chatbot is disabled for account ${zaloSettingId} - skipping AI routing`);
        return;
      }

      // Override is_enabled with account-specific setting
      const finalSettings = {
        ...chatbotSettings,
        is_enabled: accountSettings.is_enabled,
      };

      console.log(`[ZaloInbox] Final chatbotSettings for userId=${userId}, zaloSettingId=${zaloSettingId}:`, JSON.stringify(finalSettings));

      // Route đến AI chatbot với cấu hình riêng của tài khoản
      console.log(`[ZaloInbox] ✅ is_enabled=true, calling chatRouterService... content="${String(content).substring(0, 100)}"`);
      try {
        console.log(`[ZaloInbox] >>> Before chatRouterService call`);
        
        // Determine if this is truly a group message
        // Use hasGroupContext as the authoritative check for blocking group AI replies
        const isGroupMessage = isGroup || hasGroupContext;
        const effectiveGroupId = groupId || clientGroupId || null;
        
        // If it's a group message, do NOT route to AI at all
        if (isGroupMessage) {
          console.log(`[ZaloInbox] ❌ Blocking AI route: detected as group message (isGroup=${isGroup}, hasGroupContext=${hasGroupContext}, groupId=${effectiveGroupId})`);
          return;
        }
        
        const result = await chatRouterService.routeMessageWithSettings({
          channel: 'zalo_personal',
          userId,
          message: aiContent,
          conversationId: conversation.id,
          chatbotSettings: finalSettings,
          visitorInfo: {
            source: 'zalo_personal',
            senderId,
            accountId: zaloSettingId,
          },
        });
        console.log(`[ZaloInbox] <<< After chatRouterService call, result=`, JSON.stringify(result));

        // Gửi reply nếu AI có response
        if (result.type === 'text' && result.content) {
          const sendResult = await zaloPersonalAdapter.sendReply({
            externalId: String(senderId),
            message: result.content,
            userId,
            accountId: zaloSettingId,
            conversationInfo: {
              is_group: false, // Explicitly false - we already filtered out group messages
              group_id: null,
            },
          });

          if (sendResult.success) {
            // Message đã được lưu bởi zaloPersonalAdapter.sendReply()
            console.log(`[ZaloInbox] Đã gửi reply cho ${senderId}`);
          } else {
            console.warn(`[ZaloInbox] Gửi reply thất bại: ${sendResult.error}`);
          }
        }
      } catch (aiError) {
        console.error('[ZaloInbox] Lỗi khi route đến AI:', aiError.message);
      }
    } catch (error) {
      console.error('[ZaloInbox] Lỗi xử lý tin nhắn:', error.stack || error.message);
    }
  }

  /**
   * Get or create conversation for Zalo Personal
   */
  async getOrCreateConversation(zaloSettingId, userId, externalId, visitorName, visitorInfo) {
    // Try to find existing conversation
    const conv = await zaloInboxRepository.findConversation(zaloSettingId, externalId);

    if (conv) {
      const newName = (visitorName && conv.visitor_name !== visitorName) ? visitorName : null;
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

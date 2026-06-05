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
 * 5. Route đến AI chatbot (nếu có cấu hình)
 * 6. Lưu response của AI (role='bot')
 */
import db from '../../config/database.js';
import zaloPersonalAdapter from './channelAdapters/zaloPersonal.adapter.js';
import chatRouterService from './chatRouter.service.js';
import zaloAccountSessionService from '../zalo/zaloAccountSession.service.js';
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
  }

  /**
   * Khôi phục zca-js session từ DB (cookie_text) cho các connected accounts
   * Cần gọi khi startup để đảm bảo session được restore sau restart
   */
  async restoreSessionsFromDb() {
    console.log('[ZaloInbox] restoreSessionsFromDb: STARTING');
    try {
      const { rows: accounts } = await db.query(
        `SELECT zs.id as account_id, zs.id_user, zs.cookie_text
         FROM zalo_settings zs
         WHERE zs.is_active = true AND zs.status = 'connected' AND zs.cookie_text IS NOT NULL`
      );

      console.log(`[ZaloInbox] Found ${accounts.length} accounts to restore sessions`);

      if (accounts.length === 0) return;

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
          const mockReq = {
            user: { id: account.id_user, role: 'user' },
            params: { id: String(account.account_id) }
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
    const { rows } = await db.query(
      `SELECT zs.id as account_id, zs.id_user, zs.display_name as account_display_name,
              zs.zalo_name, zs.zalo_user_id, zs.status as account_status
       FROM zalo_settings zs
       WHERE zs.is_active = true AND zs.status = 'connected'`
    );
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
    const { rows } = await db.query(
      `SELECT id FROM zalo_settings 
       WHERE id = $1 AND id_user = $2 AND is_active = true AND status = 'connected'`,
      [accountId, userId]
    );

    if (rows[0]) {
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
    const { rows } = await db.query(
      `SELECT 1 FROM zalo_personal_messages
       WHERE external_id = $1 AND id_zalo_setting = $2
       LIMIT 1`,
      [externalId, zaloSettingId]
    );
    return rows.length > 0;
  }

  /**
   * Lưu tin nhắn visitor vào zalo_personal_messages
   */
  async saveIncomingMessage(conversationId, zaloSettingId, userId, message, externalId, externalTs, rawData) {
    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO zalo_personal_messages 
       (id_conversation, id_user, id_zalo_setting, role, content, message_type, external_id, external_ts, metadata, created_at)
       VALUES ($1, $2, $3, 'visitor', $4, 'text', $5, $6, $7, $8)`,
      [
        conversationId,
        userId,
        zaloSettingId,
        message,
        externalId,
        externalTs ? new Date(externalTs) : now,
        JSON.stringify({ _raw: rawData }),
        now,
      ]
    );
    // Update conversation last_message_at
    await db.query(
      `UPDATE zalo_personal_conversations SET last_message_at = $2 WHERE id = $1`,
      [conversationId, now]
    );
  }

  /**
   * Lưu response của bot vào zalo_personal_messages
   */
  async saveBotResponse(conversationId, zaloSettingId, userId, content) {
    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO zalo_personal_messages 
       (id_conversation, id_user, id_zalo_setting, role, content, message_type, created_at)
       VALUES ($1, $2, $3, 'bot', $4, 'text', $5)`,
      [conversationId, userId, zaloSettingId, content, now]
    );
    await db.query(
      `UPDATE zalo_personal_conversations SET last_message_at = $2 WHERE id = $1`,
      [conversationId, now]
    );
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

      // Detect message source: personal chat vs group
      const isGroup = rawMessage?.isGroup === true;
      const groupId = rawMessage?.groupId || null;
      const groupName = rawMessage?.groupName || null;
      const senderName = rawMessage?.senderName || null;

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

      // Xác định externalId dựa trên nguồn: group message dùng groupId, personal dùng senderId
      const externalId = isGroup ? String(groupId) : String(senderId);

      // Build visitor info với đầy đủ metadata
      const visitorInfo = {
        source: isGroup ? 'zalo_group' : 'zalo_personal',
        message_id: messageId,
        account_id: accountId,
        is_group: isGroup,
        // Group info
        group_id: groupId,
        group_name: groupName,
        // Sender info
        sender_id: senderId,
        sender_name: senderName,
        sender_avatar: rawMessage?.senderAvatar || null,
        // Message info
        message_type: messageType,
        attachment_url: rawMessage?.attachmentUrl || null,
      };

      // Tạo hoặc lấy conversation
      const conversation = await this.getOrCreateConversation(zaloSettingId, userId, externalId, isGroup ? groupName : senderName, visitorInfo);

      // Lưu tin nhắn visitor (lưu cả raw message để giữ thông tin gốc)
      await this.saveIncomingMessage(
        conversation.id,
        zaloSettingId,
        userId,
        content,
        messageId,
        timestamp,
        rawMessage
      );

      const sourceType = isGroup ? `nhóm ${groupName || groupId}` : `cá nhân ${senderId}`;
      console.log(`[ZaloInbox] Đã lưu tin nhắn từ ${sourceType}: ${String(content || '').substring(0, 50)}...`);

      // Chỉ route đến AI chatbot cho tin nhắn text từ cá nhân
      // Không tự động reply trong nhóm để tránh spam

      // Route đến AI chatbot
      try {
        const result = await chatRouterService.routeMessage({
          channel: 'zalo_personal',
          userId,
          message: content,
          conversationId: conversation.id,
          visitorInfo: {
            source: 'zalo_personal',
            senderId,
          },
        });

        // Gửi reply nếu AI có response
        if (result.type === 'text' && result.content) {
          const sendResult = await zaloPersonalAdapter.sendReply({
            externalId: String(senderId),
            message: result.content,
            userId,
          });

          if (sendResult.success) {
            await this.saveBotResponse(conversation.id, zaloSettingId, userId, result.content);
            console.log(`[ZaloInbox] Đã gửi reply cho ${senderId}`);
          } else {
            console.warn(`[ZaloInbox] Gửi reply thất bại: ${sendResult.error}`);
          }
        }
      } catch (aiError) {
        console.error('[ZaloInbox] Lỗi khi route đến AI:', aiError.message);
      }
    } catch (error) {
      console.error('[ZaloInbox] Lỗi xử lý tin nhắn:', error.message);
    }
  }

  /**
   * Get or create conversation for Zalo Personal
   */
  async getOrCreateConversation(zaloSettingId, userId, externalId, visitorName, visitorInfo) {
    // Try to find existing conversation
    const { rows: existing } = await db.query(
      `SELECT * FROM zalo_personal_conversations 
       WHERE id_zalo_setting = $1 AND external_id = $2`,
      [zaloSettingId, externalId]
    );

    if (existing[0]) {
      // Update visitor_name if changed (e.g., user changed their Zalo name)
      const conv = existing[0];
      if (visitorName && conv.visitor_name !== visitorName) {
        await db.query(
          `UPDATE zalo_personal_conversations SET visitor_name = $1 WHERE id = $2`,
          [visitorName, conv.id]
        );
        conv.visitor_name = visitorName;
      }
      // Update visitor_info if provided
      if (visitorInfo && JSON.stringify(visitorInfo) !== JSON.stringify(conv.visitor_info)) {
        await db.query(
          `UPDATE zalo_personal_conversations SET visitor_info = $1 WHERE id = $2`,
          [JSON.stringify(visitorInfo), conv.id]
        );
      }
      return conv;
    }

    // Create new conversation
    const { rows } = await db.query(
      `INSERT INTO zalo_personal_conversations 
       (id_user, id_zalo_setting, external_id, visitor_name, visitor_info, last_message_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [userId, zaloSettingId, externalId, visitorName, JSON.stringify(visitorInfo)]
    );

    return rows[0];
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
   * Register listener cho một account cụ thể
   * @param {number} accountId
   * @param {object|null} accountRow - pass sẵn để tránh query lại zalo_settings
   */
  async registerAccountListener(accountId, accountRow = null) {
    // Mutex: tránh race condition khi cron chạy overlap
    if (this._isRefreshing) {
      console.log(`[ZaloInbox] Skipping register (isRefreshing=true) for account ${accountId}`);
      return;
    }
    this._isRefreshing = true;

    try {
      // Lấy account info từ cache hoặc query
      let account;
      if (accountRow) {
        account = accountRow;
      } else {
        const result = await db.query(
          `SELECT zs.id, zs.id_user, zs.display_name
           FROM zalo_settings zs
           WHERE zs.id = $1 AND zs.is_active = true AND zs.status = 'connected'`,
          [accountId]
        );
        if (!result.rows[0]) {
          console.log(`[ZaloInbox] Account ${accountId} not found or not connected`);
          return false;
        }
        account = result.rows[0];
      }

      const { id_user: userId } = account;
      console.log(`[ZaloInbox] Processing account ${accountId}, user ${userId}`);

      // Skip nếu đã registered (dùng zaloAccountRegistry)
      if (isAccountRegistered(accountId)) {
        console.log(`[ZaloInbox] Account ${accountId} already registered (skipping)`);
        return true;
      }

      // Verify account is valid
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
      console.error(`[ZaloInbox] Error registering account ${accountId}:`, error.message);
      return false;
    } finally {
      this._isRefreshing = false;
    }
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
        const result = await db.query(
          `SELECT zs.id, zs.id_user, zs.display_name
           FROM zalo_settings zs
           WHERE zs.id = $1 AND zs.is_active = true AND zs.status = 'connected'`,
          [accountId]
        );
        if (!result.rows[0]) {
          console.log(`[ZaloInbox] Account ${accountId} not found or not connected`);
          return false;
        }
        account = result.rows[0];
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
      console.error(`[ZaloInbox] Error registering account ${accountId}:`, error.message);
      throw error;
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

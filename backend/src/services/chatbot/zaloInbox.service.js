/**
 * Zalo Personal Inbox Service
 *
 * Xử lý tin nhắn đến từ Zalo cá nhân qua zca-js event listener.
 *
 * Luồng hoạt động:
 * 1. User login/connect Zalo cá nhân → đăng ký listener
 * 2. Khi có tin nhắn đến → xử lý qua event handler
 * 3. Lưu tin nhắn visitor vào channel_messages với role='visitor'
 * 4. Tạo conversation nếu chưa có
 * 5. Route đến AI chatbot (nếu có cấu hình)
 * 6. Lưu response của AI (role='bot')
 */
import db from '../../config/database.js';
import zaloPersonalAdapter from './channelAdapters/zaloPersonal.adapter.js';
import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
import chatRouterService from './chatRouter.service.js';
import {
  drainPendingAccounts,
  markAccountRegistered,
  isAccountRegistered
} from '../zalo/zaloAccountRegistry.service.js';

class ZaloPersonalInboxService {
  constructor() {
    // Map accountId → channelId cache
    this.channelIdCache = new Map();
    // Cache danh sách active accounts (tránh query DB mỗi 30s)
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
   * Get channel_id for a zalo_personal account
   * Creates channel_connections entry if not exists
   */
  async getOrCreateChannelId(userId, accountId) {
    const cacheKey = `${userId}_${accountId}`;
    if (this.channelIdCache.has(cacheKey)) {
      return this.channelIdCache.get(cacheKey);
    }

    // First try to find existing channel connection
    const existing = await db.query(
      `SELECT cc.id, cc.credentials
       FROM channel_connections cc
       WHERE cc.channel = 'zalo_personal' 
         AND cc.credentials->>'zalo_account_id' = $1`,
      [String(accountId)]
    );

    if (existing.rows[0]) {
      const channelId = existing.rows[0].id;
      this.channelIdCache.set(cacheKey, channelId);
      return channelId;
    }

    // Create new channel connection
    const { rows } = await db.query(
      `INSERT INTO channel_connections (id_user, channel, display_name, credentials, is_active)
       VALUES ($1, 'zalo_personal', $2, $3, true)
       ON CONFLICT (id_user, channel) DO UPDATE SET
         credentials = EXCLUDED.credentials,
         is_active = true,
         updated_at = NOW()
       RETURNING id`,
      [userId, 'Zalo cá nhân', JSON.stringify({ zalo_account_id: String(accountId) })]
    );

    const channelId = rows[0]?.id;
    if (channelId) {
      this.channelIdCache.set(cacheKey, channelId);
    }
    return channelId;
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
  async isMessageProcessed(externalId, channelId) {
    if (!externalId || !channelId) return false;
    const { rows } = await db.query(
      `SELECT 1 FROM channel_messages
       WHERE external_id = $1 AND id_channel = $2
       LIMIT 1`,
      [externalId, channelId]
    );
    return rows.length > 0;
  }

  /**
   * Lưu tin nhắn visitor vào channel_messages
   */
  async saveIncomingMessage(conversationId, channelId, userId, message, externalId, externalTs, rawData) {
    await chatbotRepository.addChannelMessage(conversationId, userId, channelId, {
      role: 'visitor',
      content: message,
      message_type: 'text',
      external_id: externalId,
      external_ts: externalTs ? new Date(externalTs) : new Date(),
      raw_data: rawData,
    });
  }

  /**
   * Lưu response của bot vào channel_messages
   */
  async saveBotResponse(conversationId, channelId, userId, content) {
    await chatbotRepository.addChannelMessage(conversationId, userId, channelId, {
      role: 'bot',
      content,
      message_type: 'text',
    });
  }

  /**
   * Xử lý một tin nhắn đến từ Zalo cá nhân
   */
  async processIncomingMessage(userId, accountId, channelId, rawMessage) {
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
      if (await this.isMessageProcessed(messageId, channelId)) {
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
      // Với group: conversation được tạo theo groupId
      // Với personal: conversation được tạo theo senderId
      const conversation = await chatbotRepository.getOrCreateChannelConversation({
        channelId,
        userId,
        externalId: externalId,
        visitorName: isGroup ? groupName : senderName,
        visitorInfo: visitorInfo,
      });

      // Lưu tin nhắn visitor (lưu cả raw message để giữ thông tin gốc)
      await this.saveIncomingMessage(
        conversation.id,
        channelId,
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
            await this.saveBotResponse(conversation.id, channelId, userId, result.content);
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
   * Tạo message handler cho một account
   */
  createMessageHandler(userId, accountId, channelId) {
    return async (rawMessage) => {
      await this.processIncomingMessage(userId, accountId, channelId, rawMessage);
    };
  }

  /**
   * Register listener cho một account cụ thể
   * @param {number} accountId
   * @param {object|null} accountRow - pass sẵn để tránh query lại zalo_settings
   */
  async registerAccountListener(accountId, accountRow = null) {
    // Mutex: tránh race condition khi cron chạy overlap
    if (this._isRefreshing) return;
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
        if (!result.rows[0]) return false;
        account = result.rows[0];
      }

      const { id_user: userId } = account;

      // Chỉ log lần đầu đăng ký
      if (!this._registeredAccounts.has(accountId)) {
        console.log(`[ZaloInbox] Đăng ký listener cho account ${accountId}, user ${userId}`);
        this._registeredAccounts.add(accountId);
      }

      // Skip nếu đã registered (dùng zaloAccountRegistry)
      if (isAccountRegistered(accountId)) {
        return true;
      }

      // Get or create channel_id
      const channelId = await this.getOrCreateChannelId(userId, accountId);
      if (!channelId) {
        console.warn(`[ZaloInbox] Không thể tạo channel_id cho account ${accountId}`);
        return false;
      }

      const handler = this.createMessageHandler(userId, accountId, channelId);
      const success = await zaloPersonalAdapter.registerMessageHandler(userId, accountId, handler);

      if (success) {
        markAccountRegistered(accountId);
      }

      return success;
    } finally {
      this._isRefreshing = false;
    }
  }

  /**
   * Register listeners cho tất cả active accounts (dùng cache, parallel)
   */
  async registerAllListeners() {
    try {
      const accounts = await this.getActiveZaloPersonalAccounts();
      if (accounts.length === 0) {
        return;
      }

      console.log(`[ZaloInbox] Đăng ký listeners cho ${accounts.length} Zalo personal accounts`);

      // Parallel register - Promise.allSettled để không fail toàn bộ nếu 1 account lỗi
      await Promise.allSettled(
        accounts.map((acc) => this.registerAccountListener(acc.account_id, acc))
      );
    } catch (error) {
      console.error('[ZaloInbox] Lỗi khi đăng ký listeners:', error.message);
    }
  }

  /**
   * Start service - xử lý pending accounts và đăng ký tất cả listeners
   */
  async start() {
    // Xử lý các accounts mới login (query DB vì có thể chưa có trong cache)
    const pendingAccountIds = drainPendingAccounts();
    for (const accountId of pendingAccountIds) {
      await this.registerAccountListener(accountId);
    }

    // Đăng ký tất cả active accounts (dùng cache nếu còn hạn)
    await this.registerAllListeners();
  }

  /**
   * Refresh listeners với force refresh (dùng khi account connect/disconnect)
   */
  async refreshListeners(forceAccountRefresh = false) {
    if (this._isRefreshing) return;
    this._isRefreshing = true;

    try {
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
        accounts.map((acc) => this.registerAccountListener(acc.account_id, acc))
      );
    } finally {
      this._isRefreshing = false;
    }
  }
}

export default new ZaloPersonalInboxService();

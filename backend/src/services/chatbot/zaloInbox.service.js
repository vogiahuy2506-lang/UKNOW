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
   * Lấy tất cả users có Zalo cá nhân đang active từ bảng zalo_settings
   */
  async getActiveZaloPersonalAccounts() {
    const { rows } = await db.query(
      `SELECT zs.id as account_id, zs.id_user, zs.display_name as account_display_name,
              zs.zalo_name, zs.zalo_user_id, zs.status as account_status
       FROM zalo_settings zs
       WHERE zs.is_active = true AND zs.status = 'connected'`
    );
    return rows;
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
  async saveIncomingMessage(conversationId, channelId, userId, message, externalId, externalTs) {
    await chatbotRepository.addChannelMessage(conversationId, userId, channelId, {
      role: 'visitor',
      content: message,
      message_type: 'text',
      external_id: externalId,
      external_ts: externalTs ? new Date(externalTs) : new Date(),
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

      // Validate
      if (!messageId || !content) {
        console.warn('[ZaloInbox] Bỏ qua tin nhắn không hợp lệ');
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

      // Tạo hoặc lấy conversation
      const conversation = await chatbotRepository.getOrCreateChannelConversation({
        channelId,
        userId,
        externalId: String(senderId),
        visitorName: null,
        visitorInfo: {
          source: 'zalo_personal',
          message_id: messageId,
          account_id: accountId,
        },
      });

      // Lưu tin nhắn visitor
      await this.saveIncomingMessage(
        conversation.id,
        channelId,
        userId,
        content,
        messageId,
        timestamp
      );

      console.log(`[ZaloInbox] Đã lưu tin nhắn từ ${senderId}: ${content.substring(0, 50)}...`);

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
   */
  async registerAccountListener(accountId) {
    const account = await db.query(
      `SELECT zs.id, zs.id_user, zs.display_name
       FROM zalo_settings zs
       WHERE zs.id = $1 AND zs.is_active = true AND zs.status = 'connected'`,
      [accountId]
    );

    if (!account.rows[0]) {
      console.warn(`[ZaloInbox] Không tìm thấy account Zalo ${accountId}`);
      return false;
    }

    const { id_user: userId } = account.rows[0];

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
      console.log(`[ZaloInbox] Đã đăng ký listener cho account ${accountId}, user ${userId}, channel ${channelId}`);
    }

    return success;
  }

  /**
   * Register listeners cho tất cả active accounts
   */
  async registerAllListeners() {
    try {
      const accounts = await this.getActiveZaloPersonalAccounts();
      if (accounts.length === 0) {
        return;
      }

      console.log(`[ZaloInbox] Đăng ký listeners cho ${accounts.length} Zalo personal accounts`);

      for (const acc of accounts) {
        if (isAccountRegistered(acc.account_id)) {
          continue;
        }

        await this.registerAccountListener(acc.account_id);
      }
    } catch (error) {
      console.error('[ZaloInbox] Lỗi khi đăng ký listeners:', error.message);
    }
  }

  /**
   * Start service - xử lý pending accounts và đăng ký tất cả listeners
   */
  async start() {
    // Xử lý các accounts mới login
    const pendingAccountIds = drainPendingAccounts();
    for (const accountId of pendingAccountIds) {
      await this.registerAccountListener(accountId);
    }

    // Đăng ký tất cả active accounts
    await this.registerAllListeners();
  }
}

export default new ZaloPersonalInboxService();

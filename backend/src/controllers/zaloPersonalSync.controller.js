/**
 * Zalo Personal Sync Controller
 * 
 * API endpoints để đồng bộ danh sách bạn bè, nhóm từ Zalo Web
 */
import zaloPersonalSyncService from '../services/chatbot/zaloPersonalSync.service.js';
import zaloAccountSessionService from '../services/zalo/zaloAccountSession.service.js';
import zaloSettingRepository from '../repositories/zalo/zaloSetting.repository.js';

class ZaloPersonalSyncController {
  /**
   * GET /api/chatbot/zalo-personal/sync
   * Full sync - đồng bộ bạn bè và nhóm
   */
  async sync(req, res) {
    try {
      const userId = req.user.id;
      console.log('[ZaloPersonalSync] sync called for userId:', userId);

      // Get active Zalo personal account
      const account = await zaloSettingRepository.findActiveConnectedAccountByUser(userId).catch(e => {
        console.error('[ZaloPersonalSync] DB query error:', e.message);
        e.isDatabaseError = true;
        throw e;
      });

      console.log('[ZaloPersonalSync] Found account:', account ? { id: account.id, status: account.status } : null);

      if (!account) {
        return res.status(400).json({
          success: false,
          message: 'Không có tài khoản Zalo cá nhân nào đang kết nối. Vui lòng kết nối Zalo trong Cài đặt.',
        });
      }

      const accountId = account.id;
      
      // Check if zca-js session exists
      const api = zaloAccountSessionService.getAccountApi(accountId);
      console.log('[ZaloPersonalSync] zca-js session exists:', !!api);
      
      if (!api) {
        return res.status(400).json({
          success: false,
          message: 'Session Zalo đã hết hạn. Vui lòng quét QR đăng nhập lại trong Cài đặt Zalo.',
          errorCode: 'SESSION_EXPIRED',
        });
      }

      const result = await zaloPersonalSyncService.fullSync(accountId, userId);
      console.log('[ZaloPersonalSync] sync result:', JSON.stringify(result));

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[ZaloPersonalSyncController] sync error:', error);
      if (error.isDatabaseError) {
        return res.status(500).json({
          success: false,
          message: 'Database error: ' + error.message,
        });
      }
      res.status(500).json({
        success: false,
        message: error.message || 'Sync thất bại',
      });
    }
  }

  /**
   * GET /api/chatbot/zalo-personal/sync/contacts
   * Chỉ đồng bộ danh sách bạn bè
   */
  async syncContacts(req, res) {
    try {
      const userId = req.user.id;

      const account = await zaloSettingRepository.findActiveConnectedAccountSummaryByUser(userId);

      if (!account) {
        return res.status(400).json({
          success: false,
          message: 'Không có tài khoản Zalo cá nhân nào đang kết nối',
        });
      }

      const result = await zaloPersonalSyncService.syncContacts(account.id, userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[ZaloPersonalSyncController] syncContacts error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Sync contacts thất bại',
      });
    }
  }

  /**
   * GET /api/chatbot/zalo-personal/sync/groups
   * Chỉ đồng bộ danh sách nhóm
   */
  async syncGroups(req, res) {
    try {
      const userId = req.user.id;

      const account = await zaloSettingRepository.findActiveConnectedAccountSummaryByUser(userId);

      if (!account) {
        return res.status(400).json({
          success: false,
          message: 'Không có tài khoản Zalo cá nhân nào đang kết nối',
        });
      }

      const result = await zaloPersonalSyncService.syncGroups(account.id, userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[ZaloPersonalSyncController] syncGroups error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Sync groups thất bại',
      });
    }
  }

  /**
   * GET /api/chatbot/zalo-personal/sync/status
   * Kiểm tra trạng sync + thử restore session nếu chưa active
   * Returns ALL connected accounts (not just one)
   */
  async getSyncStatus(req, res) {
    try {
      const userId = req.user.id;

      const accounts = await zaloSettingRepository.findActiveConnectedAccountsByUser(userId);

      if (!accounts.length) {
        return res.json({
          success: true,
          data: { connected: false, message: 'Không có tài khoản Zalo nào kết nối', accounts: [] },
        });
      }

      // Thử restore session cho từng account nếu chưa có API active (sau restart server)
      const { restoreZaloSessionFromCookie } = await import('../utils/zaloSessionRestore.util.js');
      
      const accountsWithSession = await Promise.all(accounts.map(async (account) => {
        let api = zaloAccountSessionService.getAccountApi(account.id);
        if (!api) {
          console.log(`[ZaloSyncStatus] Session not in memory for account ${account.id}, attempting restore...`);
          api = await restoreZaloSessionFromCookie(account.cookie_text || account.cookieText);
          if (api) {
            zaloAccountSessionService.setAccountApi(account.id, api);
            console.log(`[ZaloSyncStatus] ✅ Session restored for account ${account.id}`);
          } else {
            // Session restore failed - mark as disconnected in DB
            console.log(`[ZaloSyncStatus] ❌ Session restore failed for account ${account.id}, marking disconnected`);
            await zaloSettingRepository.markAccountDisconnected(account.id_user, account.id);
            zaloAccountSessionService.clearAccountApi(account.id);
          }
        }
        return {
          id: account.id,
          displayName: account.display_name,
          conversationCount: parseInt(account.conversation_count),
          hasActiveSession: !!api,
        };
      }));

      const failedCount = accountsWithSession.filter(a => !a.hasActiveSession).length;
      const successCount = accountsWithSession.filter(a => a.hasActiveSession).length;

      res.json({
        success: true,
        data: {
          connected: successCount > 0,
          accounts: accountsWithSession,
          message: failedCount > 0
            ? `${successCount}/${accountsWithSession.length} tài khoản kết nối (${failedCount} đã hết hạn)`
            : `Có ${successCount} tài khoản được kết nối`,
        },
      });
    } catch (error) {
      console.error('[ZaloPersonalSyncController] getSyncStatus error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Lấy trạng thái thất bại',
      });
    }
  }

  /**
   * POST /api/chatbot/zalo-personal/sync/chat-history
   * Sync lịch sử tin nhắn cho một conversation cụ thể
   */
  async syncChatHistory(req, res) {
    try {
      const userId = req.user.id;
      const { externalId, isGroup, limit, beforeMsgId } = req.body;

      if (!externalId) {
        return res.status(400).json({
          success: false,
          message: 'externalId là bắt buộc',
        });
      }

      const account = await zaloSettingRepository.findActiveConnectedAccountSummaryByUser(userId);

      if (!account) {
        return res.status(400).json({
          success: false,
          message: 'Không có tài khoản Zalo cá nhân nào đang kết nối',
        });
      }

      const result = await zaloPersonalSyncService.syncChatHistory(
        account.id,
        userId,
        externalId,
        isGroup === true,
        { limit: limit || 50, beforeMsgId }
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[ZaloPersonalSyncController] syncChatHistory error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Sync chat history thất bại',
      });
    }
  }

  /**
   * POST /api/chatbot/zalo-personal/sync/group-history
   * Sync lịch sử tin nhắn cho tất cả các nhóm
   */
  async syncAllGroupHistory(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 50 } = req.query;

      const account = await zaloSettingRepository.findActiveConnectedAccountSummaryByUser(userId);

      if (!account) {
        return res.status(400).json({
          success: false,
          message: 'Không có tài khoản Zalo cá nhân nào đang kết nối',
        });
      }

      // Get all groups first
      const groupsResult = await zaloPersonalSyncService.syncGroups(account.id, userId);
      const groups = groupsResult.groups || [];

      const results = {
        totalGroups: groups.length,
        synced: 0,
        errors: [],
      };

      // Sync chat history for each group
      for (const group of groups) {
        try {
          const result = await zaloPersonalSyncService.syncChatHistory(
            account.id,
            userId,
            group.groupId,
            true, // isGroup
            { limit: parseInt(limit) }
          );
          results.synced += result.synced || 0;
        } catch (err) {
          results.errors.push({
            groupId: group.groupId,
            groupName: group.groupName,
            error: err.message,
          });
        }
      }

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      console.error('[ZaloPersonalSyncController] syncAllGroupHistory error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Sync all group history thất bại',
      });
    }
  }

  /**
   * GET /api/chatbot/zalo-personal/history
   * Lấy lịch sử tin nhắn từ DB cho AI đọc ngữ cảnh
   */
  async getChatHistory(req, res) {
    try {
      const userId = req.user.id;
      const { conversationId, limit = 50 } = req.query;

      if (!conversationId) {
        return res.status(400).json({
          success: false,
          message: 'conversationId là bắt buộc',
        });
      }

      // Import repository to get messages
      const { ZaloPersonalRepository } = await import('../../repositories/chatbot/zaloPersonal.repository.js');
      const zaloRepo = ZaloPersonalRepository;

      // Verify conversation belongs to user and get zaloSettingId
      const conversation = await zaloRepo.findConversationByIdAndUser(
        parseInt(conversationId),
        userId
      );

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy cuộc trò chuyện',
        });
      }

      // Get messages
      const messages = await zaloRepo.getMessagesForContext(
        parseInt(conversationId),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: {
          conversationId: parseInt(conversationId),
          messages: messages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            senderName: msg.metadata?.sender_name || null,
            createdAt: msg.created_at,
          })),
          total: messages.length,
        },
      });
    } catch (error) {
      console.error('[ZaloPersonalSyncController] getChatHistory error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Lấy lịch sử thất bại',
      });
    }
  }

  /**
   * GET /api/chatbot/zalo-personal/group-members
   * Lấy thông tin thành viên nhóm từ Zalo API
   */
  async getGroupMembers(req, res) {
    try {
      const userId = req.user.id;
      const { groupId } = req.query;

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: 'groupId là bắt buộc',
        });
      }

      // Get active Zalo account
      const account = await zaloSettingRepository.findActiveConnectedAccountSummaryByUser(userId);

      if (!account) {
        return res.status(400).json({
          success: false,
          message: 'Không có tài khoản Zalo cá nhân nào đang kết nối',
        });
      }

      // Get group members from Zalo API
      const result = await zaloPersonalSyncService.getGroupMembers(account.id, groupId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[ZaloPersonalSyncController] getGroupMembers error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Lấy thành viên nhóm thất bại',
      });
    }
  }

  /**
   * GET /api/chatbot/zalo-personal/group-senders
   * Lấy danh sách người đã nhắn trong nhóm từ DB
   */
  async getGroupSenders(req, res) {
    try {
      const userId = req.user.id;
      const { groupId } = req.query;

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: 'groupId là bắt buộc',
        });
      }

      // Get active Zalo account
      const account = await zaloSettingRepository.findActiveConnectedAccountSummaryByUser(userId);

      if (!account) {
        return res.status(400).json({
          success: false,
          message: 'Không có tài khoản Zalo cá nhân nào đang kết nối',
        });
      }

      // Get senders from DB
      const senders = await zaloPersonalSyncService.getGroupSendersFromDb(account.id, groupId);

      res.json({
        success: true,
        data: {
          groupId,
          senders,
          total: senders.length,
        },
      });
    } catch (error) {
      console.error('[ZaloPersonalSyncController] getGroupSenders error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Lấy danh sách người nhắn thất bại',
      });
    }
  }
}

export default new ZaloPersonalSyncController();

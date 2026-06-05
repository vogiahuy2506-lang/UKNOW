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
          message: 'Session Zalo đã hết hạn. Vui lòng đăng nhập lại Zalo trong Cài đặt.',
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
   * Kiểm tra trạng thái sync
   */
  async getSyncStatus(req, res) {
    try {
      const userId = req.user.id;

      const account = await zaloSettingRepository.findActiveConnectedAccountStatusByUser(userId);

      if (!account) {
        return res.json({
          success: true,
          data: { connected: false, message: 'Không có tài khoản Zalo nào kết nối' },
        });
      }

      const api = zaloAccountSessionService.getAccountApi(account.id);

      res.json({
        success: true,
        data: {
          connected: true,
          accountId: account.id,
          displayName: account.display_name,
          conversationCount: parseInt(account.conversation_count),
          hasActiveSession: !!api,
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
}

export default new ZaloPersonalSyncController();

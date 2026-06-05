/**
 * Zalo Personal Sync Controller
 * 
 * API endpoints để đồng bộ danh sách bạn bè, nhóm từ Zalo Web
 */
import zaloPersonalSyncService from '../services/chatbot/zaloPersonalSync.service.js';
import zaloAccountSessionService from '../services/zalo/zaloAccountSession.service.js';
import db from '../config/database.js';

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
      const { rows: accounts, error: dbError } = await db.query(
        `SELECT zs.*, zs.id as zalo_setting_id
         FROM zalo_settings zs
         WHERE zs.id_user = $1 AND zs.is_active = true AND zs.status = 'connected'
         LIMIT 1`,
        [userId]
      ).catch(e => {
        console.error('[ZaloPersonalSync] DB query error:', e.message);
        return { rows: [], error: e };
      });

      if (dbError) {
        return res.status(500).json({
          success: false,
          message: 'Database error: ' + dbError.message,
        });
      }

      console.log('[ZaloPersonalSync] Found accounts:', accounts.length, accounts[0] ? { id: accounts[0].id, status: accounts[0].status } : null);

      if (!accounts[0]) {
        return res.status(400).json({
          success: false,
          message: 'Không có tài khoản Zalo cá nhân nào đang kết nối. Vui lòng kết nối Zalo trong Cài đặt.',
        });
      }

      const accountId = accounts[0].id;
      
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

      const { rows: accounts } = await db.query(
        `SELECT zs.id, zs.id as zalo_setting_id
         FROM zalo_settings zs
         WHERE zs.id_user = $1 AND zs.is_active = true AND zs.status = 'connected'
         LIMIT 1`,
        [userId]
      );

      if (!accounts[0]) {
        return res.status(400).json({
          success: false,
          message: 'Không có tài khoản Zalo cá nhân nào đang kết nối',
        });
      }

      const result = await zaloPersonalSyncService.syncContacts(accounts[0].id, userId);

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

      const { rows: accounts } = await db.query(
        `SELECT zs.id, zs.id as zalo_setting_id
         FROM zalo_settings zs
         WHERE zs.id_user = $1 AND zs.is_active = true AND zs.status = 'connected'
         LIMIT 1`,
        [userId]
      );

      if (!accounts[0]) {
        return res.status(400).json({
          success: false,
          message: 'Không có tài khoản Zalo cá nhân nào đang kết nối',
        });
      }

      const result = await zaloPersonalSyncService.syncGroups(accounts[0].id, userId);

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

      const { rows: accounts } = await db.query(
        `SELECT zs.id, zs.display_name, zs.status, zs.is_active,
                (SELECT COUNT(*) FROM zalo_personal_conversations WHERE id_zalo_setting = zs.id) as conversation_count
         FROM zalo_settings zs
         WHERE zs.id_user = $1 AND zs.is_active = true AND zs.status = 'connected'
         LIMIT 1`,
        [userId]
      );

      if (!accounts[0]) {
        return res.json({
          success: true,
          data: { connected: false, message: 'Không có tài khoản Zalo nào kết nối' },
        });
      }

      const api = zaloAccountSessionService.getAccountApi(accounts[0].id);

      res.json({
        success: true,
        data: {
          connected: true,
          accountId: accounts[0].id,
          displayName: accounts[0].display_name,
          conversationCount: parseInt(accounts[0].conversation_count),
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

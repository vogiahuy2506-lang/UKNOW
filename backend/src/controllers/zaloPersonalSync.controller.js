/**
 * Zalo Personal Sync Controller
 * 
 * API endpoints để đồng bộ danh sách bạn bè, nhóm từ Zalo Web
 */
import zaloPersonalSyncService from '../services/chatbot/zaloPersonalSync.service.js';
import zaloAccountSessionService from '../services/zalo/zaloAccountSession.service.js';
import zaloSettingRepository from '../repositories/zalo/zaloSetting.repository.js';
import { resolveWorkspaceOwnerId } from '../services/storage/storageQuota.service.js';

class ZaloPersonalSyncController {
  _requestedAccountId(req) {
    return req.query?.accountId || req.body?.accountId || null;
  }

  /**
   * GET /api/chatbot/zalo-personal/sync
   * Full sync - đồng bộ bạn bè và nhóm
   * Query: accountId (optional) — tài khoản đang chọn trên UI
   */
  async sync(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const requestedAccountId = this._requestedAccountId(req);
      console.log('[ZaloPersonalSync] sync called for userId:', userId, 'accountId:', requestedAccountId);

      const account = await zaloSettingRepository
        .findConnectedAccountForSync(userId, requestedAccountId)
        .catch((e) => {
          console.error('[ZaloPersonalSync] DB query error:', e.message);
          e.isDatabaseError = true;
          throw e;
        });

      console.log('[ZaloPersonalSync] Found account:', account ? { id: account.id, status: account.status } : null);

      if (!account) {
        return res.status(400).json({
          success: false,
          message: requestedAccountId
            ? 'Tài khoản Zalo đã chọn không hợp lệ hoặc chưa kết nối'
            : 'Không có tài khoản Zalo cá nhân nào đang kết nối. Vui lòng kết nối Zalo trong Cài đặt.',
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

      const errors = Array.isArray(result?.errors) ? result.errors : [];
      const hasErrors = errors.length > 0;
      const errorTypes = [...new Set(errors.map((e) => e.type || e.groupId || 'unknown'))];

      return res.status(200).json({
        // Không báo thành công giả khi nhóm/danh bạ lỗi (PLAN V-9)
        success: !hasErrors,
        message: hasErrors
          ? `Đồng bộ chưa hoàn tất: lỗi ở ${errorTypes.join(', ')}`
          : undefined,
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
      const userId = resolveWorkspaceOwnerId(req.user);

      const account = await zaloSettingRepository.findConnectedAccountSummaryForSync(
        userId,
        this._requestedAccountId(req)
      );

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
   * GET /api/chatbot/zalo-personal/friends
   * Lấy danh sách bạn bè Zalo đã lưu (phân trang + tìm kiếm)
   */
  async getFriends(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const accountId = Number(req.query.accountId || req.params.accountId);
      if (!accountId) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu accountId tài khoản Zalo',
        });
      }

      const { search, page, limit } = req.query;
      const result = await zaloPersonalSyncService.listFriends({
        accountId,
        userId,
        search,
        page,
        limit,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[ZaloPersonalSyncController] getFriends error:', error);
      const status = error.statusCode || 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Lấy danh sách bạn bè thất bại',
      });
    }
  }

  /**
   * GET /api/chatbot/zalo-personal/sync/status
   * CHỈ ĐỌC: trạng thái trong DB (`zalo_settings.status`) + việc RAM có giữ phiên hay không.
   * Returns ALL active accounts (connected + cần đăng nhập lại), mỗi tài khoản kèm `status`.
   *
   * RA_SOAT_3_MAN H-05: bản cũ với MỌI tài khoản `is_active` mà RAM chưa giữ phiên thì gọi
   * `restoreZaloSessionFromCookie` rồi `recordRestoreFailure` (UPDATE `zalo_settings`) — một GET có tác dụng
   * phụ, chạy 3 lần mỗi lần mở Hộp thư và lại chạy ở mỗi phím gõ tìm kiếm; nhân viên chỉ có quyền xem cũng
   * làm tăng `restore_fail_count` của tài khoản chủ. Khôi phục phiên là việc của keep-alive
   * (`zaloSessionKeepAlive.service.js`) và nút "Kết nối lại", không phải của endpoint đọc trạng thái.
   */
  async getSyncStatus(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);

      const accounts = await zaloSettingRepository.findActiveConnectedAccountsByUser(userId);

      if (!accounts.length) {
        return res.json({
          success: true,
          data: { connected: false, message: 'Không có tài khoản Zalo nào kết nối', accounts: [] },
        });
      }

      const accountsWithStatus = accounts.map((account) => {
        const isConnected = account.status === 'connected';
        return {
          id: account.id,
          displayName: account.display_name,
          conversationCount: parseInt(account.conversation_count, 10) || 0,
          status: account.status,
          isConnected,
          needsReauth: !isConnected,
          // Chỉ báo RAM có giữ phiên không — thông tin tham khảo, KHÔNG thử khôi phục ở đây.
          hasActiveSession: !!zaloAccountSessionService.getAccountApi(account.id),
        };
      });

      const connectedCount = accountsWithStatus.filter((a) => a.isConnected).length;
      const needsReauthCount = accountsWithStatus.length - connectedCount;

      res.json({
        success: true,
        data: {
          connected: connectedCount > 0,
          accounts: accountsWithStatus,
          message: needsReauthCount > 0
            ? `${connectedCount}/${accountsWithStatus.length} tài khoản kết nối (${needsReauthCount} cần đăng nhập lại)`
            : `Có ${connectedCount} tài khoản được kết nối`,
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
      const userId = resolveWorkspaceOwnerId(req.user);
      const { externalId, isGroup, limit, beforeMsgId } = req.body;

      if (!externalId) {
        return res.status(400).json({
          success: false,
          message: 'externalId là bắt buộc',
        });
      }

      const account = await zaloSettingRepository.findConnectedAccountSummaryForSync(
        userId,
        this._requestedAccountId(req)
      );

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

}

export default new ZaloPersonalSyncController();

import axios from 'axios';
import channelConnectionsRepository from '../repositories/ai/channelConnections.repository.js';
import chatbotZaloOaRepository from '../repositories/chatbot/chatbotZaloOa.repository.js';
import { resolveWorkspaceOwnerId } from '../utils/workspaceContext.util.js';

const ZALO_OA_API_BASE = 'https://openapi.zalo.me/v3.0';

class ZaloOaSettingsController {
  /**
   * Danh sách các Zalo OA đã kết nối của Workspace
   * GET /api/zalo-oa/accounts
   */
  async listAccounts(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const connections = await channelConnectionsRepository.listZaloOaConnections(userId);

      const sanitized = connections.map((c) => {
        const creds = c.credentials || {};
        return {
          id: c.id,
          zalo_oa_id: c.zalo_oa_id || c.external_channel_id,
          name: c.zalo_oa_name || c.display_name || 'Zalo OA',
          avatar: c.zalo_oa_avatar,
          app_id: creds.app_id || null,
          token_expires_at: creds.expires_at || null,
          token_refreshed_at: creds.token_refreshed_at || null,
          is_active: c.is_active,
          created_at: c.created_at,
          updated_at: c.updated_at,
        };
      });

      return res.json({ success: true, data: sanitized });
    } catch (err) {
      console.error('[ZaloOaSettings] List accounts error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Thêm hoặc cập nhật kết nối Zalo OA bằng Access Token & Refresh Token
   * POST /api/zalo-oa/accounts
   */
  async connectAccount(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const {
        access_token,
        refresh_token,
        app_id,
        app_secret,
        oa_secret_key,
        display_name,
      } = req.body;

      const cleanAccessToken = String(access_token || '').trim();
      const cleanRefreshToken = String(refresh_token || '').trim();
      const cleanAppId = String(app_id || process.env.ZALO_OA_APP_ID || '').trim();
      const cleanAppSecret = String(app_secret || process.env.ZALO_OA_APP_SECRET || '').trim();
      const cleanOaSecretKey = String(oa_secret_key || '').trim();

      if (!cleanAccessToken) {
        return res.status(400).json({ success: false, message: 'Access Token không được để trống' });
      }

      // 1. Kiểm tra tính hợp lệ của Access Token bằng cách gọi API /oa/getprofile của Zalo
      let oaProfile = {};
      try {
        const profileResp = await axios.get(`${ZALO_OA_API_BASE}/oa/getprofile`, {
          headers: { access_token: cleanAccessToken },
          timeout: 10000,
        });

        const profileData = profileResp?.data || {};
        if (profileData.error !== 0 && profileData.error !== undefined) {
          const errMsg = profileData.message || `Lỗi Zalo API (${profileData.error})`;
          return res.status(400).json({
            success: false,
            message: `Access Token không hợp lệ hoặc đã hết hạn: ${errMsg}. Vui lòng tạo token mới từ Zalo API Explorer.`,
          });
        }

        oaProfile = profileData.data || profileData;
      } catch (err) {
        console.warn('[ZaloOaSettings] Lỗi khi xác thực profile Zalo OA:', err.message);
        // Nếu API lỗi mạng nhưng user có truyền thông tin, fallback nhẹ
      }

      const oaId = String(oaProfile.oa_id || req.body.oa_id || '').trim();
      if (!oaId) {
        return res.status(400).json({
          success: false,
          message: 'Không thể xác định OA ID từ Access Token. Vui lòng kiểm tra lại token đã cấp quyền cho Zalo OA chưa.',
        });
      }

      const oaName = String(oaProfile.name || display_name || 'Zalo OA').trim();
      const oaAvatar = oaProfile.avatar || null;

      // Access Token Zalo OA sống 25 giờ (90.000 giây)
      const expiresAt = new Date(Date.now() + 25 * 3600 * 1000).toISOString();
      // Refresh Token sống 3 tháng
      const refreshTokenExpiresAt = new Date(Date.now() + 90 * 86400 * 1000).toISOString();

      // 2. Lưu vào database
      const connection = await channelConnectionsRepository.upsertZaloOaConnection(userId, {
        oaId,
        oaName,
        oaAvatar,
        appId: cleanAppId,
        appSecret: cleanAppSecret,
        oaSecretKey: cleanOaSecretKey,
        accessToken: cleanAccessToken,
        refreshToken: cleanRefreshToken,
        expiresAt,
        refreshTokenExpiresAt,
      });

      return res.json({
        success: true,
        message: `Đã kết nối thành công Zalo OA: ${oaName}`,
        data: {
          id: connection.id,
          zalo_oa_id: connection.zalo_oa_id,
          name: connection.zalo_oa_name,
          avatar: connection.zalo_oa_avatar,
          expires_at: expiresAt,
        },
      });
    } catch (err) {
      console.error('[ZaloOaSettings] Connect account error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Ngắt kết nối Zalo OA
   * DELETE /api/zalo-oa/accounts/:id
   */
  async deleteAccount(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const connectionId = parseInt(req.params.id, 10);

      if (isNaN(connectionId)) {
        return res.status(400).json({ success: false, message: 'ID tài khoản không hợp lệ' });
      }

      const deleted = await channelConnectionsRepository.deleteZaloOaConnection(connectionId, userId);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản Zalo OA' });
      }

      return res.json({
        success: true,
        message: 'Đã ngắt kết nối Zalo OA thành công',
      });
    } catch (err) {
      console.error('[ZaloOaSettings] Delete account error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Danh sách Zalo OA cho một Chatbot cụ thể kèm trạng thái bật/tắt
   * GET /api/ai/chatbot/custom-chatbots/:chatbotId/zalo-oa-accounts
   */
  async listAccountsForChatbot(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const chatbotId = parseInt(req.params.chatbotId, 10);

      if (isNaN(chatbotId)) {
        return res.status(400).json({ success: false, message: 'ID chatbot không hợp lệ' });
      }

      const accounts = await chatbotZaloOaRepository.listOaAccountsForChatbot(userId, chatbotId);
      return res.json({ success: true, data: accounts });
    } catch (err) {
      console.error('[ZaloOaSettings] List accounts for chatbot error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Bật/Tắt Zalo OA cho một Chatbot cụ thể
   * POST /api/ai/chatbot/custom-chatbots/:chatbotId/zalo-oa-accounts/:connectionId/toggle
   */
  async toggleAccountForChatbot(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const chatbotId = parseInt(req.params.chatbotId, 10);
      const connectionId = parseInt(req.params.connectionId, 10);
      const { is_active } = req.body;

      if (isNaN(chatbotId) || isNaN(connectionId)) {
        return res.status(400).json({ success: false, message: 'ID không hợp lệ' });
      }

      const result = await chatbotZaloOaRepository.toggleAccountForChatbot({
        userId,
        chatbotId,
        channelConnectionId: connectionId,
        isActive: is_active,
      });

      return res.json({
        success: true,
        message: is_active ? 'Đã bật Zalo OA cho trợ lý này' : 'Đã tắt Zalo OA cho trợ lý này',
        data: result.setting,
      });
    } catch (err) {
      console.error('[ZaloOaSettings] Toggle account for chatbot error:', err);
      return res.status(err.status || 500).json({ success: false, message: err.message });
    }
  }
}

export default new ZaloOaSettingsController();


import axios from 'axios';
import channelConnectionsRepository from '../../repositories/ai/channelConnections.repository.js';

const ZALO_TOKEN_ENDPOINT = 'https://oauth.zaloapp.com/v4/oa/access_token';

class ZaloOaTokenRefreshService {
  /**
   * Làm mới Access Token cho một Zalo OA connection cụ thể
   * @param {object} connection - dòng channel_connections
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  async refreshConnectionToken(connection) {
    const creds = connection?.credentials || {};
    const refreshToken = creds.refresh_token;
    const appId = creds.app_id || process.env.ZALO_OA_APP_ID;
    const appSecret = creds.app_secret || creds.oa_secret_key || process.env.ZALO_OA_APP_SECRET;

    if (!refreshToken) {
      console.warn(`[ZaloOaTokenRefresh] Connection ${connection.id} (${connection.display_name}) thiếu refresh_token — bỏ qua`);
      return { success: false, error: 'missing_refresh_token' };
    }

    if (!appId || !appSecret) {
      console.warn(`[ZaloOaTokenRefresh] Connection ${connection.id} thiếu app_id hoặc app_secret — bỏ qua`);
      return { success: false, error: 'missing_app_credentials' };
    }

    try {
      console.log(`[ZaloOaTokenRefresh] Đang làm mới token cho OA "${connection.display_name}" (id=${connection.id}, oa_id=${connection.zalo_oa_id || connection.external_channel_id})...`);

      const params = new URLSearchParams({
        refresh_token: refreshToken,
        app_id: String(appId),
        grant_type: 'refresh_token',
      });

      const response = await axios.post(ZALO_TOKEN_ENDPOINT, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          secret_key: String(appSecret),
        },
        timeout: 15000,
      });

      const data = response?.data || {};

      if (data.error || !data.access_token) {
        const errorMsg = data.message || data.error_description || `Mã lỗi Zalo: ${data.error}`;
        console.error(`[ZaloOaTokenRefresh] Làm mới token thất bại connection=${connection.id}: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      const newAccessToken = data.access_token;
      const newRefreshToken = data.refresh_token || refreshToken;
      const expiresInSec = Number(data.expires_in) || 90000;
      const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

      const updatedCreds = {
        ...creds,
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_at: expiresAt,
        token_refreshed_at: new Date().toISOString(),
      };

      await channelConnectionsRepository.updateZaloOaCredentials(connection.id, updatedCreds);
      console.log(`[ZaloOaTokenRefresh] ✅ Đã làm mới token thành công cho OA "${connection.display_name}" (hạn tới ${expiresAt})`);
      return { success: true };
    } catch (err) {
      console.error(`[ZaloOaTokenRefresh] Lỗi khi gọi Zalo OAuth API connection=${connection.id}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Quét và làm mới toàn bộ các Zalo OA token sắp hết hạn trong hệ thống
   * @param {number} [thresholdHours=6] Quét các token còn dưới X giờ
   * @returns {Promise<{ checked: number, refreshed: number, failed: number }>}
   */
  async refreshAllExpiringTokens(thresholdHours = 6) {
    try {
      const expiringConnections = await channelConnectionsRepository.findExpiringZaloOaConnections(thresholdHours);
      if (!expiringConnections || expiringConnections.length === 0) {
        return { checked: 0, refreshed: 0, failed: 0 };
      }

      console.log(`[ZaloOaTokenRefresh] Tìm thấy ${expiringConnections.length} Zalo OA sắp hết hạn token trong ${thresholdHours}h tới.`);
      let refreshed = 0;
      let failed = 0;

      for (const conn of expiringConnections) {
        const res = await this.refreshConnectionToken(conn);
        if (res.success) refreshed++;
        else failed++;
      }

      return { checked: expiringConnections.length, refreshed, failed };
    } catch (err) {
      console.error('[ZaloOaTokenRefresh] Lỗi khi quét token Zalo OA hết hạn:', err);
      return { checked: 0, refreshed: 0, failed: 0, error: err.message };
    }
  }
}

export default new ZaloOaTokenRefreshService();


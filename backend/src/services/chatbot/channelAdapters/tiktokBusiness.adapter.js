/**
 * tiktokBusiness.adapter.js
 *
 * Channel adapter cho TikTok Business Messaging API v1.3.
 * Pattern copy từ `facebook.adapter.js` (axios, timeout 10s, slice message).
 *
 * Khác biệt quan trọng vs Facebook:
 * - TikTok giới hạn message text 6.000 ký tự (Facebook là 2.000) — research §Bẫy 8.
 * - TikTok KHÔNG cho cold DM; chỉ reply được khi user đã nhắn trước. Adapter này
 *   nhận `conversation_id` từ webhook → gọi `POST /business/message/content/send/`
 *   với `conversation_id` (Bẫy 3 của plan).
 * - 401 → tự động refresh 1 lần rồi retry (Facebook làm tương tự pattern riêng).
 *
 * Bẫy đã xử lý:
 * - Bẫy 1: token plaintext → lấy từ repo (đã mã hoá bằng encryptSmtpSecret) → decrypt ở đây
 * - Bẫy 2: webhook content string → KHÔNG phải việc của adapter (controller xử lý)
 * - Bẫy 3: rate limit 10/48h → xử lý ở `tiktokRateLimit.service.js` (Bẫy 3 plan)
 * - Bẫy 8: 6000 char slice (không throw ở 4001)
 *
 * Việc 4 của plan tiktok-business-messaging-integration.md.
 */

import axios from 'axios';
import { decryptSmtpSecret } from '../../../utils/smtpSecretCrypto.js';
import tiktokBusinessAccountRepository from
  '../../../repositories/ai/tiktokBusinessAccount.repository.js';

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';
const MAX_TEXT_LENGTH = 6000;          // Bẫy 8 của research
const REQUEST_TIMEOUT_MS = 10000;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3MB (research §Bẫy 4)

class TiktokBusinessAdapter {
  /**
   * Send reply tới 1 conversation đã có (Bẫy 3: phải tồn tại).
   *
   * @param {object} params
   * @param {number} params.accountId - tiktok_business_accounts.id
   * @param {string} params.conversationId - conversation_id từ webhook hoặc list
   * @param {string} params.message - text reply (sẽ slice 6000 char)
   * @param {Array<{type: string, mediaId: string}>} [params.attachments]
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendReply({ accountId, conversationId, message, attachments = [] }) {
    if (!accountId) {
      throw new Error('TikTok adapter: thiếu accountId');
    }
    if (!conversationId) {
      throw new Error('TikTok adapter: thiếu conversationId (Bẫy 3 — không cold DM)');
    }
    if (typeof message !== 'string' || !message.length) {
      throw new Error('TikTok adapter: message rỗng');
    }

    // 1. Lấy account (internal — adapter đã verify ownership ở layer trên qua
    // chatbot_channel_connections, không cần userId check ở đây).
    const account = await tiktokBusinessAccountRepository.findByIdAnyUser(accountId);
    if (!account) {
      throw new Error(`TikTok adapter: không tìm thấy account #${accountId}`);
    }
    const plainAccessToken = decryptSmtpSecret(account.access_token);

    // 2. Slice message (Bẫy 8: 6000 char)
    const safeMessage = message.slice(0, MAX_TEXT_LENGTH);

    // 3. Build body
    const body = {
      business_id: account.business_id,
      conversation_id: conversationId,
      message_type: 'text',
      text: { body: safeMessage },
    };

    try {
      const resp = await this._callApi('/business/message/content/send/', body, plainAccessToken);
      return {
        success: true,
        messageId: resp?.message_id || resp?.data?.message_id,
      };
    } catch (err) {
      // 401 → token hết hạn dù refresh cron chưa kịp chạy. Thử refresh 1 lần.
      if (err.response?.status === 401) {
        const refreshed = await this._tryRefreshAndRetry({
          account, body,
        });
        if (refreshed.success) return refreshed;
        // refresh fail → trả 401 cho caller xử lý
      }
      console.error('[TikTokAdapter] sendReply error:', err.response?.data || err.message);
      return {
        success: false,
        error: err.response?.data?.message || err.message,
        httpStatus: err.response?.status,
      };
    }
  }

  /**
   * Send image attachment (optional).
   * @param {object} params
   * @param {number} params.accountId
   * @param {string} params.conversationId
   * @param {string} params.mediaId - đã upload qua /business/message/upload/image/
   * @returns {Promise<{success: boolean, messageId?: string}>}
   */
  async sendImage({ accountId, conversationId, mediaId }) {
    const account = await tiktokBusinessAccountRepository.findByIdAnyUser(accountId);
    if (!account) throw new Error(`Không tìm thấy TikTok account #${accountId}`);
    const plainAccessToken = decryptSmtpSecret(account.access_token);
    const body = {
      business_id: account.business_id,
      conversation_id: conversationId,
      message_type: 'image',
      image: { media_id: mediaId },
    };
    try {
      const resp = await this._callApi('/business/message/content/send/', body, plainAccessToken);
      return { success: true, messageId: resp?.message_id || resp?.data?.message_id };
    } catch (err) {
      return { success: false, error: err.message, httpStatus: err.response?.status };
    }
  }

  /**
   * Gọi TikTok API chung. Trả về parsed JSON (TikTok bọc data trong `data.code`
   * = 0 thì thành công; khác 0 thì error).
   *
   * @param {string} path
   * @param {object} body
   * @param {string} accessToken - PLAINTEXT
   * @returns {Promise<object>} - data field từ response
   */
  async _callApi(path, body, accessToken) {
    const resp = await axios.post(`${TIKTOK_API_BASE}${path}`, body, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': accessToken,
      },
      timeout: REQUEST_TIMEOUT_MS,
    });
    // TikTok response: { code, message, data, request_id, ... }
    // code = 0 success; khác 0 → lỗi nghiệp vụ (kể cả 200 HTTP)
    if (resp.data?.code && resp.data.code !== 0) {
      const err = new Error(resp.data.message || `TikTok API code ${resp.data.code}`);
      err.response = { status: 200, data: resp.data };
      throw err;
    }
    return resp.data?.data || resp.data;
  }

  /**
   * Refresh 1 lần rồi retry khi gặp 401.
   */
  async _tryRefreshAndRetry({ account, body }) {
    try {
      const { refreshAccessToken } = await import('./tiktokOAuth.service.js');
      const plainRefresh = decryptSmtpSecret(account.refresh_token);
      const newTokens = await refreshAccessToken(plainRefresh);
      const now = Date.now();
      const newAccessExpiresAt = new Date(now + newTokens.expiresIn * 1000);
      const newRefreshExpiresAt = new Date(now + newTokens.refreshExpiresIn * 1000);
      const { encryptSmtpSecret } = await import('../../../utils/smtpSecretCrypto.js');
      await tiktokBusinessAccountRepository.updateTokens(account.id, {
        accessToken: encryptSmtpSecret(newTokens.accessToken),
        refreshToken: encryptSmtpSecret(newTokens.refreshToken),
        accessExpiresAt: newAccessExpiresAt,
        refreshExpiresAt: newRefreshExpiresAt,
      });
      // Retry
      const resp = await this._callApi('/business/message/content/send/', body, newTokens.accessToken);
      return { success: true, messageId: resp?.message_id || resp?.data?.message_id };
    } catch (refreshErr) {
      console.error('[TikTokAdapter] refresh-on-401 failed:', refreshErr.message);
      return { success: false, error: refreshErr.message };
    }
  }
}

export default new TiktokBusinessAdapter();

/**
 * tiktokSettings.controller.js
 *
 * Settings controller cho TikTok Business Messaging — pattern copy từ
 * `backend/src/controllers/facebookSettings.controller.js`:
 * - 6 endpoint: connect/callback/accounts/refresh/delete/test-send
 * - sanitize response (bỏ `access_token`/`refresh_token` ra response)
 * - 3 bẫy ở callback:
 *   Bẫy 14: region ∈ {EEA, CH, UK} → 403 với hướng dẫn
 *   Bẫy 15: trả onboarding hint "set DM = Everyone" (KHÔNG block, chỉ thông báo)
 *   Bẫy 16: role === 'personal_account' → 403 với hướng dẫn switch
 *
 * Permission: `chatbot_channels_manage` — same với Facebook.
 * Việc 3.1 của plan tiktok-business-messaging-integration.md.
 */

import { encryptSmtpSecret, decryptSmtpSecret } from '../utils/smtpSecretCrypto.js';
import tiktokBusinessAccountRepository from '../repositories/ai/tiktokBusinessAccount.repository.js';
import tiktokOAuthService from '../services/tiktok/tiktokOAuth.service.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
const REDIRECT_URI = process.env.TIKTOK_OAUTH_REDIRECT_URI
  || `${(process.env.BACKEND_PUBLIC_URL || '').replace(/\/+$/, '')}/api/webhooks/oauth/callback/tiktok`;

/**
 * Strip `access_token` / `refresh_token` ra khỏi response.
 * Token là secret at-rest — chỉ decryptSmtpSecret ở service layer khi cần gọi TikTok API.
 *
 * @param {object} account
 * @returns {object}
 */
function sanitize(account) {
  if (!account) return account;
  const {
    access_token, refresh_token, ...rest
  } = account;
  return {
    ...rest,
    has_access_token: Boolean(access_token),
    has_refresh_token: Boolean(refresh_token),
  };
}

/**
 * Helper: redirect về FE với error params.
 */
function buildErrorRedirect(errorCode, reason) {
  const url = new URL(`${FRONTEND_URL}/app/settings/channels`);
  url.searchParams.set('tab', 'tiktok');
  url.searchParams.set('error', errorCode);
  if (reason) url.searchParams.set('reason', reason);
  return url.toString();
}

class TiktokSettingsController {
  /**
   * GET /api/settings/tiktok-business/connect
   * Bước 1: sinh state HMAC (chứa userId) rồi redirect user sang TikTok authorize URL.
   * Phải qua authMiddleware để biết userId.
   */
  async connect(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
      }
      const { state } = tiktokOAuthService.signState(userId);
      const url = tiktokOAuthService.getAuthorizeUrl({
        redirectUri: REDIRECT_URI,
        state,
      });
      return res.redirect(url);
    } catch (err) {
      console.error('[TikTokSettings] connect error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * GET /api/webhooks/oauth/callback/tiktok
   * Bước 2: TikTok redirect về sau khi user authorize.
   * PUBLIC route (không auth) — verify qua state HMAC.
   * - Bẫy 11: state sai/hết hạn → redirect FE với error
   * - Bẫy 14: region ∈ {EEA, CH, UK} → reject (chưa lưu DB)
   * - Bẫy 16: role === 'personal_account' → reject
   * - Thành công: upsert `tiktok_business_accounts` rồi redirect về FE
   */
  async callback(req, res) {
    try {
      const { code, state, error, error_description } = req.query;
      const frontendUrl = FRONTEND_URL;

      // 1. User deny ở TikTok
      if (error) {
        console.log('[TikTokSettings] user denied:', error, error_description);
        return res.redirect(buildErrorRedirect('tiktok_denied', error_description || error));
      }
      if (!code || !state) {
        return res.redirect(buildErrorRedirect('missing_code_or_state'));
      }

      // 2. Verify state HMAC
      let stateData;
      try {
        stateData = tiktokOAuthService.verifyState(state);
      } catch (stateErr) {
        console.warn('[TikTokSettings] invalid state:', stateErr.message);
        return res.redirect(buildErrorRedirect('invalid_state', stateErr.message));
      }
      const { userId } = stateData;

      // 3. Exchange code → tokens
      const tokens = await tiktokOAuthService.exchangeCodeForToken({
        code,
        redirectUri: REDIRECT_URI,
      });

      // 4. Lấy user info (region, role, display_name) — Bẫy 14, 16
      let userInfo;
      try {
        userInfo = await tiktokOAuthService.getUserInfo(tokens.accessToken);
      } catch (userInfoErr) {
        console.error('[TikTokSettings] getUserInfo error:', userInfoErr.message);
        return res.redirect(buildErrorRedirect('userinfo_failed', userInfoErr.message));
      }

      // 5. Bẫy 16: personal_account → reject
      if (userInfo.role === 'personal_account') {
        return res.redirect(buildErrorRedirect(
          'personal_account',
          'Cần chuyển sang Business Account trong TikTok app (Settings → Account → Switch to Business Account)'
        ));
      }

      // 6. Bẫy 14: region blocked
      if (!tiktokOAuthService.isRegionSupported(userInfo.region)) {
        return res.redirect(buildErrorRedirect(
          'region_unsupported',
          `TikTok Business Messaging hiện không hỗ trợ region ${userInfo.region}. Hỗ trợ: APAC, LATAM, METAP, NA.`
        ));
      }

      // 7. Tính expires_at
      const now = new Date();
      const accessExpiresAt = new Date(now.getTime() + tokens.expiresIn * 1000);
      const refreshExpiresAt = new Date(now.getTime() + tokens.refreshExpiresIn * 1000);

      // 8. Mã hoá token trước khi lưu (Bẫy 1: KHÔNG lưu plaintext)
      const cipherAccess = encryptSmtpSecret(tokens.accessToken);
      const cipherRefresh = encryptSmtpSecret(tokens.refreshToken);

      // 9. Upsert
      const account = await tiktokBusinessAccountRepository.upsert({
        userId,
        businessId: userInfo.openId || tokens.openId,
        displayName: userInfo.displayName || null,
        accessToken: cipherAccess,
        refreshToken: cipherRefresh,
        scope: tokens.scope || null,
        accessExpiresAt,
        refreshExpiresAt,
        region: userInfo.region,
        role: userInfo.role,
      });

      // 10. Redirect về FE với success
      const successUrl = new URL(`${frontendUrl}/app/settings/channels`);
      successUrl.searchParams.set('tab', 'tiktok');
      successUrl.searchParams.set('success', 'connected');
      successUrl.searchParams.set('account_id', String(account.id));
      // Bẫy 15: nhắc user set DM = Everyone (chỉ thông báo, không block)
      successUrl.searchParams.set('hint', 'check_dm_privacy');
      return res.redirect(successUrl.toString());
    } catch (err) {
      console.error('[TikTokSettings] callback error:', err);
      // Phân biệt error message để redirect đúng
      const reason = err.code || err.message || 'unknown';
      return res.redirect(buildErrorRedirect('callback_failed', reason));
    }
  }

  /**
   * GET /api/settings/tiktok-business/accounts
   * List tài khoản TikTok Business của user hiện tại.
   */
  async listAccounts(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
      }
      const accounts = await tiktokBusinessAccountRepository.listByUser(userId);
      return res.json({
        success: true,
        data: accounts.map(sanitize),
      });
    } catch (err) {
      console.error('[TikTokSettings] listAccounts error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/settings/tiktok-business/accounts/:id/refresh
   * Force refresh 1 account.
   */
  async refreshAccount(req, res) {
    try {
      const userId = req.user?.id;
      const id = Number.parseInt(req.params.id, 10);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
      }
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'ID không hợp lệ.' });
      }
      const account = await tiktokBusinessAccountRepository.findById(id, userId);
      if (!account) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
      }
      const plainRefresh = decryptSmtpSecret(account.refresh_token);
      const newTokens = await tiktokOAuthService.refreshAccessToken(plainRefresh);
      const now = new Date();
      const newAccessExpiresAt = new Date(now.getTime() + newTokens.expiresIn * 1000);
      const newRefreshExpiresAt = new Date(now.getTime() + newTokens.refreshExpiresIn * 1000);
      await tiktokBusinessAccountRepository.updateTokens(account.id, {
        accessToken: encryptSmtpSecret(newTokens.accessToken),
        refreshToken: encryptSmtpSecret(newTokens.refreshToken),
        accessExpiresAt: newAccessExpiresAt,
        refreshExpiresAt: newRefreshExpiresAt,
      });
      return res.json({ success: true });
    } catch (err) {
      console.error('[TikTokSettings] refreshAccount error:', err);
      return res.status(502).json({ success: false, message: err.message });
    }
  }

  /**
   * DELETE /api/settings/tiktok-business/accounts/:id
   * Soft-delete (deactivate). Giữ token để có thể reactivate, nhưng gọi
   * revokeToken trước để TikTok không còn cấp quyền nữa.
   */
  async deleteAccount(req, res) {
    try {
      const userId = req.user?.id;
      const id = Number.parseInt(req.params.id, 10);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
      }
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'ID không hợp lệ.' });
      }
      const account = await tiktokBusinessAccountRepository.findById(id, userId);
      if (!account) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
      }
      // Revoke trước (best-effort — lỗi không chặn soft-delete local)
      try {
        const plainAccess = decryptSmtpSecret(account.access_token);
        await tiktokOAuthService.revokeToken(plainAccess);
      } catch (revokeErr) {
        console.warn('[TikTokSettings] revoke token (best-effort) error:', revokeErr.message);
      }
      const ok = await tiktokBusinessAccountRepository.deactivate(id, userId);
      if (!ok) {
        return res.status(500).json({ success: false, message: 'Không thể ngắt kết nối.' });
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('[TikTokSettings] deleteAccount error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/settings/tiktok-business/accounts/:id/test-send
   * Gửi 1 tin test tới conversation. PR-3 (adapter) mới impl, PR-2 stub
   * chỉ verify account ownership + return 501 với hướng dẫn.
   */
  async testSend(req, res) {
    try {
      const userId = req.user?.id;
      const id = Number.parseInt(req.params.id, 10);
      const { conversationId, message } = req.body || {};
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập.' });
      }
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'ID không hợp lệ.' });
      }
      if (!conversationId || !message) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu conversationId hoặc message.',
        });
      }
      const account = await tiktokBusinessAccountRepository.findById(id, userId);
      if (!account) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
      }
      // PR-2 stub: chưa impl adapter (PR-3). Trả 501 với hướng dẫn.
      return res.status(501).json({
        success: false,
        message: 'Test-send sẽ hoạt động sau PR-3 (việc 4 trong plan).',
      });
    } catch (err) {
      console.error('[TikTokSettings] testSend error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

export default new TiktokSettingsController();

import crypto from 'crypto';
import whatsappOAuthService, {
  stashPendingOAuth,
  verifyState,
} from '../services/chatbot/whatsappOAuth.service.js';

const FB_GRAPH_BASE = 'https://graph.facebook.com/v18.0';
const FB_OAUTH_BASE = 'https://www.facebook.com/v18.0/dialog/oauth';
const ZALO_OAUTH_URL = 'https://oauth.zaloapp.com/v4/authorize';

class OAuthController {
  // ── Facebook OAuth ─────────────────────────────────────────────

  /**
   * Khởi tạo Facebook OAuth flow
   * GET /api/webhooks/oauth/facebook/init
   */
  async initFacebookOAuth(req, res) {
    try {
      const { user_id } = req.user; // From auth middleware
      const { chatbot_id, redirect_to } = req.query;
      
      // Generate state token for CSRF protection
      const state = crypto.randomBytes(32).toString('hex');
      
      // Store state in session or temporary storage
      // For simplicity, we'll encode user_id in state (in production, use Redis/session)
      const stateData = Buffer.from(JSON.stringify({ user_id, chatbot_id, redirect_to, timestamp: Date.now() })).toString('base64');
      const hashedState = crypto.createHmac('sha256', process.env.OAUTH_STATE_SECRET || 'default-secret')
        .update(stateData)
        .digest('hex');
      
      const appId = process.env.FACEBOOK_APP_ID;
      const redirectUri = `${process.env.OAUTH_CALLBACK_URL}/facebook`;
      
      if (!appId) {
        return res.status(500).json({ 
          success: false, 
          message: 'Facebook App chưa được cấu hình. Vui lòng liên hệ quản trị viên.' 
        });
      }

      // Build Facebook OAuth URL
      const scopes = 'pages_manage_metadata,pages_read_engagement,pages_messaging,pages_messaging_subscriptions';
      const facebookAuthUrl = `${FB_OAUTH_BASE}?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(stateData)}&scope=${scopes}`;

      return res.json({
        success: true,
        auth_url: facebookAuthUrl,
        state: hashedState,
        message: 'Vui lòng mở link để ủy quyền Facebook Page',
      });
    } catch (err) {
      console.error('[OAuth] Facebook init error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Handle Facebook OAuth callback
   * GET /api/webhooks/oauth/callback/facebook
   */
  async handleFacebookCallback(req, res) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
    try {
      const { code, state, error, error_reason } = req.query;

      // Handle user denied or error
      if (error) {
        console.log('[OAuth] Facebook user denied or error:', error, error_reason);
        return res.redirect(`${frontendUrl}/app/chatbot-studio?error=facebook_denied&reason=${encodeURIComponent(error_reason || error)}`);
      }

      if (!code) {
        return res.status(400).json({ success: false, message: 'Missing authorization code' });
      }

      let stateData = {};
      try {
        stateData = JSON.parse(Buffer.from(decodeURIComponent(state), 'base64').toString());
      } catch {
        return res.redirect(`${frontendUrl}/app/chatbot-studio?error=invalid_state`);
      }

      const { chatbot_id, redirect_to } = stateData;

      // Khóa chặt: bắt buộc phải có chatbot_id (Studio là đường duy nhất)
      if (!chatbot_id || redirect_to !== 'studio') {
        return res.redirect(
          `${frontendUrl}/app/chatbot-studio?error=missing_chatbot&message=${encodeURIComponent('Hãy kết nối Facebook từ trang Chatbot của bạn')}`
        );
      }

      // Exchange code for short-lived token
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      const redirectUri = `${process.env.OAUTH_CALLBACK_URL}/facebook`;

      const tokenResponse = await fetch(
        `${FB_GRAPH_BASE}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
      );
      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error('[OAuth] Token exchange error:', tokenData.error);
        return res.redirect(`${frontendUrl}/studio/chatbot/${chatbot_id}?tab=deploy&deployTab=facebook&channel_oauth=facebook&chatbot_id=${chatbot_id}&error=token_exchange_failed`);
      }

      const shortLivedToken = tokenData.access_token;

      const longLivedResponse = await fetch(
        `${FB_GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`
      );
      const longLivedData = await longLivedResponse.json();

      if (longLivedData.error) {
        console.error('[OAuth] Long-lived token exchange error:', longLivedData.error);
        return res.redirect(`${frontendUrl}/studio/chatbot/${chatbot_id}?tab=deploy&deployTab=facebook&channel_oauth=facebook&chatbot_id=${chatbot_id}&error=long_token_failed`);
      }

      const pageAccessToken = longLivedData.access_token;

      const pagesResponse = await fetch(
        `${FB_GRAPH_BASE}/me/accounts?access_token=${pageAccessToken}`
      );
      const pagesData = await pagesResponse.json();

      if (pagesData.error) {
        console.error('[OAuth] Get pages error:', pagesData.error);
        return res.redirect(`${frontendUrl}/studio/chatbot/${chatbot_id}?tab=deploy&deployTab=facebook&channel_oauth=facebook&chatbot_id=${chatbot_id}&error=get_pages_failed`);
      }

      if (!pagesData.data || pagesData.data.length === 0) {
        const meResponse = await fetch(
          `${FB_GRAPH_BASE}/me?access_token=${pageAccessToken}`
        );
        const meData = await meResponse.json();
        
        if (meData.id) {
          pagesData.data = [{
            id: meData.id,
            name: meData.name || 'Facebook Page',
            access_token: pageAccessToken,
          }];
        }
      }

      if (pagesData.data && pagesData.data.length > 0) {
        const pagesJson = encodeURIComponent(JSON.stringify(pagesData.data));
        return res.redirect(`${frontendUrl}/studio/chatbot/${chatbot_id}?tab=deploy&deployTab=facebook&channel_oauth=facebook&chatbot_id=${chatbot_id}&facebook_pages=${pagesJson}&token=${encodeURIComponent(pageAccessToken)}`);
      }

      return res.redirect(`${frontendUrl}/studio/chatbot/${chatbot_id}?tab=deploy&deployTab=facebook&channel_oauth=facebook&chatbot_id=${chatbot_id}&error=no_pages`);
    } catch (err) {
      console.error('[OAuth] Facebook callback error:', err);
      return res.redirect(`${frontendUrl}/app/chatbot-studio?error=callback_error`);
    }
  }

  /**
   * Complete Facebook connection after page selection
   * POST /api/webhooks/oauth/facebook/complete
   * @deprecated Hệ thống webhook theo tài khoản đã khai tử. Studio là đường duy nhất.
   */
  async completeFacebookConnection(req, res) {
    return res.status(400).json({
      success: false,
      message: 'Hãy kết nối Facebook từ trang Chatbot của bạn',
    });
  }


  // ── Zalo OA OAuth ─────────────────────────────────────────────

  /**
   * Khởi tạo Zalo OA OAuth flow
   * GET /api/webhooks/oauth/zalo-oa/init
   */
  async initZaloOAuth(req, res) {
    try {
      const { user_id } = req.user;
      const { chatbot_id, redirect_to } = req.query;
      
      const appId = process.env.ZALO_OA_APP_ID;
      const appSecret = process.env.ZALO_OA_APP_SECRET;
      
      if (!appId || !appSecret) {
        return res.status(500).json({ 
          success: false, 
          message: 'Zalo OA App chưa được cấu hình. Vui lòng liên hệ quản trị viên.' 
        });
      }

      // Generate state
      const stateData = { user_id, chatbot_id, redirect_to, timestamp: Date.now() };
      const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
      
      // Build Zalo OAuth URL
      const redirectUri = `${process.env.OAUTH_CALLBACK_URL}/zalo-oa`;
      const zaloAuthUrl = `${ZALO_OAUTH_URL}?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

      return res.json({
        success: true,
        auth_url: zaloAuthUrl,
        state,
        message: 'Vui lòng mở link để ủy quyền Zalo OA',
      });
    } catch (err) {
      console.error('[OAuth] Zalo init error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Handle Zalo OA OAuth callback
   * GET /api/webhooks/oauth/callback/zalo-oa
   */
  async handleZaloCallback(req, res) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
    try {
      const { code, state, error, error_description } = req.query;

      // Handle error
      if (error) {
        console.log('[OAuth] Zalo user denied or error:', error, error_description);
        return res.redirect(`${frontendUrl}/app/chatbot-studio?error=zalo_denied&reason=${encodeURIComponent(error_description || error)}`);
      }

      if (!code) {
        return res.status(400).json({ success: false, message: 'Missing authorization code' });
      }

      // Decode state
      let stateData;
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      } catch {
        return res.redirect(`${frontendUrl}/app/chatbot-studio?error=invalid_state`);
      }

      const { chatbot_id, redirect_to } = stateData;

      // Khóa chặt: bắt buộc phải có chatbot_id (Studio là đường duy nhất)
      if (!chatbot_id || redirect_to !== 'studio') {
        return res.redirect(
          `${frontendUrl}/app/chatbot-studio?error=missing_chatbot&message=${encodeURIComponent('Hãy kết nối Zalo OA từ trang Chatbot của bạn')}`
        );
      }

      // Exchange code for access token
      const appId = process.env.ZALO_OA_APP_ID;
      const appSecret = process.env.ZALO_OA_APP_SECRET;
      const redirectUri = `${process.env.OAUTH_CALLBACK_URL}/zalo-oa`;

      const tokenResponse = await fetch('https://oauth.zaloapp.com/v4/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Client-Id': appId,
          'Client-Secret': appSecret,
        },
        body: `code=${code}&app_id=${appId}&app_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&grant_type=authorization_code`,
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error('[OAuth] Zalo token exchange error:', tokenData.error);
        return res.redirect(`${frontendUrl}/studio/chatbot/${chatbot_id}?tab=deploy&deployTab=zalo&error=zalo_token_failed`);
      }

      const { access_token } = tokenData;

      // Get OA info
      let oaInfo = {};
      try {
        const profileResponse = await fetch('https://openapi.zalo.me/v3.0/oa/getprofile', {
          headers: { access_token },
        });
        oaInfo = await profileResponse.json();
      } catch (e) {
        console.warn('[OAuth] Zalo profile fetch error:', e.message);
      }

      return res.redirect(
        `${frontendUrl}/studio/chatbot/${chatbot_id}?tab=deploy&deployTab=zalo&channel_oauth=zalo&chatbot_id=${chatbot_id}&oa_name=${encodeURIComponent(oaInfo.name || 'Zalo OA')}&token=${encodeURIComponent(access_token)}`
      );
    } catch (err) {
      console.error('[OAuth] Zalo callback error:', err);
      return res.redirect(`${frontendUrl}/app/chatbot-studio?error=zalo_callback_error`);
    }
  }


  // ── WhatsApp Embedded Signup OAuth ─────────────────────────────

  /**
   * GET /api/webhooks/oauth/callback/whatsapp
   * Public endpoint — no JWT. State carries the userId via HMAC signature
   * (see whatsappOAuth.service.js signState/verifyState). Embedded Signup
   * typically delivers waba_id + phone_number_id directly in the query
   * string (popup → server → redirect). We stash them into the pending
   * store keyed by `state`, then redirect to the frontend ChannelSettings
   * tab where the user picks a chatbot + confirms the connection.
   */
  async handleWhatsAppCallback(req, res) {
    try {
      const {
        code,
        state,
        error,
        error_description,
        waba_id: wabaIdFromQuery,
        phone_number_id: phoneNumberIdFromQuery,
      } = req.query || {};

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
      const settingsPath = '/app/settings/channels';

      if (error) {
        console.log('[OAuth] WhatsApp user denied or error:', error, error_description);
        return res.redirect(
          `${frontendUrl}/oauth-result.html?whatsapp_oauth=denied&reason=${encodeURIComponent(error_description || error)}`
        );
      }

      const statePayload = verifyState(String(state || ''));
      if (!statePayload || statePayload.flow !== 'whatsapp_embedded_signup') {
        return res.redirect(`${frontendUrl}/oauth-result.html?whatsapp_oauth=invalid_state`);
      }

      // Exchange code → token. We pass userId from the signed state so the
      // service can decrypt that user's Meta App Secret at runtime.
      let exchange = null;
      if (code) {
        try {
          exchange = await whatsappOAuthService.exchangeCodeForToken({
            code: String(code),
            redirectUri: whatsappOAuthService.getConfig().redirectUri,
            userId: statePayload.userId,
            appId: statePayload.appId,
            credentialId: statePayload.credentialId,
          });
        } catch (exchangeErr) {
          console.warn('[OAuth] WhatsApp code exchange failed:', exchangeErr.message);
        }
      }

      const accessToken = exchange?.accessToken || null;
      const wabaId = exchange?.wabaId || wabaIdFromQuery || null;
      let phoneNumbers = [];
      if (accessToken && wabaId) {
        phoneNumbers = await whatsappOAuthService.fetchPhoneNumbers(wabaId, accessToken);
      }

      // Fall back to query-derived single phone when Meta already gave us one
      // and the user only has the one WABA number.
      if (!phoneNumbers.length && phoneNumberIdFromQuery) {
        phoneNumbers = [{
          id: phoneNumberIdFromQuery,
          display_phone_number: '',
          verified_name: '',
          quality_rating: 'UNKNOWN',
        }];
      }

      // Subscribe WABA to webhook so messages actually arrive.
      if (accessToken && wabaId) {
        await whatsappOAuthService.subscribeWabaToWebhook(wabaId, accessToken, {
          userId: statePayload.userId,
          appId: statePayload.appId,
        });
      }

      // Stash under a fresh state key the SPA will return to us.
      const pendingState = state;
      stashPendingOAuth(pendingState, {
        userId: statePayload.userId,
        appId: statePayload.appId,
        wabaId,
        accessToken,
        phoneNumbers,
      });

      const params = new URLSearchParams({
        whatsapp_oauth: 'success',
        state: pendingState,
      });
      if (wabaId) params.set('waba_id', String(wabaId));
      return res.redirect(`${frontendUrl}/oauth-result.html?${params.toString()}`);
    } catch (err) {
      console.error('[OAuth] WhatsApp callback error:', err);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
      return res.redirect(`${frontendUrl}/oauth-result.html?whatsapp_oauth=callback_error`);
    }
  }
}

// pendingOAuthStore lives in whatsappOAuth.service.js and is shared between
// handleWhatsAppCallback (write) and whatsappSettings.controller.completeOAuth
// (read). See stashPendingOAuth / consumePendingOAuth in that module.

export default new OAuthController();

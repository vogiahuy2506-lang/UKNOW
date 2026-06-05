import chatbotRepository from '../repositories/ai/chatbot.repository.js';
import crypto from 'crypto';

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
    try {
      const { code, state, error, error_reason } = req.query;

      // Handle user denied or error
      if (error) {
        console.log('[OAuth] Facebook user denied or error:', error, error_reason);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
        return res.redirect(`${frontendUrl}/settings/channel-connections?error=facebook_denied&reason=${error_reason || error}`);
      }

      if (!code) {
        return res.status(400).json({ success: false, message: 'Missing authorization code' });
      }

      let stateData = {};
      try {
        stateData = JSON.parse(Buffer.from(decodeURIComponent(state), 'base64').toString());
      } catch {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
        return res.redirect(`${frontendUrl}/settings/channel-connections?error=invalid_state`);
      }

      const { chatbot_id, redirect_to } = stateData;

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
        return res.redirect(`${process.env.FRONTEND_URL}/settings/channel-connections?error=token_exchange_failed`);
      }

      const shortLivedToken = tokenData.access_token;

      const longLivedResponse = await fetch(
        `${FB_GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`
      );
      const longLivedData = await longLivedResponse.json();

      if (longLivedData.error) {
        console.error('[OAuth] Long-lived token exchange error:', longLivedData.error);
        return res.redirect(`${process.env.FRONTEND_URL}/settings/channel-connections?error=long_token_failed`);
      }

      const pageAccessToken = longLivedData.access_token;

      const pagesResponse = await fetch(
        `${FB_GRAPH_BASE}/me/accounts?access_token=${pageAccessToken}`
      );
      const pagesData = await pagesResponse.json();

      if (pagesData.error) {
        console.error('[OAuth] Get pages error:', pagesData.error);
        return res.redirect(`${process.env.FRONTEND_URL}/settings/channel-connections?error=get_pages_failed`);
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

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
      if (pagesData.data && pagesData.data.length > 0) {
        const pagesJson = encodeURIComponent(JSON.stringify(pagesData.data));
        if (redirect_to === 'studio' && chatbot_id) {
          return res.redirect(`${frontendUrl}/studio/chatbot/${chatbot_id}?tab=deploy&deployTab=facebook&channel_oauth=facebook&chatbot_id=${chatbot_id}&facebook_pages=${pagesJson}&token=${encodeURIComponent(pageAccessToken)}`);
        }
        return res.redirect(`${frontendUrl}/settings/channel-connections?facebook_pages=${pagesJson}&token=${encodeURIComponent(pageAccessToken)}`);
      }

      if (redirect_to === 'studio' && chatbot_id) {
        return res.redirect(`${frontendUrl}/studio/chatbot/${chatbot_id}?tab=deploy&deployTab=facebook&channel_oauth=facebook&chatbot_id=${chatbot_id}&error=no_pages`);
      }
      return res.redirect(`${frontendUrl}/settings/channel-connections?error=no_pages`);
    } catch (err) {
      console.error('[OAuth] Facebook callback error:', err);
      return res.redirect(`${process.env.FRONTEND_URL}/settings/channel-connections?error=callback_error`);
    }
  }

  /**
   * Complete Facebook connection after page selection
   * POST /api/webhooks/oauth/facebook/complete
   */
  async completeFacebookConnection(req, res) {
    try {
      const { user_id } = req.user;
      const { page_id, page_name, page_access_token } = req.body;

      if (!page_id || !page_access_token) {
        return res.status(400).json({ success: false, message: 'Page ID và Access Token là bắt buộc' });
      }

      // Verify token
      const verifyResponse = await fetch(`${FB_GRAPH_BASE}/${page_id}?access_token=${page_access_token}`);
      const pageData = await verifyResponse.json();

      if (pageData.error) {
        return res.status(400).json({ 
          success: false, 
          message: `Token không hợp lệ: ${pageData.error.message}` 
        });
      }

      // Setup webhook automatically
      await this.setupFacebookWebhook(page_id, page_access_token);

      // Save channel connection
      const webhookUrl = `${process.env.BACKEND_PUBLIC_URL}/api/webhooks/facebook`;
      const channel = await chatbotRepository.upsertChannel(user_id, 'facebook', {
        display_name: page_name || pageData.name || 'Facebook Page',
        credentials: {
          page_access_token,
          page_id,
          page_name: pageData.name || page_name,
          connected_at: new Date().toISOString(),
        },
        webhook_url: webhookUrl,
        settings: { auto_setup: true },
      });

      return res.json({
        success: true,
        message: 'Kết nối Facebook thành công!',
        data: {
          page_name: pageData.name,
          page_id,
        },
      });
    } catch (err) {
      console.error('[OAuth] Complete Facebook connection error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Auto setup Facebook webhook subscription
   */
  async setupFacebookWebhook(pageId, accessToken) {
    try {
      const webhookUrl = `${process.env.BACKEND_PUBLIC_URL}/api/webhooks/facebook`;
      
      // Subscribe app to page
      const subscribeResponse = await fetch(
        `${FB_GRAPH_BASE}/${pageId}/subscribed_apps?access_token=${accessToken}`,
        { method: 'POST' }
      );
      const subscribeData = await subscribeResponse.json();

      if (subscribeData.success) {
        console.log('[Facebook] Successfully subscribed to page webhook');
      } else {
        console.warn('[Facebook] Webhook subscription response:', subscribeData);
      }

      return subscribeData;
    } catch (err) {
      console.warn('[Facebook] Webhook setup error (non-critical):', err.message);
      return null;
    }
  }

  // ── Zalo OA OAuth ─────────────────────────────────────────────

  /**
   * Khởi tạo Zalo OA OAuth flow
   * GET /api/webhooks/oauth/zalo-oa/init
   */
  async initZaloOAuth(req, res) {
    try {
      const { user_id } = req.user;
      
      const appId = process.env.ZALO_OA_APP_ID;
      const appSecret = process.env.ZALO_OA_APP_SECRET;
      
      if (!appId || !appSecret) {
        return res.status(500).json({ 
          success: false, 
          message: 'Zalo OA App chưa được cấu hình. Vui lòng liên hệ quản trị viên.' 
        });
      }

      // Generate state
      const stateData = { user_id, timestamp: Date.now() };
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
    try {
      const { code, state, error, error_description } = req.query;

      // Handle error
      if (error) {
        console.log('[OAuth] Zalo user denied or error:', error, error_description);
        return res.redirect(`${process.env.FRONTEND_URL}/settings/channel-connections?error=zalo_denied&reason=${error_description || error}`);
      }

      if (!code) {
        return res.status(400).json({ success: false, message: 'Missing authorization code' });
      }

      // Decode state
      let stateData;
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      } catch {
        return res.redirect(`${process.env.FRONTEND_URL}/settings/channel-connections?error=invalid_state`);
      }

      const { user_id } = stateData;

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
        return res.redirect(`${process.env.FRONTEND_URL}/settings/channel-connections?error=zalo_token_failed`);
      }

      const { access_token, refresh_token, expires_in } = tokenData;

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

      // Save connection directly (Zalo OA is simpler)
      const webhookUrl = `${process.env.BACKEND_PUBLIC_URL}/api/webhooks/zalo-oa`;
      const channel = await chatbotRepository.upsertChannel(user_id, 'zalo_oa', {
        display_name: oaInfo.name || 'Zalo OA',
        credentials: {
          access_token,
          refresh_token,
          expires_in,
          zalo_app_id: appId,
          connected_at: new Date().toISOString(),
        },
        webhook_url: webhookUrl,
        settings: { auto_setup: true },
      });

      return res.redirect(`${process.env.FRONTEND_URL}/settings/channel-connections?success=zalo_connected&name=${encodeURIComponent(oaInfo.name || 'Zalo OA')}`);
    } catch (err) {
      console.error('[OAuth] Zalo callback error:', err);
      return res.redirect(`${process.env.FRONTEND_URL}/settings/channel-connections?error=zalo_callback_error`);
    }
  }
}

export default new OAuthController();

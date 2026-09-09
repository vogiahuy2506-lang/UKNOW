import axios from 'axios';
import crypto from 'crypto';
import whatsappCredentialsService from './whatsappCredentials.service.js';

const FB_GRAPH_BASE = 'https://graph.facebook.com/v18.0';
const STATE_TTL_SECONDS = 10 * 60; // 10 minutes — covers a popup OAuth round-trip
const STATE_SECRET = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'uknow-oauth-state';

// Shared pending OAuth store. Keyed by the state token (which has already
// been HMAC-verified at this point). Cleared after one read or after TTL.
const pendingOAuthStore = new Map();

function prunePendingOAuthStore() {
  const now = Date.now();
  for (const [key, entry] of pendingOAuthStore.entries()) {
    if (now - entry.createdAt > STATE_TTL_SECONDS * 1000) {
      pendingOAuthStore.delete(key);
    }
  }
}

export function stashPendingOAuth(state, payload) {
  prunePendingOAuthStore();
  pendingOAuthStore.set(state, { ...payload, createdAt: Date.now() });
}

export function consumePendingOAuth(state) {
  const entry = pendingOAuthStore.get(state);
  if (!entry) return null;
  pendingOAuthStore.delete(state);
  if (Date.now() - entry.createdAt > STATE_TTL_SECONDS * 1000) return null;
  return entry;
}

// Read the pending entry without consuming it (so both the pending-OAuth
// GET and the eventual complete-OAuth POST can see the same data).
export function peekPendingOAuth(state) {
  const entry = pendingOAuthStore.get(state);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > STATE_TTL_SECONDS * 1000) return null;
  return entry;
}

function readAppCredentials() {
  // Legacy synchronous fallback. For per-user credentials callers MUST go
  // through whatsappCredentialsService.resolveCredentials({ userId }) instead.
  return {
    appId: process.env.WHATSAPP_APP_ID || process.env.META_APP_ID || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || '',
    redirectUri:
      process.env.WHATSAPP_OAUTH_REDIRECT_URI
      || `${process.env.BACKEND_PUBLIC_URL || ''}/api/webhooks/oauth/callback/whatsapp`,
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'uknow_whatsapp_verify',
  };
}

async function resolveCredentialsForUser(userId, appId) {
  const creds = await whatsappCredentialsService.resolveCredentials({ userId, appId });
  if (!creds) {
    throw new Error(
      'Chưa có Meta App credentials cho tài khoản của bạn. '
      + 'Vào Settings → WhatsApp → Thêm App ID + App Secret.'
    );
  }
  return creds;
}

/**
 * Sign a state payload so the public callback can verify identity without
 * JWT middleware. Encodes `userId`, `nonce` and `exp` then signs with HMAC.
 */
function signState(payload) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', STATE_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyState(stateToken) {
  if (!stateToken || typeof stateToken !== 'string') return null;
  const dotIndex = stateToken.lastIndexOf('.');
  if (dotIndex < 1) return null;
  const encoded = stateToken.slice(0, dotIndex);
  const signature = stateToken.slice(dotIndex + 1);
  const expected = crypto
    .createHmac('sha256', STATE_SECRET)
    .update(encoded)
    .digest('base64url');
  try {
    if (
      signature.length !== expected.length
      || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    if (Number(payload.exp) * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

class WhatsAppOAuthService {
  /**
   * Build the Meta OAuth URL used by the Embedded Signup flow. The user will
   * pick the WABA + phone number inside the popup, then Meta redirects back
   * to `redirectUri` with `code` and `state`.
   *
   * `userId` is REQUIRED — we look up the user's own Meta App credentials
   * (instead of reading shared env vars) so each customer uses their own App.
   */
  async buildAuthorizationUrl({ userId, appId } = {}) {
    const creds = await resolveCredentialsForUser(userId, appId);
    const redirectUri = process.env.WHATSAPP_OAUTH_REDIRECT_URI
      || `${process.env.BACKEND_PUBLIC_URL || ''}/api/webhooks/oauth/callback/whatsapp`;
    if (!creds.appId || !redirectUri) {
      throw new Error('WHATSAPP_OAUTH_REDIRECT_URI chưa được cấu hình');
    }

    const state = signState({
      userId,
      appId: creds.appId,
      credentialId: creds.id || null,
      nonce: crypto.randomBytes(8).toString('hex'),
      flow: 'whatsapp_embedded_signup',
    });

    const scopes = [
      'whatsapp_business_management',
      'whatsapp_business_messaging',
      'business_management',
    ].join(',');

    const url = new URL(`${FB_GRAPH_BASE}/dialog/oauth`);
    url.searchParams.set('client_id', creds.appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes);
    url.searchParams.set('state', state);
    if (process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID) {
      url.searchParams.set('config_id', process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID);
    }

    return { url: url.toString(), state };
  }

  /**
   * Exchange the short-lived `code` for a long-lived user access token.
   * Embedded Signup responses also include `waba_id` and `phone_number_id`
   * when the user picked numbers during the popup flow.
   *
   * `userId` and optional `appId` resolve to the user's Meta App credentials
   * stored in the DB (encrypted).
   */
  async exchangeCodeForToken({ code, redirectUri, userId, appId, credentialId }) {
    const creds = await resolveCredentialsForUser(userId, appId || (credentialId ? undefined : undefined));
    const effectiveRedirect = redirectUri
      || process.env.WHATSAPP_OAUTH_REDIRECT_URI
      || `${process.env.BACKEND_PUBLIC_URL || ''}/api/webhooks/oauth/callback/whatsapp`;

    const response = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
      params: {
        client_id: creds.appId,
        client_secret: creds.appSecret,
        redirect_uri: effectiveRedirect,
        code,
      },
      timeout: 15000,
    });

    const data = response.data || {};
    if (!data.access_token) {
      throw new Error(`Meta token exchange failed: ${JSON.stringify(data)}`);
    }

    if (creds.id) {
      // Best-effort bookkeeping — don't fail the flow if it errors.
      try {
        await whatsappCredentialsService.recordCredentialUse(creds.id);
      } catch (_err) {
        /* noop */
      }
    }
    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in || null,
      wabaId: data.waba_id || null,
      phoneNumberId: data.phone_number_id || null,
    };
  }

  /**
   * Upgrade a short-lived user access token to a long-lived (~60 days) one.
   * Required before persisting the token — short-lived tokens expire in ~2h.
   */
  async exchangeForLongLivedToken(shortLivedToken, { userId, appId } = {}) {
    const creds = await resolveCredentialsForUser(userId, appId);
    const response = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: creds.appId,
        client_secret: creds.appSecret,
        fb_exchange_token: shortLivedToken,
      },
      timeout: 15000,
    });
    return response.data || {};
  }

  /**
   * Fetch the WhatsApp Business Account ID and display info for the
   * authenticated user. Returns null when the user hasn't selected a WABA yet.
   */
  async fetchWabaInfo(accessToken) {
    try {
      const response = await axios.get(`${FB_GRAPH_BASE}/me`, {
        params: {
          fields: 'id,name,business_account',
          access_token: accessToken,
        },
        timeout: 15000,
      });
      return response.data || null;
    } catch {
      return null;
    }
  }

  /**
   * List phone numbers attached to a WABA. Returns an array (may be empty).
   */
  async fetchPhoneNumbers(wabaId, accessToken) {
    if (!wabaId) return [];
    try {
      const response = await axios.get(`${FB_GRAPH_BASE}/${wabaId}/phone_numbers`, {
        params: {
          fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status',
          access_token: accessToken,
        },
        timeout: 15000,
      });
      return Array.isArray(response.data?.data) ? response.data.data : [];
    } catch (err) {
      console.warn(`[WhatsAppOAuth] fetchPhoneNumbers failed for waba=${wabaId}: ${err.message}`);
      return [];
    }
  }

  /**
   * Subscribe the WABA to webhook events for `messages`. Without this the
   * WABA never delivers inbound messages to our endpoint.
   *
   * `verifyToken` resolution order:
   *   1. The per-user credential row's `webhook_verify_token` (set at
   *      registration), if present.
   *   2. The platform-level `WHATSAPP_WEBHOOK_VERIFY_TOKEN` env var.
   */
  async subscribeWabaToWebhook(wabaId, accessToken, { userId, appId } = {}) {
    if (!wabaId) {
      throw new Error('subscribeWabaToWebhook: wabaId is required');
    }
    let verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
    if (userId) {
      try {
        const creds = await resolveCredentialsForUser(userId, appId);
        if (creds.webhookVerifyToken) verifyToken = creds.webhookVerifyToken;
      } catch (_err) {
        // Fall back to env if the user has no credentials row (admin / dev).
      }
    }
    const callbackUrl = `${process.env.BACKEND_PUBLIC_URL || ''}/api/webhooks/chatbot/whatsapp`;
    try {
      const response = await axios.post(
        `${FB_GRAPH_BASE}/${wabaId}/subscribed_apps`,
        {
          callback_url: callbackUrl,
          verify_token: verifyToken,
          fields: ['messages'],
        },
        {
          params: { access_token: accessToken },
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );
      return response.data || { success: true };
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.message;
      console.warn(`[WhatsAppOAuth] subscribeWabaToWebhook failed for waba=${wabaId}: ${detail}`);
      // Subscription failure is non-fatal for PR 1 — webhook config can be
      // retried via the Meta dashboard, but surface the error for visibility.
      return { success: false, error: detail };
    }
  }

  getConfig() {
    return readAppCredentials();
  }
}

export default new WhatsAppOAuthService();

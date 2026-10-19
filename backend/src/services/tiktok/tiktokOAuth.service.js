/**
 * tiktokOAuth.service.js
 *
 * OAuth 2.0 cho TikTok Business Messaging v1.3.
 * - authorize URL: https://www.tiktok.com/v2/auth/authorize/
 * - token endpoint: https://open.tiktokapis.com/v2/oauth/token/ (form-urlencoded)
 * - token TTL: access_token = 24h, refresh_token = 365d
 * - state HMAC-SHA256: dùng env OAUTH_STATE_SECRET (giống WhatsApp OAuth ở
 *   `backend/src/services/chatbot/whatsappOAuth.service.js:7-19`, fallback
 *   JWT_SECRET). KHÔNG dùng SMTP_SECRET_KEY (đó là key mã hoá at-rest).
 *
 * Bẫy 11 của plan: state PHẢI có chữ ký để chống CSRF.
 * Bẫy 14: sau khi exchange code, gọi GET /v2/user/info/ để lấy region + role,
 * reject nếu region ∈ {EEA, CH, UK} hoặc role === 'personal_account'.
 *
 * Việc 2.2 của plan tiktok-business-messaging-integration.md.
 */

import crypto from 'crypto';
import {
  encryptSmtpSecret,
  decryptSmtpSecret,
} from '../../utils/smtpSecretCrypto.js';

const TIKTOK_AUTH_BASE = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_BASE = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USERINFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

const DEFAULT_SCOPES = [
  'user.info.basic',                // login kit — cần cho region/role check
  'dm.message.send',                // gửi DM tới conversation
  'dm.message.read',                // đọc DM (sync history)
  'dm.conversation.list',           // list conversations
  'dm.webhook.subscribe',           // đăng ký webhook
  'business.profile.read',          // đọc thông tin business
].join(',');

/**
 * Lấy key HMAC ký state. Tương tự `whatsappOAuth.service.js:7-19`:
 * - Ưu tiên OAUTH_STATE_SECRET (env riêng để rotate độc lập)
 * - Fallback JWT_SECRET (đã có sẵn ở UKNOW)
 * - Thiếu cả hai thì ném lỗi (fail-closed)
 *
 * @returns {string}
 */
export function getStateSecret() {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'Chưa cấu hình OAUTH_STATE_SECRET (hoặc JWT_SECRET) để ký state OAuth cho TikTok'
    );
  }
  return secret;
}

/**
 * Sinh state HMAC có chữ ký. Payload: `${userId}.${nonce}.${createdAt}`.
 * Format tương tự WhatsApp (`whatsappOAuth.service.js`) — ký toàn bộ
 * payload, base64url. Receiver verify bằng `verifyState`.
 *
 * @param {number} userId
 * @returns {{ state: string, nonce: string, createdAt: number }}
 */
export function signState(userId) {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const createdAt = Date.now();
  const payload = `${userId}.${nonce}.${createdAt}`;
  const sig = crypto
    .createHmac('sha256', getStateSecret())
    .update(payload)
    .digest('base64url');
  return { state: `${payload}.${sig}`, nonce, createdAt };
}

/**
 * Verify state từ callback. Trả về `{ userId, nonce, createdAt }` nếu hợp lệ,
 * throw nếu sai chữ ký hoặc state hết hạn (>10 phút — TTL khớp với
 * `whatsappOAuth.service.js:STATE_TTL_SECONDS`).
 *
 * @param {string} state
 * @returns {{ userId: number, nonce: string, createdAt: number }}
 */
export function verifyState(state) {
  if (typeof state !== 'string' || !state.includes('.')) {
    throw new Error('OAuth state không hợp lệ');
  }
  const parts = state.split('.');
  if (parts.length !== 4) {
    throw new Error('OAuth state sai định dạng');
  }
  const [userIdStr, nonce, createdAtStr, sig] = parts;
  const userId = Number.parseInt(userIdStr, 10);
  const createdAt = Number.parseInt(createdAtStr, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('OAuth state chứa userId không hợp lệ');
  }
  if (!Number.isFinite(createdAt)) {
    throw new Error('OAuth state chứa createdAt không hợp lệ');
  }
  // TTL 10 phút — phủ OAuth round-trip
  if (Date.now() - createdAt > 10 * 60 * 1000) {
    throw new Error('OAuth state đã hết hạn (>10 phút)');
  }
  const payload = `${userIdStr}.${nonce}.${createdAtStr}`;
  const expected = crypto
    .createHmac('sha256', getStateSecret())
    .update(payload)
    .digest('base64url');
  // So sánh constant-time chống timing attack
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (
    sigBuf.length !== expectedBuf.length
    || !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    throw new Error('OAuth state chữ ký không khớp');
  }
  return { userId, nonce, createdAt };
}

/**
 * Sinh URL authorize để redirect user sang TikTok. Caller (controller) gắn
 * state trước khi redirect.
 *
 * @param {object} params
 * @param {string} params.redirectUri - TIKTOK_OAUTH_REDIRECT_URI env
 * @param {string} params.state - từ signState()
 * @param {string} [params.scopes] - mặc định DEFAULT_SCOPES
 * @returns {string}
 */
export function getAuthorizeUrl({ redirectUri, state, scopes }) {
  const clientKey = process.env.TIKTOK_APP_CLIENT_KEY;
  if (!clientKey) {
    throw new Error('Thiếu TIKTOK_APP_CLIENT_KEY');
  }
  if (!redirectUri) {
    throw new Error('Thiếp redirectUri');
  }
  if (!state) {
    throw new Error('Thiếu state');
  }
  const url = new URL(TIKTOK_AUTH_BASE);
  url.searchParams.set('client_key', clientKey);
  url.searchParams.set('scope', scopes || DEFAULT_SCOPES);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Đổi `code` lấy access_token + refresh_token. Gọi POST form-urlencoded.
 *
 * Response từ TikTok (theo docs v1.3):
 *   {
 *     access_token, refresh_token, open_id, scope,
 *     expires_in, refresh_expires_in, token_type
 *   }
 *
 * @param {object} params
 * @param {string} params.code
 * @param {string} params.redirectUri
 * @returns {Promise<{ accessToken, refreshToken, openId, scope, expiresIn, refreshExpiresIn }>}
 */
export async function exchangeCodeForToken({ code, redirectUri }) {
  const clientKey = process.env.TIKTOK_APP_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_APP_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error('Thiếu TIKTOK_APP_CLIENT_KEY hoặc TIKTOK_APP_CLIENT_SECRET');
  }
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const resp = await fetch(TIKTOK_TOKEN_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.error) {
    // TikTok trả error: { error, error_description, log_id, request_id }
    const err = new Error(
      data.error_description || data.error || `TikTok OAuth trả HTTP ${resp.status}`
    );
    err.code = data.error || 'tiktok_oauth_error';
    err.requestId = data.request_id;
    err.logId = data.log_id;
    err.httpStatus = resp.status;
    throw err;
  }
  if (!data.access_token || !data.refresh_token || !data.open_id) {
    throw new Error(
      `TikTok OAuth response thiếu field bắt buộc: ${JSON.stringify(Object.keys(data))}`
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    openId: data.open_id,
    scope: data.scope,
    expiresIn: data.expires_in,
    refreshExpiresIn: data.refresh_expires_in,
  };
}

/**
 * Refresh access token bằng refresh_token (365d). Gọi khi access_token
 * sắp hết hạn hoặc vừa fail 401.
 *
 * @param {string} refreshToken  // PLAINTEXT (do caller đã decryptSmtpSecret trước)
 * @returns {Promise<{ accessToken, refreshToken, expiresIn, refreshExpiresIn }>}
 */
export async function refreshAccessToken(refreshToken) {
  const clientKey = process.env.TIKTOK_APP_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_APP_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error('Thiếu TIKTOK_APP_CLIENT_KEY hoặc TIKTOK_APP_CLIENT_SECRET');
  }
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const resp = await fetch(TIKTOK_TOKEN_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.error) {
    const err = new Error(
      data.error_description || data.error || `TikTok refresh trả HTTP ${resp.status}`
    );
    err.code = data.error || 'tiktok_refresh_error';
    err.requestId = data.request_id;
    err.logId = data.log_id;
    err.httpStatus = resp.status;
    throw err;
  }
  if (!data.access_token || !data.refresh_token) {
    throw new Error('TikTok refresh response thiếu access_token hoặc refresh_token');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    refreshExpiresIn: data.refresh_expires_in,
  };
}

/**
 * Revoke access token. Theo docs v1.3, gọi khi user ngắt kết nối.
 *
 * @param {string} accessToken  // PLAINTEXT
 * @returns {Promise<boolean>}
 */
export async function revokeToken(accessToken) {
  const clientKey = process.env.TIKTOK_APP_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_APP_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error('Thiếu TIKTOK_APP_CLIENT_KEY hoặc TIKTOK_APP_CLIENT_SECRET');
  }
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    token: accessToken,
  });
  const resp = await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  // Revoke thành công TikTok trả HTTP 200 + body trống; lỗi trả JSON error
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    const err = new Error(
      data.error_description || data.error || `TikTok revoke trả HTTP ${resp.status}`
    );
    err.code = data.error || 'tiktok_revoke_error';
    throw err;
  }
  return true;
}

/**
 * Lấy thông tin user (region, role, display_name) sau khi OAuth. Dùng để
 * check Bẫy 14 (region blocked) và Bẫy 16 (personal account).
 *
 * @param {string} accessToken  // PLAINTEXT
 * @returns {Promise<{ openId, displayName, region, role, avatarUrl }>}
 */
export async function getUserInfo(accessToken) {
  const url = new URL(TIKTOK_USERINFO_URL);
  url.searchParams.set('fields', 'open_id,display_name,region,role,avatar_url');
  const resp = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.error) {
    const err = new Error(
      data.error?.message || `TikTok userinfo trả HTTP ${resp.status}`
    );
    err.code = data.error?.code || 'tiktok_userinfo_error';
    err.requestId = data.request_id;
    throw err;
  }
  const user = data.data?.user || {};
  return {
    openId: user.open_id,
    displayName: user.display_name,
    region: user.region,
    role: user.role,
    avatarUrl: user.avatar_url,
  };
}

/**
 * Map region từ TikTok → danh sách region mà Business Messaging API HỖ TRỢ.
 * Theo docs v1.3:
 * - APAC, LATAM, METAP (Middle East / Turkey / Africa / Pakistan), NA: HỖ TRỢ
 * - EEA (EU), CH, UK: KHÔNG hỗ trợ
 *
 * @param {string} region  // 'APAC' | 'LATAM' | 'METAP' | 'NA' | 'EEA' | 'CH' | 'UK' | ...
 * @returns {boolean}
 */
export function isRegionSupported(region) {
  return ['APAC', 'LATAM', 'METAP', 'NA'].includes(String(region || '').toUpperCase());
}

// ── Named exports cho cả default object lẫn named import ─────────────
// Test dùng named import (`import { DEFAULT_SCOPES } from ...`); controller / service
// dùng default (`import tiktokOAuthService from ...`).
export { DEFAULT_SCOPES };

export default {
  signState,
  verifyState,
  getAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  revokeToken,
  getUserInfo,
  isRegionSupported,
  DEFAULT_SCOPES,
};

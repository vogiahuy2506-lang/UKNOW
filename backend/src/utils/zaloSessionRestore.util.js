/**
 * Zalo Session Restore Utility
 *
 * Shared utility để restore Zalo session từ cookie.
 * Sử dụng cùng logic như zaloSettingsController nhưng đơn giản hóa.
 */

import { Zalo } from 'zca-js';
import { getZaloHttpPolyfillOption } from './zaloUndiciFetch.util.js';
import crypto from 'node:crypto';

/**
 * Default user agent cho Zalo
 */
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const DEFAULT_LANGUAGE = 'vi';

/**
 * Build IMEI từ user agent
 */
function buildImeiFromUserAgent(userAgent) {
  const ua = String(userAgent || '').trim() || DEFAULT_USER_AGENT;
  return `${crypto.randomUUID()}-${crypto.createHash('md5').update(ua).digest('hex')}`;
}

/**
 * Serialize cookie source thành string
 */
function serializeCookieSource(cookieSource) {
  if (!cookieSource) return '';
  try {
    if (typeof cookieSource === 'string') return cookieSource.trim();
    if (Array.isArray(cookieSource) || typeof cookieSource === 'object') {
      return JSON.stringify(cookieSource);
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * Deserialize cookie text từ DB
 */
function deserializeCookieSource(cookieText) {
  const normalized = String(cookieText || '').trim();
  if (!normalized) return null;
  try {
    return JSON.parse(normalized);
  } catch {
    return normalized;
  }
}

/**
 * Normalize credentials từ cookie source
 */
function normalizeLoginCredentials(source) {
  if (!source) return null;

  const safeObject = source && typeof source === 'object' ? source : null;
  const userAgent = String(
    safeObject?.userAgent || safeObject?.user_agent || safeObject?.ua || ''
  ).trim() || DEFAULT_USER_AGENT;
  const language = String(safeObject?.language || '').trim() || DEFAULT_LANGUAGE;
  const cookie = safeObject
    ? (safeObject.cookie || safeObject.cookies || null)
    : source;
  if (!cookie) return null;

  const imei = String(safeObject?.imei || '').trim() || buildImeiFromUserAgent(userAgent);
  return { imei, userAgent, language, cookie };
}

/**
 * Build credential candidates từ cookie text
 */
function buildLoginCredentialCandidates(cookieText) {
  const parsedCookie = deserializeCookieSource(cookieText);
  const candidates = [];
  const seen = new Set();

  const registerCandidate = (value) => {
    const normalized = normalizeLoginCredentials(value);
    if (!normalized) return;
    const dedupeKey = JSON.stringify({
      imei: normalized.imei,
      userAgent: normalized.userAgent,
      language: normalized.language,
      cookie: serializeCookieSource(normalized.cookie),
    });
    if (!dedupeKey || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    candidates.push(normalized);
  };

  // Register various forms
  registerCandidate(parsedCookie);
  registerCandidate(cookieText);
  if (parsedCookie && typeof parsedCookie === 'object' && !Array.isArray(parsedCookie)) {
    registerCandidate(parsedCookie.cookie);
    registerCandidate(parsedCookie.cookies);
  }
  if (Array.isArray(parsedCookie)) {
    registerCandidate(parsedCookie);
  }

  return candidates;
}

/**
 * Kiểm tra session timeout error
 */
function isQrSessionTimeoutIssue(error) {
  if (!error) return false;
  const errorCode = Number(error?.error_code);
  const errorMessage = String(error?.message || '').toLowerCase();
  return (
    errorCode === 102 ||
    errorMessage.includes('session key was improperly submitted') ||
    errorMessage.includes('has reached its timeout') ||
    errorMessage.includes('cannot get session, login failed') ||
    errorMessage.includes("can't login") ||
    errorMessage.includes('login failed')
  );
}

/**
 * Tạo Zalo instance với options chuẩn
 */
function createZaloInstance() {
  return new Zalo({
    selfListen: false,
    checkUpdate: true,
    logging: true, // Enable logging for debugging
    ...getZaloHttpPolyfillOption(),
  });
}

/**
 * Kiểm tra xem lỗi có phải là do cookie hết hạn/revoke
 */
function isCookieExpiredError(error) {
  if (!error) return false;
  const msg = String(error?.message || '').toLowerCase();
  return (
    msg.includes('đăng nhập thất bại') ||
    msg.includes('login failed') ||
    msg.includes('invalid cookie') ||
    msg.includes('cookie expired') ||
    msg.includes('session expired') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden')
  );
}

/**
 * Thử login với credentials
 */
async function tryLoginWithCredentials(credentials) {
  console.log('[ZaloRestore] Attempting login with credentials...');
  console.log('[ZaloRestore] IMEI:', credentials.imei?.substring(0, 30) + '...');
  console.log('[ZaloRestore] UserAgent:', credentials.userAgent?.substring(0, 50) + '...');
  console.log('[ZaloRestore] Has cookie:', !!credentials.cookie);

  const zalo = createZaloInstance();

  if (!zalo?.login || typeof zalo.login !== 'function') {
    throw new Error('ZALO_LOGIN_METHOD_UNAVAILABLE');
  }

  const api = await zalo.login(credentials);
  console.log('[ZaloRestore] Login returned API:', !!api);
  return api;
}

/**
 * Thử đăng nhập với nhiều strategy
 */
async function loginWithStrategies(credentials) {
  // Strategy 1: SDK login (đơn giản và hiệu quả)
  try {
    console.log('[ZaloRestore] Strategy 1: SDK login...');
    const api = await tryLoginWithCredentials(credentials);
    if (api) {
      console.log('[ZaloRestore] ✅ SDK login success!');
      return api;
    }
  } catch (error) {
    console.warn('[ZaloRestore] ❌ SDK login failed:', error.message);
    if (isQrSessionTimeoutIssue(error)) {
      throw error; // Don't retry on session timeout
    }
  }

  // Strategy 2: Thử với cookie đã serialized - skip nếu Strategy 1 đã thất bại rõ ràng
  // Serialized cookie thường không hoạt động tốt hơn
  console.log('[ZaloRestore] Strategy 2: Skipping (serialized cookie rarely works better)');

  throw new Error('ALL_LOGIN_STRATEGIES_FAILED');
}

/**
 * Main function: Restore Zalo session từ cookie text
 *
 * @param {string} cookieText - Cookie text từ DB
 * @param {number} maxRetries - Số lần thử lại (mặc định 3)
 * @returns {Promise<any>} - Zalo API instance
 */
export async function restoreZaloSessionFromCookie(cookieText, maxRetries = 3) {
  console.log('[ZaloRestore] Starting session restore process...');

  const credentialCandidates = buildLoginCredentialCandidates(cookieText);

  if (!credentialCandidates.length) {
    console.error('[ZaloRestore] No valid credentials found in cookie text');
    throw new Error('COOKIE_TEXT_EMPTY');
  }

  console.log(`[ZaloRestore] Found ${credentialCandidates.length} credential candidates to try`);

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let cookieExpired = false;

  for (let retry = 0; retry <= maxRetries; retry++) {
    if (retry > 0) {
      console.log(`[ZaloRestore] ⏳ Retry ${retry}/${maxRetries} after 3 seconds...`);
      await delay(3000);
    }

    for (let i = 0; i < credentialCandidates.length; i++) {
      const credentials = credentialCandidates[i];
      try {
        console.log(`[ZaloRestore] Trying candidate ${i + 1}/${credentialCandidates.length}...`);
        const api = await loginWithStrategies(credentials);
        if (api) {
          console.log('[ZaloRestore] ✅✅✅ Session restored successfully!');
          return api;
        }
      } catch (error) {
        console.warn(`[ZaloRestore] Candidate ${i + 1} failed:`, error.message);

        // Check if cookie is expired
        if (isCookieExpiredError(error) || isQrSessionTimeoutIssue(error)) {
          cookieExpired = true;
          console.log('[ZaloRestore] ⚠️ Cookie appears to be expired or revoked by Zalo');
          // Skip other candidates since they all use the same cookie
          break;
        }
      }
    }

    // If cookie is expired, don't waste time retrying
    if (cookieExpired) {
      console.log('[ZaloRestore] ⚠️ Cookie is expired - user needs to re-login with QR code');
      break;
    }

    // If not last retry and cookie not expired, continue
    if (retry < maxRetries) {
      console.log(`[ZaloRestore] All candidates failed, will retry...`);
      continue;
    }

    // Last attempt failed
    console.error('[ZaloRestore] ❌❌❌ All restore attempts failed');
  }

  throw new Error('RESTORE_SESSION_FAILED');
}

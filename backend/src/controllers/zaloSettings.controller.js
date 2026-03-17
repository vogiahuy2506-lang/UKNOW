import db from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { API, LoginQRCallbackEventType, Zalo } from 'zca-js';
import { createContext, isContextSession } from '../../node_modules/zca-js/dist/context.js';
import { getServerInfo as rawGetServerInfo, login as rawCookieLogin } from '../../node_modules/zca-js/dist/apis/login.js';
import { loginQR as rawLoginQR } from '../../node_modules/zca-js/dist/apis/loginQR.js';
import { generateZaloUUID } from '../../node_modules/zca-js/dist/utils.js';
import { request as rawRequest } from '../../node_modules/zca-js/dist/utils.js';
import zaloAccountSessionService from '../services/zalo/zaloAccountSession.service.js';
import campaignZaloSenderService from '../services/campaign/campaignZaloSender.service.js';

class ZaloSettingsController {
  constructor() {
    this.loginSessions = new Map();
    this.loginSessionTtlMs = 10 * 60 * 1000;
    this.defaultZaloUserAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
    this.defaultZaloLanguage = 'vi';
  }

  /**
   * Nhận diện chuỗi base64 (không gồm prefix data URL).
   *
   * @param {string} value
   * @returns {boolean}
   */
  isLikelyBase64(value) {
    const normalized = String(value || '').trim();
    if (!normalized || normalized.length < 100) return false;
    return /^[A-Za-z0-9+/=\r\n]+$/.test(normalized);
  }

  /**
   * Tạo data URL từ base64 thô.
   *
   * @param {string} base64Value
   * @param {string} mimeType
   * @returns {string}
   */
  buildDataUrlFromBase64(base64Value, mimeType = 'image/png') {
    const rawBase64 = String(base64Value || '')
      .trim()
      .replace(/^data:[^;]+;base64,/i, '');
    return `data:${mimeType};base64,${rawBase64}`;
  }

  /**
   * Tìm chuỗi dữ liệu ảnh QR trong object lồng nhau.
   *
   * @param {unknown} input
   * @returns {string|null}
   */
  extractQrStringDeep(input) {
    const queue = [input];
    const visited = new Set();
    const candidateKeys = ['qrImage', 'qr', 'dataUrl', 'dataURL', 'image', 'base64', 'content'];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      if (typeof current === 'string') {
        const trimmed = current.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('data:image/')) return trimmed;
        if (this.isLikelyBase64(trimmed)) return trimmed;
        continue;
      }

      if (Buffer.isBuffer(current)) {
        return current.toString('base64');
      }

      if (typeof current !== 'object') continue;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const key of candidateKeys) {
        const value = current?.[key];
        if (typeof value === 'string' && value.trim()) {
          const trimmed = value.trim();
          if (trimmed.startsWith('data:image/') || this.isLikelyBase64(trimmed)) {
            return trimmed;
          }
        }
      }

      for (const value of Object.values(current)) {
        if (value && (typeof value === 'object' || typeof value === 'string' || Buffer.isBuffer(value))) {
          queue.push(value);
        }
      }
    }

    return null;
  }

  buildMissingTableResponse(res) {
    return res.status(500).json({
      success: false,
      message:
        'Bảng zalo_settings chưa tồn tại. Vui lòng chạy file SQL backend/sql/20260228_create_zalo_settings.sql trước khi sử dụng.',
      code: 'ZALO_SETTINGS_TABLE_MISSING',
    });
  }

  mapRow(item) {
    return {
      id: item.id,
      displayName: item.display_name,
      zaloUserId: item.zalo_user_id,
      zaloName: item.zalo_name || '',
      zaloPhone: item.zalo_phone || '',
      loginMethod: item.login_method,
      status: item.status,
      isActive: item.is_active,
      isDefault: item.is_default,
      notes: item.notes || '',
      updatedAt: item.updated_at,
      lastConnectedAt: item.last_connected_at,
    };
  }

  /**
   * Chuyển cookie object/list thành chuỗi để lưu DB.
   *
   * @param {unknown} cookieSource
   * @returns {string}
   */
  serializeCookieSource(cookieSource) {
    if (!cookieSource) return '';
    try {
      if (typeof cookieSource === 'string') {
        return cookieSource.trim();
      }
      if (Array.isArray(cookieSource) || typeof cookieSource === 'object') {
        return JSON.stringify(cookieSource);
      }
    } catch (error) {
      console.error('Serialize cookie source error:', error);
    }
    return '';
  }

  /**
   * Parse cookie text từ DB về định dạng có thể dùng cho zca-js login.
   *
   * @param {string} cookieText
   * @returns {unknown}
   */
  deserializeCookieSource(cookieText) {
    const normalized = String(cookieText || '').trim();
    if (!normalized) return null;
    try {
      return JSON.parse(normalized);
    } catch {
      return normalized;
    }
  }

  /**
   * Tạo danh sách candidate cookie để thử khôi phục session.
   *
   * @param {string} cookieText
   * @returns {unknown[]}
   */
  buildCookieLoginCandidates(cookieText) {
    const normalized = String(cookieText || '').trim();
    const parsedCookie = this.deserializeCookieSource(normalized);
    const candidates = [];
    const seen = new Set();

    const registerCandidate = (value) => {
      if (!value) return;
      const key =
        typeof value === 'string'
          ? `str:${value}`
          : `obj:${this.serializeCookieSource(value)}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      candidates.push(value);
    };

    registerCandidate(parsedCookie);
    registerCandidate(normalized);

    if (parsedCookie && typeof parsedCookie === 'object' && !Array.isArray(parsedCookie)) {
      registerCandidate(parsedCookie.cookie);
      registerCandidate(parsedCookie.cookies);
      if (Array.isArray(parsedCookie.cookies)) {
        registerCandidate(this.serializeCookieSource(parsedCookie.cookies));
      }
    }

    if (Array.isArray(parsedCookie)) {
      registerCandidate(this.serializeCookieSource(parsedCookie));
    }

    return candidates;
  }

  /**
   * Tạo imei tương thích format zca-js từ userAgent.
   *
   * @param {string} userAgent
   * @returns {string}
   */
  buildImeiFromUserAgent(userAgent) {
    const normalizedUserAgent = String(userAgent || '').trim() || this.defaultZaloUserAgent;
    return `${crypto.randomUUID()}-${crypto.createHash('md5').update(normalizedUserAgent).digest('hex')}`;
  }

  /**
   * Chuẩn hóa nhiều kiểu payload cookie về format credentials của zca-js.
   *
   * @param {unknown} source
   * @returns {{ imei: string; userAgent: string; language: string; cookie: unknown } | null}
   */
  normalizeLoginCredentials(source) {
    if (!source) return null;

    const safeObject = source && typeof source === 'object' ? source : null;
    const userAgent = String(
      safeObject?.userAgent || safeObject?.user_agent || safeObject?.ua || ''
    ).trim() || this.defaultZaloUserAgent;
    const language = String(safeObject?.language || '').trim() || this.defaultZaloLanguage;
    const cookie = safeObject
      ? (safeObject.cookie || safeObject.cookies || null)
      : source;
    if (!cookie) return null;

    const imei = String(safeObject?.imei || '').trim() || this.buildImeiFromUserAgent(userAgent);
    return {
      imei,
      userAgent,
      language,
      cookie,
    };
  }

  /**
   * Tạo danh sách credentials candidates để thử khôi phục session.
   *
   * @param {string} cookieText
   * @returns {Array<{ imei: string; userAgent: string; language: string; cookie: unknown }>}
   */
  buildLoginCredentialCandidates(cookieText) {
    const cookieCandidates = this.buildCookieLoginCandidates(cookieText);
    const parsedCookie = this.deserializeCookieSource(cookieText);
    const candidates = [];
    const seen = new Set();

    const registerCandidate = (value) => {
      const normalized = this.normalizeLoginCredentials(value);
      if (!normalized) return;
      const dedupeKey = JSON.stringify({
        imei: normalized.imei,
        userAgent: normalized.userAgent,
        language: normalized.language,
        cookie: this.serializeCookieSource(normalized.cookie),
      });
      if (!dedupeKey || seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      candidates.push(normalized);
    };

    cookieCandidates.forEach((candidate) => registerCandidate(candidate));
    registerCandidate(parsedCookie);
    registerCandidate({
      ...((parsedCookie && typeof parsedCookie === 'object' && !Array.isArray(parsedCookie)) ? parsedCookie : {}),
      cookie: parsedCookie?.cookie || parsedCookie?.cookies,
    });

    return candidates;
  }

  /**
   * Thử đăng nhập lại Zalo từ cookie_text đã lưu.
   *
   * @param {string} cookieText
   * @returns {Promise<any>}
   */
  async restoreApiFromCookieText(cookieText) {
    const credentialCandidates = this.buildLoginCredentialCandidates(cookieText);
    if (!credentialCandidates.length) {
      throw new Error('COOKIE_TEXT_EMPTY');
    }

    let lastError = null;
    for (const credentials of credentialCandidates) {
      const zalo = new Zalo({
        selfListen: false,
        checkUpdate: true,
        logging: false,
      });

      try {
        if (!zalo?.login || typeof zalo.login !== 'function') {
          throw new Error('UNSUPPORTED_ZALO_LOGIN_METHOD');
        }
        const api = await zalo.login(credentials);
        if (api) return api;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('RESTORE_SESSION_FAILED');
  }

  /**
   * Cập nhật account về trạng thái connected sau khi khôi phục cookie thành công.
   *
   * @param {{ userId: number; accountId: number; accountIdentity: { displayName?: string; zaloUserId?: string; zaloName?: string; zaloPhone?: string; cookieText?: string }; fallbackDisplayName: string; fallbackCookieText: string }} input
   * @returns {Promise<Record<string, any> | null>}
   */
  async markAccountConnectedAfterRestore(input) {
    const userId = Number.parseInt(input?.userId, 10);
    const accountId = Number.parseInt(input?.accountId, 10);
    if (!Number.isFinite(userId) || !Number.isFinite(accountId)) return null;

    const displayName = String(input?.accountIdentity?.displayName || '').trim() || String(input?.fallbackDisplayName || '').trim() || 'Tài khoản Zalo';
    const zaloUserId = String(input?.accountIdentity?.zaloUserId || '').trim();
    const zaloName = String(input?.accountIdentity?.zaloName || '').trim();
    const zaloPhone = String(input?.accountIdentity?.zaloPhone || '').trim();
    const cookieText = String(input?.accountIdentity?.cookieText || '').trim() || String(input?.fallbackCookieText || '').trim();
    const now = new Date();

    const updated = await db.query(
      `UPDATE zalo_settings
       SET display_name = COALESCE(NULLIF($1, ''), display_name),
           zalo_user_id = COALESCE(NULLIF($2, ''), zalo_user_id),
           zalo_name = COALESCE(NULLIF($3, ''), zalo_name),
           zalo_phone = COALESCE(NULLIF($4, ''), zalo_phone),
           cookie_text = COALESCE(NULLIF($5, ''), cookie_text),
           status = 'connected',
           is_active = TRUE,
           last_connected_at = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_user = $7 AND id = $8
       RETURNING id, display_name, zalo_user_id, zalo_name, zalo_phone, login_method, status, is_active, is_default, notes, updated_at, last_connected_at`,
      [displayName, zaloUserId, zaloName, zaloPhone, cookieText, now, userId, accountId]
    );

    const row = updated.rows[0] || null;
    return row ? this.mapRow(row) : null;
  }

  /**
   * Đánh dấu account về disconnected khi khôi phục cookie thất bại.
   *
   * @param {{ userId: number; accountId: number }} input
   * @returns {Promise<void>}
   */
  async markAccountDisconnectedAfterRestoreFail(input) {
    const userId = Number.parseInt(input?.userId, 10);
    const accountId = Number.parseInt(input?.accountId, 10);
    if (!Number.isFinite(userId) || !Number.isFinite(accountId)) return;

    await db.query(
      `UPDATE zalo_settings
       SET status = 'disconnected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id_user = $1 AND id = $2`,
      [userId, accountId]
    );
    zaloAccountSessionService.clearAccountApi(accountId);
  }

  /**
   * Best-effort lấy thông tin account sau khi login QR thành công.
   *
   * @param {any} api
   * @param {{ qrScannedName?: string; loginInfoCookie?: unknown; imei?: string; userAgent?: string; language?: string }} loginMeta
   * @returns {Promise<{ zaloUserId: string; displayName: string; zaloName: string; zaloPhone: string; cookieText: string }>}
   */
  async extractAccountIdentityFromApi(api, loginMeta = {}) {
    const safeApi = api && typeof api === 'object' ? api : {};
    let profile = null;
    let userInfoProfile = null;
    let ownId = '';
    let cookieText = this.serializeCookieSource({
      imei: String(loginMeta?.imei || '').trim(),
      userAgent: String(loginMeta?.userAgent || '').trim(),
      language: String(loginMeta?.language || '').trim() || this.defaultZaloLanguage,
      cookie: loginMeta?.loginInfoCookie || null,
    });

    if (safeApi?.fetchAccountInfo && typeof safeApi.fetchAccountInfo === 'function') {
      try {
        profile = await safeApi.fetchAccountInfo();
      } catch (error) {
        console.error('fetchAccountInfo failed:', error?.message || error);
      }
    }

    if (safeApi?.getOwnId && typeof safeApi.getOwnId === 'function') {
      try {
        ownId = String(safeApi.getOwnId() || '').trim();
      } catch (error) {
        console.error('getOwnId failed:', error?.message || error);
      }
    }

    if (ownId && safeApi?.getUserInfo && typeof safeApi.getUserInfo === 'function') {
      try {
        const userInfoResponse = await safeApi.getUserInfo(ownId);
        const changedProfiles = userInfoResponse?.changed_profiles || {};
        const userInfoKey = `${ownId}_0`;
        userInfoProfile = changedProfiles[userInfoKey] || changedProfiles[ownId] || null;
      } catch (error) {
        console.error('getUserInfo failed:', error?.message || error);
      }
    }

    if (!cookieText && safeApi?.getCookie && typeof safeApi.getCookie === 'function') {
      try {
        const cookieJar = safeApi.getCookie();
        if (cookieJar?.serializeSync && typeof cookieJar.serializeSync === 'function') {
          cookieText = this.serializeCookieSource({
            imei: String(loginMeta?.imei || '').trim(),
            userAgent: String(loginMeta?.userAgent || '').trim() || this.defaultZaloUserAgent,
            language: String(loginMeta?.language || '').trim() || this.defaultZaloLanguage,
            cookie: cookieJar.serializeSync()?.cookies || [],
          });
        } else if (cookieJar?.toJSON && typeof cookieJar.toJSON === 'function') {
          cookieText = this.serializeCookieSource({
            imei: String(loginMeta?.imei || '').trim(),
            userAgent: String(loginMeta?.userAgent || '').trim() || this.defaultZaloUserAgent,
            language: String(loginMeta?.language || '').trim() || this.defaultZaloLanguage,
            cookie: cookieJar.toJSON(),
          });
        }
      } catch (error) {
        console.error('getCookie failed:', error?.message || error);
      }
    }

    const safeProfile = profile && typeof profile === 'object' ? profile : {};
    const safeUserInfo = userInfoProfile && typeof userInfoProfile === 'object' ? userInfoProfile : {};
    const zaloUserId = String(safeProfile.userId || safeUserInfo.userId || safeUserInfo.uid || ownId || '').trim();
    const zaloName = String(
      safeProfile.zaloName || safeUserInfo.zalo_name || safeUserInfo.zaloName || safeProfile.displayName || safeUserInfo.display_name || safeUserInfo.displayName || loginMeta?.qrScannedName || ''
    ).trim();
    const displayName = String(
      safeProfile.displayName ||
        safeUserInfo.display_name ||
        safeUserInfo.displayName ||
        safeProfile.zaloName ||
        safeUserInfo.zalo_name ||
        loginMeta?.qrScannedName ||
        (zaloUserId ? `Zalo ${zaloUserId}` : 'Tài khoản Zalo')
    ).trim();
    const zaloPhone = String(
      safeProfile.phoneNumber ||
        safeUserInfo.phoneNumber ||
        safeUserInfo.phone_number ||
        safeUserInfo.mobile ||
        safeUserInfo.phone ||
        ''
    ).trim();

    return {
      zaloUserId,
      displayName: displayName || 'Tài khoản Zalo',
      zaloName,
      zaloPhone,
      cookieText,
    };
  }

  /**
   * Upsert tài khoản khi đăng nhập QR thành công.
   *
   * - Nếu đã có tài khoản cùng user + zalo_user_id thì cập nhật trạng thái kết nối.
   * - Nếu chưa có thì tạo mới bằng phương thức `qr`.
   *
   * @param {number} userId
   * @param {{ zaloUserId: string; displayName: string; zaloName: string; zaloPhone: string; cookieText: string }} accountIdentity
   * @returns {Promise<Record<string, any>>}
   */
  async upsertQrLoggedInAccount(userId, accountIdentity) {
    const now = new Date();
    const zaloUserId = String(accountIdentity?.zaloUserId || '').trim();
    const displayName = String(accountIdentity?.displayName || '').trim() || 'Tài khoản Zalo';
    const zaloName = String(accountIdentity?.zaloName || '').trim();
    const zaloPhone = String(accountIdentity?.zaloPhone || '').trim();
    const cookieText = String(accountIdentity?.cookieText || '').trim();

    if (zaloUserId) {
      const existedById = await db.query(
        `SELECT id
         FROM zalo_settings
         WHERE id_user = $1 AND zalo_user_id = $2
         LIMIT 1`,
        [userId, zaloUserId]
      );

      if (existedById.rows.length > 0) {
        const updated = await db.query(
          `UPDATE zalo_settings
           SET display_name = COALESCE(NULLIF($1, ''), display_name),
               zalo_name = COALESCE(NULLIF($2, ''), zalo_name),
               zalo_phone = COALESCE(NULLIF($3, ''), zalo_phone),
               cookie_text = COALESCE(NULLIF($4, ''), cookie_text),
               login_method = 'qr',
               status = 'connected',
               is_active = TRUE,
               last_connected_at = $5,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $6
           RETURNING id, display_name, zalo_user_id, zalo_name, zalo_phone, login_method, status, is_active, is_default, notes, updated_at, last_connected_at`,
          [displayName, zaloName, zaloPhone, cookieText, now, existedById.rows[0].id]
        );
        return this.mapRow(updated.rows[0]);
      }
    }

    const existedByName = await db.query(
      `SELECT id
       FROM zalo_settings
       WHERE id_user = $1 AND display_name = $2
       LIMIT 1`,
      [userId, displayName]
    );

    if (existedByName.rows.length > 0) {
      const updated = await db.query(
        `UPDATE zalo_settings
         SET zalo_user_id = COALESCE(NULLIF($1, ''), zalo_user_id),
             zalo_name = COALESCE(NULLIF($2, ''), zalo_name),
             zalo_phone = COALESCE(NULLIF($3, ''), zalo_phone),
             cookie_text = COALESCE(NULLIF($4, ''), cookie_text),
             display_name = COALESCE(NULLIF($5, ''), display_name),
             login_method = 'qr',
             status = 'connected',
             is_active = TRUE,
             last_connected_at = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING id, display_name, zalo_user_id, zalo_name, zalo_phone, login_method, status, is_active, is_default, notes, updated_at, last_connected_at`,
        [zaloUserId, zaloName, zaloPhone, cookieText, displayName, now, existedByName.rows[0].id]
      );
      return this.mapRow(updated.rows[0]);
    }

    const existingCount = await db.query('SELECT COUNT(*)::int AS total FROM zalo_settings WHERE id_user = $1', [userId]);
    const isDefault = existingCount.rows[0]?.total === 0;
    const inserted = await db.query(
      `INSERT INTO zalo_settings (
        id_user, display_name, zalo_user_id, zalo_name, zalo_phone, login_method, cookie_text, status, is_active, is_default, notes, last_connected_at
      ) VALUES (
        $1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), 'qr', NULLIF($6, ''), 'connected', TRUE, $7, NULL, $8
      )
      RETURNING id, display_name, zalo_user_id, zalo_name, zalo_phone, login_method, status, is_active, is_default, notes, updated_at, last_connected_at`,
      [userId, displayName, zaloUserId, zaloName, zaloPhone, cookieText, isDefault, now]
    );

    return this.mapRow(inserted.rows[0]);
  }

  /**
   * Hoàn tất luồng đăng nhập QR sau khi đã có API hợp lệ.
   *
   * Luồng hoạt động:
   * 1. Cập nhật session QR sang trạng thái connected để frontend dừng polling.
   * 2. Trích xuất identity tài khoản từ API + metadata quét QR.
   * 3. Upsert tài khoản vào DB và đăng ký API vào session service.
   *
   * @param {{ sessionKey: string; userId: number; api: any; loginMeta: { qrScannedName?: string; loginInfoCookie?: unknown; imei?: string; userAgent?: string; language?: string } }} input
   * @returns {Promise<void>}
   */
  async finalizeQrLoginSuccess(input) {
    const sessionKey = String(input?.sessionKey || '').trim();
    const userId = Number.parseInt(input?.userId, 10);
    const api = input?.api;
    const loginMeta = input?.loginMeta || {};
    if (!sessionKey || !Number.isFinite(userId) || !api) return;

    this.patchLoginSession(sessionKey, {
      status: 'connected',
      message: 'Đăng nhập Zalo thành công.',
      api,
    });

    const accountIdentity = await this.extractAccountIdentityFromApi(api, loginMeta);
    const account = await this.upsertQrLoggedInAccount(userId, accountIdentity);
    this.patchLoginSession(sessionKey, { account });
    zaloAccountSessionService.setAccountApi(account?.id, api);
    zaloAccountSessionService.startAccountListenerSafely({
      accountId: account?.id,
      api,
      context: 'loginQr',
    });
  }

  /**
   * Trích xuất login info từ payload callback QR theo nhiều định dạng.
   *
   * Luồng hoạt động:
   * 1. Thu gom nhiều candidate có thể chứa cookie/session.
   * 2. Chọn candidate đầu tiên có dữ liệu hợp lệ để dùng cho login fallback.
   * 3. Chuẩn hóa imei/userAgent/language về định dạng thống nhất.
   *
   * @param {unknown} eventData
   * @returns {{ cookie: unknown; imei: string; userAgent: string; language: string }}
   */
  extractQrLoginInfo(eventData) {
    const source = eventData && typeof eventData === 'object' ? eventData : {};
    const toNonEmptyString = (value) => String(value || '').trim();
    const isMeaningfulCookie = (value) => {
      if (!value) return false;
      if (typeof value === 'string') return Boolean(value.trim());
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'object') return Object.keys(value).length > 0;
      return false;
    };

    const nestedLoginInfo = source?.loginInfo && typeof source.loginInfo === 'object' ? source.loginInfo : null;
    const nestedSession = source?.session && typeof source.session === 'object' ? source.session : null;
    const cookieCandidates = [
      source?.cookie,
      source?.cookies,
      source?.cookieJar,
      source?.jar,
      source?.loginInfoCookie,
      nestedLoginInfo?.cookie,
      nestedLoginInfo?.cookies,
      nestedSession?.cookie,
      nestedSession?.cookies,
    ];

    const cookie = cookieCandidates.find((candidate) => isMeaningfulCookie(candidate)) || null;
    return {
      cookie,
      imei:
        toNonEmptyString(source?.imei) ||
        toNonEmptyString(source?.z_uuid) ||
        toNonEmptyString(nestedLoginInfo?.imei) ||
        '',
      userAgent:
        toNonEmptyString(source?.userAgent) ||
        toNonEmptyString(source?.user_agent) ||
        toNonEmptyString(source?.ua) ||
        toNonEmptyString(nestedLoginInfo?.userAgent) ||
        '',
      language:
        toNonEmptyString(source?.language) ||
        toNonEmptyString(source?.lang) ||
        toNonEmptyString(nestedLoginInfo?.language) ||
        this.defaultZaloLanguage,
    };
  }

  /**
   * Tạo credentials từ metadata callback của login QR để thử login fallback.
   *
   * Luồng hoạt động:
   * 1. Chuẩn hóa cookie/imei/userAgent/language từ metadata callback.
   * 2. Trả về credentials hợp lệ cho `zalo.login(...)`.
   * 3. Nếu thiếu cookie thì trả về null để bỏ qua fallback.
   *
   * @param {{ loginInfoCookie?: unknown; imei?: string; userAgent?: string; language?: string }} loginMeta
   * @returns {{ imei: string; userAgent: string; language: string; cookie: unknown } | null}
   */
  buildLoginCredentialsFromQrMeta(loginMeta = {}) {
    const candidates = [];
    const registerCandidate = (candidate) => {
      const normalized = this.normalizeLoginCredentials(candidate);
      if (normalized) {
        candidates.push(normalized);
      }
    };

    registerCandidate({
      imei: loginMeta?.imei,
      userAgent: loginMeta?.userAgent,
      language: loginMeta?.language,
      cookie: loginMeta?.loginInfoCookie,
    });
    registerCandidate(loginMeta?.loginInfoRaw);
    registerCandidate({
      ...(loginMeta?.loginInfoRaw && typeof loginMeta.loginInfoRaw === 'object' ? loginMeta.loginInfoRaw : {}),
      imei: loginMeta?.imei,
      userAgent: loginMeta?.userAgent,
      language: loginMeta?.language,
      cookie: loginMeta?.loginInfoCookie || loginMeta?.loginInfoRaw?.cookie || loginMeta?.loginInfoRaw?.cookies,
    });

    return candidates[0] || null;
  }

  /**
   * Chuẩn hóa lỗi thành object gọn để log chẩn đoán dễ đọc.
   *
   * Luồng hoạt động:
   * 1. Trích xuất name/message/code/status/cause từ error.
   * 2. Cắt ngắn stack để tránh log quá dài.
   * 3. Trả về object an toàn, không chứa dữ liệu nhạy cảm.
   *
   * @param {unknown} error
   * @returns {{ name: string; message: string; code: string; status: number|null; stack: string; cause: string }}
   */
  formatErrorForLog(error) {
    const safeError = error && typeof error === 'object' ? error : null;
    const stackText = String(safeError?.stack || '').split('\n').slice(0, 4).join(' | ');
    const causeMessage =
      typeof safeError?.cause === 'string'
        ? safeError.cause
        : safeError?.cause?.message
          ? String(safeError.cause.message)
          : '';

    return {
      name: String(safeError?.name || 'Error'),
      message: String(safeError?.message || error || 'Unknown error'),
      code: String(safeError?.code || ''),
      status: Number.isFinite(Number(safeError?.status)) ? Number(safeError.status) : null,
      stack: stackText,
      cause: causeMessage,
    };
  }

  /**
   * Đếm số cookie để log nhanh trạng thái dữ liệu login.
   *
   * @param {unknown} cookieSource
   * @returns {number}
   */
  getCookieCount(cookieSource) {
    if (!cookieSource) return 0;
    if (Array.isArray(cookieSource)) return cookieSource.length;
    if (typeof cookieSource === 'string') return cookieSource.trim() ? 1 : 0;
    if (typeof cookieSource === 'object' && Array.isArray(cookieSource.cookies)) return cookieSource.cookies.length;
    if (typeof cookieSource === 'object') return Object.keys(cookieSource).length > 0 ? 1 : 0;
    return 0;
  }

  /**
   * Tóm tắt shape payload để debug nhanh khi response đổi format.
   *
   * @param {unknown} payload
   * @returns {{ type: string; keys: string[]; hasDataObject: boolean; hasErrorCode: boolean }}
   */
  summarizePayloadShape(payload) {
    const safePayload = payload && typeof payload === 'object' ? payload : null;
    const keys = safePayload ? Object.keys(safePayload).slice(0, 12) : [];
    const dataValue = safePayload?.data;
    const dataPreview =
      typeof dataValue === 'string'
        ? dataValue.slice(0, 180)
        : (dataValue && typeof dataValue === 'object' ? JSON.stringify(Object.keys(dataValue).slice(0, 10)) : '');
    return {
      type: Array.isArray(payload) ? 'array' : typeof payload,
      keys,
      hasDataObject: Boolean(safePayload?.data && typeof safePayload.data === 'object'),
      hasErrorCode: Boolean(safePayload && Object.prototype.hasOwnProperty.call(safePayload, 'error_code')),
      errorCode: safePayload?.error_code ?? null,
      errorMessage: String(safePayload?.error_message || ''),
      dataPreview,
    };
  }

  /**
   * Nhận diện lỗi session QR đã hết hiệu lực từ payload hoặc error.
   *
   * @param {unknown} input
   * @returns {boolean}
   */
  isQrSessionTimeoutIssue(input) {
    const safeObject = input && typeof input === 'object' ? input : null;
    const errorCode = Number(safeObject?.error_code);
    const errorMessage = String(safeObject?.error_message || safeObject?.message || input || '').toLowerCase();
    return (
      errorCode === 102 ||
      errorMessage.includes('session key was improperly submitted') ||
      errorMessage.includes('has reached its timeout') ||
      errorMessage.includes('cannot get session, login failed')
    );
  }

  /**
   * Chuẩn hóa lỗi đăng nhập QR để đồng bộ nhánh timeout session.
   *
   * Luồng hoạt động:
   * 1. Nhận diện lỗi timeout từ payload hoặc object error.
   * 2. Nếu là timeout, luôn quy về `QR_SESSION_TIMEOUT`.
   * 3. Trả lại lỗi gốc cho các trường hợp khác.
   *
   * @param {unknown} error
   * @returns {Error}
   */
  normalizeQrLoginError(error) {
    if (this.isQrSessionTimeoutIssue(error)) {
      const timeoutError = new Error('QR_SESSION_TIMEOUT');
      timeoutError.cause = error;
      return timeoutError;
    }
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error || 'ZALO_QR_UNKNOWN_ERROR'));
  }

  /**
   * Trích xuất loginInfo từ nhiều dạng payload khác nhau.
   *
   * @param {unknown} loginPayload
   * @returns {Record<string, any> | null}
   */
  extractLoginInfoPayload(loginPayload) {
    const payload = loginPayload && typeof loginPayload === 'object' ? loginPayload : null;
    if (!payload) return null;
    const candidates = [
      payload?.data,
      payload?.loginInfo,
      payload?.login_info,
      payload?.info,
      payload,
    ];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      if (candidate?.uid && candidate?.zpw_enk && candidate?.zpw_ws && candidate?.zpw_service_map_v3) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Chờ session QR ổn định sau khi quét thành công nhưng login tức thời bị fail.
   *
   * Luồng hoạt động:
   * 1. Poll checksession + userinfo tối đa vài lần.
   * 2. Nếu userinfo.logged=true thì dừng sớm để thử login lại.
   * 3. Ghi log chi tiết từng vòng để theo dõi trạng thái đồng bộ session.
   *
   * @param {any} rawCtx
   * @param {{ traceId: string; attempts?: number; waitMs?: number }} options
   * @returns {Promise<boolean>}
   */
  async waitForQrSessionReady(rawCtx, options = {}) {
    const traceId = String(options?.traceId || 'no-trace');
    const attempts = Number.isFinite(Number(options?.attempts)) ? Number(options.attempts) : 4;
    const waitMs = Number.isFinite(Number(options?.waitMs)) ? Number(options.waitMs) : 1200;
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let index = 0; index < attempts; index += 1) {
      try {
        await rawRequest(rawCtx, 'https://id.zalo.me/account/checksession?continue=https%3A%2F%2Fchat.zalo.me%2Findex.html', {
          method: 'GET',
          redirect: 'manual',
        });
        const userInfoResponse = await rawRequest(rawCtx, 'https://jr.chat.zalo.me/jr/userinfo', {
          method: 'GET',
        });
        const userInfoData = await userInfoResponse.json();
        const isLogged = Boolean(userInfoData?.data?.logged);
        console.info('[ZALO_QR_SESSION_POLL]', {
          traceId,
          attempt: index + 1,
          isLogged,
          hasInfo: Boolean(userInfoData?.data?.info),
        });
        if (isLogged) {
          return true;
        }
      } catch (error) {
        console.error('[ZALO_QR_SESSION_POLL_FAIL]', {
          traceId,
          attempt: index + 1,
          error: this.formatErrorForLog(error),
        });
      }
      await delay(waitMs);
    }
    return false;
  }

  /**
   * Gọi login low-level có retry để giảm fail giả do session QR đồng bộ chậm.
   *
   * Luồng hoạt động:
   * 1. Thử `rawCookieLogin` + `rawGetServerInfo` với context hiện tại.
   * 2. Nếu dính `QR_SESSION_TIMEOUT`, chờ/poll session rồi retry thêm vài lần.
   * 3. Trả về payload thành công hoặc ném lỗi cuối cùng khi hết số lần thử.
   *
   * @param {any} ctx
   * @param {{ traceId: string; stepLabel: string; strategyName: string; enableEncryptParam: boolean; maxAttempts?: number; retryWaitMs?: number }} options
   * @returns {Promise<{ loginPayload: unknown; serverPayload: unknown }>}
   */
  async performLowLevelLoginWithRetry(ctx, options) {
    const traceId = String(options?.traceId || 'no-trace');
    const stepLabel = String(options?.stepLabel || 'low-level-login');
    const strategyName = String(options?.strategyName || 'unknown-strategy');
    const enableEncryptParam = options?.enableEncryptParam !== false;
    const maxAttempts = Number.isFinite(Number(options?.maxAttempts))
      ? Math.max(1, Number(options.maxAttempts))
      : 4;
    const retryWaitMs = Number.isFinite(Number(options?.retryWaitMs))
      ? Math.max(300, Number(options.retryWaitMs))
      : 1800;
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let loginPayload = null;
      let serverPayload = null;
      try {
        loginPayload = await rawCookieLogin(ctx, enableEncryptParam);
        serverPayload = await rawGetServerInfo(ctx, enableEncryptParam);
        return { loginPayload, serverPayload };
      } catch (error) {
        const normalizedError = this.normalizeQrLoginError(error);
        lastError = normalizedError;
        console.error('[ZALO_QR_LOW_LEVEL_ATTEMPT_FAIL]', {
          traceId,
          stepLabel,
          strategy: strategyName,
          attempt,
          maxAttempts,
          loginPayloadShape: this.summarizePayloadShape(loginPayload),
          serverPayloadShape: this.summarizePayloadShape(serverPayload),
          error: this.formatErrorForLog(normalizedError),
        });

        if (normalizedError.message !== 'QR_SESSION_TIMEOUT' || attempt >= maxAttempts) {
          throw normalizedError;
        }

        await this.waitForQrSessionReady(ctx, {
          traceId,
          attempts: 2,
          waitMs: Math.round(retryWaitMs / 2),
        });
        await delay(retryWaitMs);
      }
    }

    throw lastError || new Error('LOW_LEVEL_LOGIN_FAILED');
  }

  /**
   * Trích xuất serverInfo từ nhiều dạng payload khác nhau.
   *
   * @param {unknown} serverPayload
   * @returns {Record<string, any> | null}
   */
  extractServerInfoPayload(serverPayload) {
    const payload = serverPayload && typeof serverPayload === 'object' ? serverPayload : null;
    if (!payload) return null;
    const candidates = [
      payload?.data,
      payload?.serverInfo,
      payload?.server_info,
      payload,
    ];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      if (candidate?.setttings || candidate?.settings || candidate?.extra_ver) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Tạo API từ payload low-level theo cách tolerant để tránh fail vì đổi shape response.
   *
   * @param {any} ctx
   * @param {unknown} loginPayload
   * @param {unknown} serverPayload
   * @returns {any}
   */
  buildApiFromLowLevelPayload(ctx, loginPayload, serverPayload) {
    const loginInfo = this.extractLoginInfoPayload(loginPayload);
    const serverInfo = this.extractServerInfoPayload(serverPayload);

    // Một số response có thể gắn cờ timeout nhưng vẫn kèm login info hợp lệ.
    // Chỉ fail timeout khi thực sự không trích xuất được dữ liệu session cần thiết.
    if (this.isQrSessionTimeoutIssue(loginPayload) && !loginInfo) {
      throw new Error('QR_SESSION_TIMEOUT');
    }
    if (this.isQrSessionTimeoutIssue(serverPayload) && !serverInfo) {
      throw new Error('QR_SESSION_TIMEOUT');
    }

    if (!loginInfo || !serverInfo) {
      throw new Error('RAW_CTX_LOGIN_DATA_INVALID');
    }

    ctx.secretKey = loginInfo.zpw_enk;
    ctx.uid = loginInfo.uid;
    ctx.settings = serverInfo.setttings || serverInfo.settings || {};
    ctx.extraVer = serverInfo.extra_ver || '';
    ctx.loginInfo = loginInfo;

    if (!isContextSession(ctx)) {
      throw new Error('RAW_CTX_CONTEXT_INVALID');
    }

    return new API(ctx, loginInfo.zpw_service_map_v3, loginInfo.zpw_ws);
  }

  /**
   * Retry luồng low-level + dựng API để xử lý trường hợp session vừa xác nhận nhưng chưa đồng bộ kịp.
   *
   * Luồng hoạt động:
   * 1. Gọi low-level login/getServerInfo để lấy payload mới nhất.
   * 2. Thử dựng API từ payload; nếu dính `QR_SESSION_TIMEOUT` thì chờ/poll rồi thử lại.
   * 3. Trả về cả API và loginPayload cuối cùng khi thành công.
   *
   * @param {any} ctx
   * @param {{ traceId: string; stepLabel: string; strategyName: string; enableEncryptParam: boolean; buildMaxAttempts?: number; buildRetryWaitMs?: number }} options
   * @returns {Promise<{ api: any; loginPayload: unknown; serverPayload: unknown }>}
   */
  async buildApiWithLowLevelRetry(ctx, options) {
    const traceId = String(options?.traceId || 'no-trace');
    const stepLabel = String(options?.stepLabel || 'low-level-build-api');
    const strategyName = String(options?.strategyName || 'unknown-strategy');
    const enableEncryptParam = options?.enableEncryptParam !== false;
    const buildMaxAttempts = Number.isFinite(Number(options?.buildMaxAttempts))
      ? Math.max(1, Number(options.buildMaxAttempts))
      : 3;
    const buildRetryWaitMs = Number.isFinite(Number(options?.buildRetryWaitMs))
      ? Math.max(400, Number(options.buildRetryWaitMs))
      : 1800;
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    let lastError = null;
    for (let attempt = 1; attempt <= buildMaxAttempts; attempt += 1) {
      const { loginPayload, serverPayload } = await this.performLowLevelLoginWithRetry(ctx, {
        traceId,
        stepLabel,
        strategyName,
        enableEncryptParam,
      });

      try {
        const api = this.buildApiFromLowLevelPayload(ctx, loginPayload, serverPayload);
        return { api, loginPayload, serverPayload };
      } catch (error) {
        const normalizedError = this.normalizeQrLoginError(error);
        lastError = normalizedError;
        console.error('[ZALO_QR_BUILD_API_ATTEMPT_FAIL]', {
          traceId,
          stepLabel,
          strategy: strategyName,
          attempt,
          buildMaxAttempts,
          loginPayloadShape: this.summarizePayloadShape(loginPayload),
          serverPayloadShape: this.summarizePayloadShape(serverPayload),
          error: this.formatErrorForLog(normalizedError),
        });
        if (normalizedError.message !== 'QR_SESSION_TIMEOUT' || attempt >= buildMaxAttempts) {
          throw normalizedError;
        }

        await this.waitForQrSessionReady(ctx, {
          traceId,
          attempts: 3,
          waitMs: 1200,
        });
        await delay(buildRetryWaitMs);
      }
    }

    throw lastError || new Error('LOW_LEVEL_BUILD_API_FAILED');
  }

  /**
   * Tạo context mới từ credentials rồi login bằng low-level API tolerant.
   *
   * @param {{ imei: string; userAgent: string; language: string; cookie: unknown }} credentials
   * @param {{ traceId: string; stepLabel: string }} options
   * @returns {Promise<any>}
   */
  async loginWithManualContext(credentials, options) {
    const traceId = String(options?.traceId || 'no-trace');
    const stepLabel = String(options?.stepLabel || 'manual-context-login');
    const zalo = new Zalo({
      selfListen: false,
      checkUpdate: true,
      logging: false,
    });
    const ctx = createContext(zalo.options.apiType, zalo.options.apiVersion);
    Object.assign(ctx.options, zalo.options);
    ctx.imei = String(credentials?.imei || '').trim() || this.buildImeiFromUserAgent(credentials?.userAgent);
    ctx.userAgent = String(credentials?.userAgent || '').trim() || this.defaultZaloUserAgent;
    ctx.language = String(credentials?.language || '').trim() || this.defaultZaloLanguage;
    ctx.cookie = zalo.parseCookies(credentials?.cookie);

    try {
      const { api } = await this.buildApiWithLowLevelRetry(ctx, {
        traceId,
        stepLabel,
        strategyName: 'manual_low_level_tolerant',
        enableEncryptParam: true,
      });
      return api;
    } catch (error) {
      console.error('[ZALO_QR_MANUAL_CONTEXT_FAIL]', {
        traceId,
        stepLabel,
        error: this.formatErrorForLog(this.normalizeQrLoginError(error)),
      });
      throw error;
    }
  }

  /**
   * Thử đăng nhập với nhiều strategy để tăng độ ổn định của zca-js.
   *
   * Luồng hoạt động:
   * 1. Thử strategy mặc định `zalo.login(credentials)`.
   * 2. Nếu fail, thử strategy low-level tolerant bằng manual context.
   * 3. Log chi tiết từng attempt và ném lỗi cuối cùng nếu tất cả đều thất bại.
   *
   * @param {{ imei: string; userAgent: string; language: string; cookie: unknown }} credentials
   * @param {{ traceId: string; stepLabel: string; sourceLabel: string }} options
   * @returns {Promise<any>}
   */
  async loginWithStrategies(credentials, options) {
    const traceId = String(options?.traceId || 'no-trace');
    const stepLabel = String(options?.stepLabel || 'unknown-step');
    const sourceLabel = String(options?.sourceLabel || 'unknown-source');
    const strategyList = [
      { name: 'default_sdk_login', kind: 'sdk' },
      { name: 'manual_low_level_tolerant', kind: 'manual' },
    ];

    let lastError = null;
    for (const strategy of strategyList) {
      try {
        let api = null;
        if (strategy.kind === 'sdk') {
          const zalo = new Zalo({
            selfListen: false,
            checkUpdate: true,
            logging: false,
          });
          api = await zalo.login(credentials);
        } else {
          api = await this.loginWithManualContext(credentials, {
            traceId,
            stepLabel: `${stepLabel}_manual`,
          });
        }
        console.info('[ZALO_QR_LOGIN_OK]', {
          traceId,
          stepLabel,
          sourceLabel,
          strategy: strategy.name,
          cookieCount: this.getCookieCount(credentials?.cookie),
        });
        return api;
      } catch (error) {
        const normalizedError = this.normalizeQrLoginError(error);
        lastError = normalizedError;
        console.error('[ZALO_QR_LOGIN_ATTEMPT_FAIL]', {
          traceId,
          stepLabel,
          sourceLabel,
          strategy: strategy.name,
          cookieCount: this.getCookieCount(credentials?.cookie),
          imei: String(credentials?.imei || '').slice(0, 18),
          language: String(credentials?.language || ''),
          error: this.formatErrorForLog(normalizedError),
        });
        if (normalizedError.message === 'QR_SESSION_TIMEOUT') {
          throw normalizedError;
        }
      }
    }

    throw lastError || new Error('ZALO_QR_LOGIN_STRATEGIES_FAILED');
  }

  /**
   * Login bằng raw context để giữ nguyên cookie-jar gốc từ luồng quét QR.
   *
   * Luồng hoạt động:
   * 1. Dùng trực tiếp `rawCtx.cookie` mà không serialize/parse lại.
   * 2. Gọi low-level `login/getServerInfo` để lấy session data.
   * 3. Khởi tạo API từ context đã hợp lệ; nếu fail thì trả lỗi để nhánh khác xử lý.
   *
   * @param {any} rawCtx
   * @param {{ imei: string; userAgent: string; language: string }} credentialMeta
   * @param {{ traceId: string; stepLabel: string }} options
   * @returns {Promise<any>}
   */
  async loginWithRawContextStrategies(rawCtx, credentialMeta, options) {
    const traceId = String(options?.traceId || 'no-trace');
    const stepLabel = String(options?.stepLabel || 'raw-context-login');
    if (!rawCtx) {
      throw new Error('RAW_CTX_MISSING');
    }

    rawCtx.imei = String(credentialMeta?.imei || '').trim();
    rawCtx.userAgent = String(credentialMeta?.userAgent || '').trim() || this.defaultZaloUserAgent;
    rawCtx.language = String(credentialMeta?.language || '').trim() || this.defaultZaloLanguage;

    const strategyList = [{ name: 'raw_ctx_encrypt_on', enableEncryptParam: true }];

    let lastError = null;
    for (const strategy of strategyList) {
      try {
        const { api, loginPayload } = await this.buildApiWithLowLevelRetry(rawCtx, {
          traceId,
          stepLabel,
          strategyName: strategy.name,
          enableEncryptParam: strategy.enableEncryptParam,
        });
        const loginInfo = this.extractLoginInfoPayload(loginPayload);
        console.info('[ZALO_QR_RAW_CTX_LOGIN_OK]', {
          traceId,
          stepLabel,
          strategy: strategy.name,
          uid: String(loginInfo?.uid || ''),
          hasServiceMap: Boolean(loginInfo?.zpw_service_map_v3),
          hasWs: Boolean(loginInfo?.zpw_ws),
        });
        return api;
      } catch (error) {
        const normalizedError = this.normalizeQrLoginError(error);
        lastError = normalizedError;
        console.error('[ZALO_QR_RAW_CTX_LOGIN_FAIL]', {
          traceId,
          stepLabel,
          strategy: strategy.name,
          error: this.formatErrorForLog(normalizedError),
        });
        if (normalizedError.message === 'QR_SESSION_TIMEOUT') {
          throw normalizedError;
        }
      }
    }

    throw lastError || new Error('RAW_CTX_LOGIN_FAILED');
  }

  /**
   * Đăng nhập QR theo luồng low-level để có thể "cứu" cookie khi thư viện báo `Can't login`.
   *
   * Luồng hoạt động:
   * 1. Gọi raw `loginQR` để nhận callback QR và thu cookie thật từ phiên quét.
   * 2. Phát sự kiện `GotLoginInfo` mô phỏng như luồng mặc định để code phía trên tái sử dụng.
   * 3. Thử đăng nhập bằng cookie nhận được; nếu lỗi thì thử lại bằng cookie đang có trong cookie-jar.
   *
   * @param {{ callback?: (event: any) => Promise<void> | void; traceId?: string }} options
   * @returns {Promise<any>}
   */
  async loginQrWithRescue(options = {}) {
    const callback = typeof options?.callback === 'function' ? options.callback : null;
    const traceId = String(options?.traceId || `qr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
    const userAgent = this.defaultZaloUserAgent;
    const language = this.defaultZaloLanguage;
    const imei = generateZaloUUID(userAgent);
    const rawCtx = createContext();
    Object.assign(rawCtx.options, {
      selfListen: false,
      checkUpdate: true,
      logging: false,
    });

    let qrResult = null;
    let rawLoginError = null;

    try {
      qrResult = await rawLoginQR(
        rawCtx,
        {
          userAgent,
          language,
        },
        async (event) => {
          if (!callback) return;
          await callback(event);
        }
      );
    } catch (error) {
      rawLoginError = error;
      console.error('[ZALO_QR_RAW_LOGIN_FAIL]', {
        traceId,
        stepLabel: 'raw_login_qr',
        error: this.formatErrorForLog(error),
      });
      if (this.isQrSessionTimeoutIssue(error) || String(error?.message || '').includes("Can't login")) {
        const isSessionReady = await this.waitForQrSessionReady(rawCtx, {
          traceId,
          attempts: 5,
          waitMs: 1200,
        });
        if (!isSessionReady && this.isQrSessionTimeoutIssue(error)) {
          throw new Error('QR_SESSION_TIMEOUT');
        }
      }
    }

    // Ưu tiên cookie trả về trực tiếp từ rawLoginQR, fallback sang cookie còn lại trong cookie-jar.
    const primaryCredentials = this.normalizeLoginCredentials({
      imei,
      userAgent,
      language,
      cookie: qrResult?.cookies || rawCtx?.cookie?.toJSON?.()?.cookies || [],
    });

    if (callback && primaryCredentials?.cookie) {
      await callback({
        type: LoginQRCallbackEventType.GotLoginInfo,
        data: {
          cookie: primaryCredentials.cookie,
          imei: primaryCredentials.imei,
          userAgent: primaryCredentials.userAgent,
          language: primaryCredentials.language,
        },
        actions: null,
      });
    }

    if (!primaryCredentials) {
      if (rawLoginError) {
        throw rawLoginError;
      }
      throw new Error('QR_LOGIN_MISSING_COOKIES');
    }

    try {
      // Ưu tiên nhánh raw context để giữ nguyên cookie-jar gốc từ rawLoginQR.
      return await this.loginWithRawContextStrategies(
        rawCtx,
        {
          imei: primaryCredentials.imei,
          userAgent: primaryCredentials.userAgent,
          language: primaryCredentials.language,
        },
        {
          traceId,
          stepLabel: 'primary_raw_context_login',
        }
      );
    } catch (rawCtxPrimaryError) {
      const normalizedRawCtxPrimaryError = this.normalizeQrLoginError(rawCtxPrimaryError);
      console.error('[ZALO_QR_PRIMARY_RAW_CTX_FAIL]', {
        traceId,
        error: this.formatErrorForLog(normalizedRawCtxPrimaryError),
      });
      if (normalizedRawCtxPrimaryError.message === 'QR_SESSION_TIMEOUT') {
        throw normalizedRawCtxPrimaryError;
      }
    }

    try {
      return await this.loginWithStrategies(primaryCredentials, {
        traceId,
        stepLabel: 'primary_login',
        sourceLabel: 'qr_result_or_cookie_jar',
      });
    } catch (primaryError) {
      const normalizedPrimaryError = this.normalizeQrLoginError(primaryError);
      if (normalizedPrimaryError.message === 'QR_SESSION_TIMEOUT') {
        throw normalizedPrimaryError;
      }
      const rescuedCookies = rawCtx?.cookie?.toJSON?.()?.cookies || [];
      const rescueCredentials = this.normalizeLoginCredentials({
        imei,
        userAgent,
        language,
        cookie: rescuedCookies,
      });
      if (!rescueCredentials) {
        throw normalizedPrimaryError;
      }
      try {
        // Thử lại raw context lần nữa trước khi fallback sang credentials parse.
        return await this.loginWithRawContextStrategies(
          rawCtx,
          {
            imei: rescueCredentials.imei,
            userAgent: rescueCredentials.userAgent,
            language: rescueCredentials.language,
          },
          {
            traceId,
            stepLabel: 'rescue_raw_context_login',
          }
        );
      } catch (rawCtxRescueError) {
        const normalizedRawCtxRescueError = this.normalizeQrLoginError(rawCtxRescueError);
        console.error('[ZALO_QR_RESCUE_RAW_CTX_FAIL]', {
          traceId,
          error: this.formatErrorForLog(normalizedRawCtxRescueError),
        });
        if (normalizedRawCtxRescueError.message === 'QR_SESSION_TIMEOUT') {
          throw normalizedRawCtxRescueError;
        }
      }

      try {
        return await this.loginWithStrategies(rescueCredentials, {
          traceId,
          stepLabel: 'rescue_login',
          sourceLabel: 'cookie_jar_retry',
        });
      } catch (rescueError) {
        const normalizedRescueError = this.normalizeQrLoginError(rescueError);
        if (normalizedRescueError.message === 'QR_SESSION_TIMEOUT') {
          throw normalizedRescueError;
        }
        // Ưu tiên giữ nguyên lỗi gốc từ rawLoginQR để dễ theo dõi đúng nguyên nhân.
        throw this.normalizeQrLoginError(rawLoginError || normalizedRescueError || normalizedPrimaryError);
      }
    }
  }

  /**
   * Tạo key phiên QR và đăng ký metadata vào bộ nhớ.
   *
   * @param {number} userId
   * @returns {string}
   */
  createLoginSession(userId) {
    const sessionKey = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.loginSessions.set(sessionKey, {
      userId,
      status: 'waiting_scan',
      message: 'Đã tạo QR, chờ quét bằng ứng dụng Zalo.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      account: null,
    });
    return sessionKey;
  }

  /**
   * Cập nhật trạng thái phiên QR trong memory.
   *
   * @param {string} sessionKey
   * @param {Partial<{ status: string; message: string; account: Record<string, any> | null; api: any }>} patch
   */
  patchLoginSession(sessionKey, patch) {
    const current = this.loginSessions.get(sessionKey);
    if (!current) return;
    this.loginSessions.set(sessionKey, {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    });
  }

  /**
   * Dọn session QR hết hạn để tránh giữ memory quá lâu.
   */
  pruneExpiredLoginSessions() {
    const now = Date.now();
    for (const [sessionKey, session] of this.loginSessions.entries()) {
      if (now - session.createdAt > this.loginSessionTtlMs) {
        this.loginSessions.delete(sessionKey);
      }
    }
  }

  /**
   * Chuẩn hóa payload QR từ zca-js về data URL để frontend hiển thị trực tiếp.
   *
   * Hỗ trợ nhiều định dạng đầu vào:
   * - string path tới file QR
   * - string data URL/base64
   * - object chứa các key phổ biến như { qrImage, qrPath, base64, ... }
   *
   * @param {unknown} qrSource dữ liệu QR từ callback loginQR
   * @returns {Promise<{ qrImage: string; normalizedPath: string | null }>}
   */
  async buildQrImagePayload(qrSource) {
    if (!qrSource) {
      throw new Error('EMPTY_QR_PAYLOAD');
    }

    if (Buffer.isBuffer(qrSource)) {
      return {
        qrImage: `data:image/png;base64,${qrSource.toString('base64')}`,
        normalizedPath: null,
      };
    }

    if (typeof qrSource === 'string') {
      const trimmedValue = qrSource.trim();
      if (!trimmedValue) {
        throw new Error('EMPTY_QR_PAYLOAD');
      }

      if (trimmedValue.startsWith('data:image/')) {
        return { qrImage: trimmedValue, normalizedPath: null };
      }

      if (this.isLikelyBase64(trimmedValue)) {
        return {
          qrImage: this.buildDataUrlFromBase64(trimmedValue),
          normalizedPath: null,
        };
      }

      const normalizedPath = path.resolve(trimmedValue);
      const fileBuffer = await fs.readFile(normalizedPath);
      const ext = path.extname(normalizedPath).toLowerCase();
      const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      const qrImage = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      return { qrImage, normalizedPath };
    }

    if (typeof qrSource === 'object') {
      const payload = qrSource;
      const deepFoundValue = this.extractQrStringDeep(payload);
      if (deepFoundValue) {
        if (deepFoundValue.startsWith('data:image/')) {
          return { qrImage: deepFoundValue, normalizedPath: null };
        }
        if (this.isLikelyBase64(deepFoundValue)) {
          return {
            qrImage: this.buildDataUrlFromBase64(deepFoundValue),
            normalizedPath: null,
          };
        }
      }

      const inlineImageKeys = ['qrImage', 'qr', 'dataUrl', 'dataURL', 'image', 'base64', 'content'];
      for (const key of inlineImageKeys) {
        const value = payload?.[key];
        if (typeof value === 'string' && value.trim()) {
          if (value.trim().startsWith('data:image/')) {
            return { qrImage: value.trim(), normalizedPath: null };
          }
          if (this.isLikelyBase64(value)) {
            return {
              qrImage: this.buildDataUrlFromBase64(value),
              normalizedPath: null,
            };
          }
        }
      }

      const filePathKeys = ['qrPath', 'path', 'filePath', 'filepath', 'filename'];
      for (const key of filePathKeys) {
        const value = payload?.[key];
        if (typeof value === 'string' && value.trim()) {
          return this.buildQrImagePayload(value.trim());
        }
      }
    }

    throw new Error('UNSUPPORTED_QR_PAYLOAD');
  }

  /**
   * Lấy danh sách tài khoản Zalo của user hiện tại.
   * Response: { success, data: { items: Array<ZaloAccount> } }.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getAccounts(req, res) {
    try {
      const userId = req.user.id;
      const result = await db.query(
        `SELECT id, display_name, zalo_user_id, zalo_name, zalo_phone, login_method, status, is_active, is_default, notes, updated_at, last_connected_at
         FROM zalo_settings
         WHERE id_user = $1
         ORDER BY is_default DESC, created_at DESC`,
        [userId]
      );
      const disconnectedIds = await campaignZaloSenderService.syncDisconnectedAccountsFromMemory({
        userId,
        accounts: result.rows,
      });
      const normalizedRows = result.rows.map((row) => {
        if (!disconnectedIds.has(String(row.id))) return row;
        return {
          ...row,
          status: 'disconnected',
        };
      });

      return res.json({
        success: true,
        data: {
          items: normalizedRows.map((row) => this.mapRow(row)),
        },
      });
    } catch (error) {
      if (error?.code === '42P01') {
        return this.buildMissingTableResponse(res);
      }
      console.error('Get zalo settings error:', error);
      return res.status(500).json({ success: false, message: 'Không thể tải danh sách tài khoản Zalo' });
    }
  }

  /**
   * Xóa tài khoản Zalo theo ID của user hiện tại.
   * Params: { id }.
   * Response: { success, message }.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async deleteAccount(req, res) {
    try {
      const userId = req.user.id;
      const accountId = parseInt(req.params.id, 10);

      const deleted = await db.query(
        `DELETE FROM zalo_settings
         WHERE id = $1 AND id_user = $2
         RETURNING id, is_default`,
        [accountId, userId]
      );

      if (deleted.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản Zalo' });
      }

      zaloAccountSessionService.clearAccountApi(deleted.rows[0].id);

      if (deleted.rows[0].is_default) {
        await db.query(
          `WITH first_row AS (
             SELECT id FROM zalo_settings
             WHERE id_user = $1
             ORDER BY created_at ASC
             LIMIT 1
           )
           UPDATE zalo_settings
           SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP
           WHERE id IN (SELECT id FROM first_row)`,
          [userId]
        );
      }

      return res.json({ success: true, message: 'Đã xóa tài khoản Zalo' });
    } catch (error) {
      if (error?.code === '42P01') {
        return this.buildMissingTableResponse(res);
      }
      console.error('Delete zalo setting error:', error);
      return res.status(500).json({ success: false, message: 'Không thể xóa tài khoản Zalo' });
    }
  }

  /**
   * Đặt tài khoản mặc định dùng để gửi tin Zalo.
   * Params: { id }.
   * Response: { success, message }.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async setDefaultAccount(req, res) {
    const client = await db.getClient();
    try {
      const userId = req.user.id;
      const accountId = parseInt(req.params.id, 10);

      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT id FROM zalo_settings WHERE id = $1 AND id_user = $2 LIMIT 1',
        [accountId, userId]
      );
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản Zalo' });
      }

      await client.query('UPDATE zalo_settings SET is_default = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id_user = $1', [userId]);
      await client.query(
        'UPDATE zalo_settings SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND id_user = $2',
        [accountId, userId]
      );
      await client.query('COMMIT');

      return res.json({ success: true, message: 'Đã cập nhật tài khoản mặc định' });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error?.code === '42P01') {
        return this.buildMissingTableResponse(res);
      }
      console.error('Set default zalo setting error:', error);
      return res.status(500).json({ success: false, message: 'Không thể cập nhật tài khoản mặc định' });
    } finally {
      client.release();
    }
  }

  /**
   * POST /api/zalo/accounts/:id/restore-session
   * Purpose: Khôi phục session Zalo của một account từ `cookie_text` đã lưu.
   * Params: { id }.
   * Response: { success, message, data: { account } }.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async restoreAccountSessionByCookie(req, res) {
    try {
      const userId = req.user.id;
      const accountId = Number.parseInt(req.params.id, 10);
      const accountResult = await db.query(
        `SELECT id, display_name, cookie_text, is_active
         FROM zalo_settings
         WHERE id_user = $1 AND id = $2
         LIMIT 1`,
        [userId, accountId]
      );
      const accountRow = accountResult.rows[0] || null;
      if (!accountRow) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy tài khoản Zalo',
        });
      }

      if (accountRow.is_active !== true) {
        return res.status(400).json({
          success: false,
          message: 'Tài khoản Zalo đang không hoạt động, không thể khôi phục session',
        });
      }

      const cookieText = String(accountRow.cookie_text || '').trim();
      if (!cookieText) {
        return res.status(400).json({
          success: false,
          message: 'Tài khoản chưa có cookie đăng nhập để khôi phục',
        });
      }

      try {
        const api = await this.restoreApiFromCookieText(cookieText);
        const accountIdentity = await this.extractAccountIdentityFromApi(api, {});
        const updatedAccount = await this.markAccountConnectedAfterRestore({
          userId,
          accountId,
          accountIdentity,
          fallbackDisplayName: accountRow.display_name || 'Tài khoản Zalo',
          fallbackCookieText: cookieText,
        });

        if (!updatedAccount) {
          return res.status(404).json({
            success: false,
            message: 'Không tìm thấy tài khoản Zalo để cập nhật trạng thái',
          });
        }

        zaloAccountSessionService.setAccountApi(accountId, api);
        zaloAccountSessionService.startAccountListenerSafely({
          accountId,
          api,
          context: 'restoreAccountSessionByCookie',
        });

        return res.json({
          success: true,
          message: 'Khôi phục session Zalo thành công từ cookie đã lưu.',
          data: {
            account: updatedAccount,
          },
        });
      } catch (error) {
        await this.markAccountDisconnectedAfterRestoreFail({ userId, accountId });
        return res.status(400).json({
          success: false,
          message:
            error?.message === 'COOKIE_TEXT_EMPTY'
              ? 'Cookie đăng nhập trống hoặc không hợp lệ.'
              : 'Không thể khôi phục session Zalo từ cookie đã lưu. Vui lòng đăng nhập lại bằng QR.',
        });
      }
    } catch (error) {
      if (error?.code === '42P01') {
        return this.buildMissingTableResponse(res);
      }
      console.error('restoreAccountSessionByCookie error:', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể khôi phục session Zalo từ cookie',
      });
    }
  }

  /**
   * Tạo phiên đăng nhập QR cho Zalo.
   * Trả về ảnh QR dưới dạng data URL để frontend render ngay.
   *
   * Body: {}.
   * Response: { success, message, data: { qrPath, qrImage, mode, sessionKey } }.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async loginQr(req, res) {
    try {
      const userId = req.user.id;
      this.pruneExpiredLoginSessions();
      const sessionKey = this.createLoginSession(userId);
      const loginTraceId = `session-${sessionKey}`;
      const qrPayload = await new Promise((resolve, reject) => {
        let isSettled = false;
        const loginMeta = {
          qrScannedName: '',
          loginInfoCookie: null,
          loginInfoRaw: null,
          imei: '',
          userAgent: '',
          language: this.defaultZaloLanguage,
        };
        const timeout = setTimeout(() => {
          if (isSettled) return;
          isSettled = true;
          reject(new Error('QR_TIMEOUT'));
        }, 20000);

        const loginPromise = this.loginQrWithRescue({
          traceId: loginTraceId,
          callback: async (event) => {
          try {
            if (!event) {
              return;
            }

            if (event.type === LoginQRCallbackEventType.QRCodeScanned) {
              loginMeta.qrScannedName = String(event?.data?.display_name || '').trim();
              this.patchLoginSession(sessionKey, {
                status: 'scanned',
                message: loginMeta.qrScannedName
                  ? `Đã quét QR bởi tài khoản ${loginMeta.qrScannedName}, đang xác thực đăng nhập...`
                  : 'Đã quét QR, đang xác thực đăng nhập...',
              });
              return;
            }

            if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
              const parsedLoginInfo = this.extractQrLoginInfo(event?.data);
              loginMeta.loginInfoRaw = event?.data || null;
              loginMeta.loginInfoCookie = parsedLoginInfo.cookie || loginMeta.loginInfoCookie;
              loginMeta.imei = parsedLoginInfo.imei || loginMeta.imei;
              loginMeta.userAgent = parsedLoginInfo.userAgent || loginMeta.userAgent;
              loginMeta.language = parsedLoginInfo.language || loginMeta.language || this.defaultZaloLanguage;
              return;
            }

            if (event.type !== LoginQRCallbackEventType.QRCodeGenerated) {
              return;
            }

            if (isSettled) {
              return;
            }

            let qrSource = event?.data;
            if (!qrSource && event?.actions?.saveToFile) {
              const tempQrPath = path.resolve(`temp_uploads/zalo_qr_${Date.now()}.png`);
              await event.actions.saveToFile(tempQrPath);
              qrSource = tempQrPath;
            }

            const { qrImage, normalizedPath } = await this.buildQrImagePayload(qrSource);
            isSettled = true;
            clearTimeout(timeout);
            resolve({
              qrPath: normalizedPath,
              qrImage,
            });
          } catch (error) {
            isSettled = true;
            clearTimeout(timeout);
            reject(error);
          }
          },
        });

        loginPromise
          .then(async (api) => {
            await this.finalizeQrLoginSuccess({
              sessionKey,
              userId,
              api,
              loginMeta,
            });
          })
          .catch(async (error) => {
            const fallbackCredentials = this.buildLoginCredentialsFromQrMeta(loginMeta);
            const isSessionTimeout = error?.message === 'QR_SESSION_TIMEOUT';
            const hasScannedEvidence = Boolean(loginMeta?.qrScannedName || loginMeta?.loginInfoRaw || loginMeta?.loginInfoCookie);
            const shouldTryFallback = Boolean(fallbackCredentials) && (!isSessionTimeout || hasScannedEvidence);

            // Với timeout 102 nhưng đã có dữ liệu quét hợp lệ, vẫn thử rescue 1 lần
            // để tránh false-negative khi phiên trên server Zalo vừa được đồng bộ.
            if (shouldTryFallback) {
              this.patchLoginSession(sessionKey, {
                status: 'verifying',
                message: isSessionTimeout
                  ? 'Đã quét thành công, đang đồng bộ phiên và xác thực lại...'
                  : 'Đang thử xác thực lại từ dữ liệu phiên quét QR...',
              });

              try {
                if (isSessionTimeout) {
                  await new Promise((resolve) => setTimeout(resolve, 1500));
                }
                const fallbackApi = await this.loginWithStrategies(fallbackCredentials, {
                  traceId: loginTraceId,
                  stepLabel: 'controller_fallback_login',
                  sourceLabel: 'login_meta_from_callback',
                });
                if (fallbackApi) {
                  await this.finalizeQrLoginSuccess({
                    sessionKey,
                    userId,
                    api: fallbackApi,
                    loginMeta,
                  });
                  return;
                }
              } catch (fallbackError) {
                error = fallbackError;
              }
            }

            const normalizedLoginMessage =
              error?.message === 'QR_SESSION_TIMEOUT'
                ? 'Phiên QR đã hết hiệu lực hoặc quá thời gian xác thực. Vui lòng tạo và quét lại mã QR mới.'
                : `Đăng nhập thất bại: ${error?.message || 'Lỗi không xác định'}`;

            this.patchLoginSession(sessionKey, {
              status: 'failed',
              message: normalizedLoginMessage,
            });
            console.error('[ZALO_QR_FINAL_FAIL]', {
              traceId: loginTraceId,
              sessionKey,
              hasFallbackCredentials: shouldTryFallback,
              loginMetaState: {
                hasLoginInfoCookie: Boolean(loginMeta?.loginInfoCookie),
                hasLoginInfoRaw: Boolean(loginMeta?.loginInfoRaw),
                imeiLength: String(loginMeta?.imei || '').length,
                userAgentLength: String(loginMeta?.userAgent || '').length,
              },
              error: this.formatErrorForLog(error),
            });
          });
      });

      return res.json({
        success: true,
        message: 'Đã tạo QR đăng nhập, vui lòng quét bằng ứng dụng Zalo.',
        data: {
          ...qrPayload,
          mode: 'live',
          sessionKey,
        },
      });
    } catch (error) {
      const fallbackQrPath = process.env.ZALO_QR_PATH || '';
      if (fallbackQrPath) {
        try {
          const { qrImage, normalizedPath } = await this.buildQrImagePayload(fallbackQrPath);
          return res.json({
            success: true,
            message: 'Đã tạo QR đăng nhập từ cấu hình fallback.',
            data: {
              qrPath: normalizedPath,
              qrImage,
              mode: 'fallback',
            },
          });
        } catch {
          // fallback path invalid, continue to return error below.
        }
      }

      const normalizedMessage =
        error?.message === 'QR_TIMEOUT'
          ? 'Không lấy được mã QR trong thời gian chờ. Vui lòng thử lại.'
          : error?.message === 'EMPTY_QR_PAYLOAD'
            ? 'Không nhận được dữ liệu QR từ Zalo. Vui lòng thử lại.'
            : error?.message === 'UNSUPPORTED_QR_PAYLOAD'
              ? 'Dữ liệu QR không đúng định dạng hỗ trợ. Vui lòng thử lại.'
          : `Không thể tạo QR đăng nhập: ${error?.message || 'Lỗi không xác định'}`;

      return res.status(500).json({
        success: false,
        message: normalizedMessage,
      });
    }
  }

  /**
   * Lấy trạng thái phiên đăng nhập QR để frontend polling sau khi hiển thị QR.
   * Response: { success, data: { status, message, account } }.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getQrLoginStatus(req, res) {
    this.pruneExpiredLoginSessions();
    const userId = req.user.id;
    const sessionKey = String(req.params.sessionKey || '');
    const session = this.loginSessions.get(sessionKey);

    if (!session || session.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Phiên đăng nhập QR không tồn tại hoặc đã hết hạn.',
      });
    }

    return res.json({
      success: true,
      data: {
        status: session.status,
        message: session.message,
        account: session.account,
      },
    });
  }

  /**
   * Resolve selected account + connected api for preview actions.
   *
   * @param {number} userId
   * @param {string|number} accountId
   * @returns {Promise<{account: object, api: any}>}
   */
  async resolvePreviewAccountAndApi(userId, accountId) {
    const account = await campaignZaloSenderService.getCampaignZaloAccount({
      userId,
      accountId,
    });
    const api = await campaignZaloSenderService.getConnectedApiOrSyncStatus({
      accountId: account.id,
      userId,
    });
    return { account, api };
  }

  /**
   * POST /api/zalo/preview/send-personal
   * Purpose: Gửi tin nhắn Zalo cá nhân trong chế độ preview Campaign Builder.
   * Body: { accountId, recipients: string[], recipientType?: 'phone'|'uid', message, attachments?: object[] }
   * Response: { success, data: { items, meta } }
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async previewSendPersonalMessage(req, res) {
    try {
      const userId = req.user.id;
      const accountId = req.body?.accountId;
      const message = String(req.body?.message || '').trim();
      const recipientType = String(req.body?.recipientType || 'phone').trim().toLowerCase() === 'uid'
        ? 'uid'
        : 'phone';
      const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
      const templateAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
      const normalizedRecipients = Array.from(new Set(
        recipients.map((item) => String(item || '').trim()).filter(Boolean)
      ));
      const { account, api } = await this.resolvePreviewAccountAndApi(userId, accountId);
      const preparedAttachments = await campaignZaloSenderService.prepareZaloAttachmentSources(
        templateAttachments
      );

      const items = [];
      for (const recipient of normalizedRecipients) {
        try {
          const sent = await campaignZaloSenderService.sendPersonalMessage({
            api,
            recipient,
            recipientType,
            message,
            attachments: preparedAttachments,
          });
          items.push({
            recipient,
            recipientType,
            phone: sent.phone || null,
            status: 'success',
            uid: sent.uid || null,
            response: sent.response || null,
            attachments: templateAttachments,
            attachmentsCount: preparedAttachments.length,
          });
        } catch (error) {
          items.push({
            recipient,
            recipientType,
            status: 'failed',
            error: error?.message || 'Không thể gửi tin nhắn',
            attachments: templateAttachments,
            attachmentsCount: preparedAttachments.length,
          });
        }
      }

      return res.json({
        success: true,
        data: {
          account,
          items,
          meta: {
            attempted: items.length,
            success: items.filter((item) => item.status === 'success').length,
            failed: items.filter((item) => item.status === 'failed').length,
            recipientType,
          },
        },
      });
    } catch (error) {
      console.error('previewSendPersonalMessage error:', error);
      return res.status(400).json({
        success: false,
        message: error?.message || 'Không thể gửi tin nhắn Zalo preview',
      });
    }
  }

  /**
   * POST /api/zalo/preview/send-friend-request
   * Purpose: Gửi lời mời kết bạn Zalo trong chế độ preview Campaign Builder.
   * Body: { accountId, recipients: string[], message }
   * Response: { success, data: { items, meta } }
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async previewSendFriendRequest(req, res) {
    try {
      const userId = req.user.id;
      const accountId = req.body?.accountId;
      const message = String(req.body?.message || '').trim();
      const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
      const normalizedRecipients = Array.from(new Set(
        recipients.map((item) => String(item || '').trim()).filter(Boolean)
      ));
      const { account, api } = await this.resolvePreviewAccountAndApi(userId, accountId);

      const items = [];
      for (const phone of normalizedRecipients) {
        try {
          const sent = await campaignZaloSenderService.sendFriendRequest({
            api,
            phone,
            message,
          });
          items.push({
            phone,
            status: 'success',
            uid: sent.uid || null,
            response: sent.response || null,
          });
        } catch (error) {
          items.push({
            phone,
            status: 'failed',
            error: error?.message || 'Không thể gửi lời mời kết bạn',
          });
        }
      }

      return res.json({
        success: true,
        data: {
          account,
          items,
          meta: {
            attempted: items.length,
            success: items.filter((item) => item.status === 'success').length,
            failed: items.filter((item) => item.status === 'failed').length,
          },
        },
      });
    } catch (error) {
      console.error('previewSendFriendRequest error:', error);
      return res.status(400).json({
        success: false,
        message: error?.message || 'Không thể gửi lời mời kết bạn preview',
      });
    }
  }

  /**
   * POST /api/zalo/preview/send-group
   * Purpose: Gửi tin nhắn vào nhóm Zalo trong chế độ preview Campaign Builder.
   * Body: { accountId, groupIds: string[], message, attachments?: object[] }
   * Response: { success, data: { items, meta } }
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async previewSendGroupMessage(req, res) {
    try {
      const userId = req.user.id;
      const accountId = req.body?.accountId;
      const message = String(req.body?.message || '').trim();
      const groupIds = Array.isArray(req.body?.groupIds) ? req.body.groupIds : [];
      const templateAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
      const normalizedGroupIds = Array.from(new Set(
        groupIds.map((item) => String(item || '').trim()).filter(Boolean)
      ));
      const { account, api } = await this.resolvePreviewAccountAndApi(userId, accountId);
      const groupIdSet = await campaignZaloSenderService.getAllGroupIdSet(api);
      /**
       * Chuẩn bị attachment một lần để preview nhiều nhóm dùng chung,
       * tránh đọc lại cùng một file cho từng group gửi thử.
       */
      const preparedAttachments = await campaignZaloSenderService.prepareZaloAttachmentSources(
        templateAttachments
      );

      const items = [];
      for (const groupId of normalizedGroupIds) {
        try {
          if (groupIdSet.size > 0 && !groupIdSet.has(groupId)) {
            throw new Error(`Không tìm thấy nhóm ${groupId} trong tài khoản hiện tại`);
          }
          const sent = await campaignZaloSenderService.sendGroupMessage({
            api,
            groupId,
            message,
            attachments: preparedAttachments,
          });
          items.push({
            groupId,
            status: 'success',
            response: sent.response || null,
            attachments: templateAttachments,
            attachmentsCount: preparedAttachments.length,
          });
        } catch (error) {
          items.push({
            groupId,
            status: 'failed',
            error: error?.message || 'Không thể gửi tin nhắn nhóm',
            attachments: templateAttachments,
            attachmentsCount: preparedAttachments.length,
          });
        }
      }

      return res.json({
        success: true,
        data: {
          account,
          items,
          meta: {
            attempted: items.length,
            success: items.filter((item) => item.status === 'success').length,
            failed: items.filter((item) => item.status === 'failed').length,
          },
        },
      });
    } catch (error) {
      console.error('previewSendGroupMessage error:', error);
      return res.status(400).json({
        success: false,
        message: error?.message || 'Không thể gửi tin nhắn nhóm preview',
      });
    }
  }

  /**
   * GET /api/zalo/preview/friends
   * Purpose: Lấy danh sách bạn bè từ tài khoản Zalo đã chọn.
   * Query: { accountId, count?, page? }
   * Response: { success, data: { items } }
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async previewGetAllFriends(req, res) {
    try {
      const userId = req.user.id;
      const accountId = req.query?.accountId;
      const count = Number.isFinite(parseInt(req.query?.count, 10))
        ? parseInt(req.query.count, 10)
        : undefined;
      const page = Number.isFinite(parseInt(req.query?.page, 10))
        ? parseInt(req.query.page, 10)
        : undefined;
      const { account, api } = await this.resolvePreviewAccountAndApi(userId, accountId);
      const friendItems = await campaignZaloSenderService.getAllFriendsWithRetry(api, count, page);
      const items = await campaignZaloSenderService.normalizeFriendsWithProfileLookup(api, friendItems);
      return res.json({
        success: true,
        data: {
          account,
          items,
          meta: {
            totalItems: items.length,
          },
        },
      });
    } catch (error) {
      console.error('previewGetAllFriends error:', error);
      return res.status(400).json({
        success: false,
        message: error?.message || 'Không thể tải danh sách bạn bè Zalo',
      });
    }
  }

  /**
   * GET /api/zalo/preview/groups
   * Purpose: Lấy danh sách nhóm (id + tên nhóm) từ tài khoản Zalo đã chọn.
   * Query: { accountId }
   * Response: { success, data: { items } }
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async previewGetAllGroups(req, res) {
    try {
      const userId = req.user.id;
      const accountId = req.query?.accountId;
      const { account, api } = await this.resolvePreviewAccountAndApi(userId, accountId);
      const groupResp = await campaignZaloSenderService.getAllGroupsWithRetry(api);
      const baseItems = campaignZaloSenderService.extractGroupsFromResponse(groupResp);
      const items = await campaignZaloSenderService.enrichGroupNames(api, baseItems);
      return res.json({
        success: true,
        data: {
          account,
          items,
          meta: {
            totalItems: items.length,
            version: String(groupResp?.version || ''),
          },
        },
      });
    } catch (error) {
      console.error('previewGetAllGroups error:', error);
      return res.status(400).json({
        success: false,
        message: error?.message || 'Không thể tải danh sách nhóm Zalo',
      });
    }
  }
}

export default new ZaloSettingsController();

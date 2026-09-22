/**
 * chatbotTelegram.repository.js
 *
 * Data access for Telegram personal accounts + per-chatbot enable flags.
 * Mirrors the structure of `chatbotZaloAccount.repository.js` so that the
 * DeployTab toggle UI behaves consistently across channels.
 *
 * Telegram session state lives in the dedicated `telegram_session_state`
 * table (migration 217). The blob is AES-256-GCM-encrypted at the boundary
 * using the same `encryptBaileysBlob` / `decryptBaileysBlob` helpers that
 * WhatsApp Baileys uses (`utils/baileysAuthCrypto.util.js`) — the wire
 * format `enc:v1:...` and `SMTP_SECRET_KEY` derivation are shared.
 *
 * Pre-migration history: the codebase used to write a marker
 * `mtcute:<storageKey>` into `telegram_accounts.session_string` while the
 * real state lived in an on-disk SQLite file (`.telegram-sessions/...`).
 * The `loadSessionString`/`upsertSession`/`clearSessionString`/`listAllSessions`
 * methods below kept their old names for backward compatibility with the
 * gateway code but now read/write through the encrypted blob path. The
 * `session_string` column itself was dropped by migration 218.
 */
import db from '../../config/database.js';
import {
  decryptChannelSessionBlob as decryptBaileysBlob,
  encryptChannelSessionBlob as encryptBaileysBlob,
} from '../../utils/baileysAuthCrypto.util.js';

class ChatbotTelegramRepository {
  // ── Ownership check ────────────────────────────────────────────────

  /**
   * Verify that `telegramAccountId` belongs to `userId`. Throws 404 if
   * not — used as a guard before any write that touches a Telegram row.
   */
  async assertOwned(userId, telegramAccountId) {
    const { rows } = await db.query(
      `SELECT 1 FROM telegram_accounts
       WHERE id = $1 AND id_user = $2`,
      [telegramAccountId, userId]
    );
    if (!rows[0]) {
      const err = new Error('Không tìm thấy tài khoản Telegram trong workspace');
      err.status = 404;
      throw err;
    }
  }

  // ── Account CRUD ───────────────────────────────────────────────────

  async createAccount({
    idUser,
    telegramUserId,
    phone = null,
    firstName = null,
    lastName = null,
    username = null,
  }) {
    const { rows } = await db.query(
      `INSERT INTO telegram_accounts
         (id_user, telegram_user_id, phone, first_name, last_name, username)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id_user, telegram_user_id) DO UPDATE SET
         phone      = EXCLUDED.phone,
         first_name = EXCLUDED.first_name,
         last_name  = EXCLUDED.last_name,
         username   = EXCLUDED.username,
         is_active  = true,
         updated_at = NOW()
       RETURNING *`,
      [idUser, telegramUserId, phone, firstName, lastName, username]
    );
    return rows[0];
  }

  async getAccountById(id, { userId } = {}) {
    const params = [id];
    let userClause = '';
    if (userId) {
      params.push(userId);
      userClause = 'AND id_user = $2';
    }
    const { rows } = await db.query(
      `SELECT * FROM telegram_accounts WHERE id = $1 ${userClause}`,
      params
    );
    return rows[0] || null;
  }

  async getAccountByTelegramUserId(telegramUserId, { userId } = {}) {
    const params = [telegramUserId];
    let userClause = '';
    if (userId) {
      params.push(userId);
      userClause = 'AND id_user = $2';
    }
    const { rows } = await db.query(
      `SELECT * FROM telegram_accounts WHERE telegram_user_id = $1 ${userClause}`,
      params
    );
    return rows[0] || null;
  }

  /**
   * Read-only: fetch the encrypted session blob stored alongside an
   * account and decrypt it before returning. Returns the parsed
   * mtcute StorageProvider state, or `null` if no row exists, the
   * row is missing data, or decryption fails (e.g. wrong
   * `SMTP_SECRET_KEY`). Callers treat a `null` return as "this
   * account has never successfully scanned a QR" — same contract
   * as the legacy `getSessionString`.
   *
   * The blob is shaped as `{ kv, authKeys, peers, refMessages, self,
   * primaryDcs }` — see `telegramMtProtoStorage.js` for the exact
   * layout produced by the custom PostgresBackedDriver.
   */
  async getSessionString(telegramUserId, { userId: _userId = {} } = {}) {
    const { rows } = await db.query(
      `SELECT state FROM telegram_session_state
       WHERE telegram_user_id = $1`,
      [Number(telegramUserId)]
    );
    const stored = rows[0]?.state ?? null;
    if (!stored) return null;
    const blob = decryptBaileysBlob(stored);
    if (!blob || typeof blob !== 'object') return null;
    return blob;
  }

  /**
   * Persist the encrypted session blob alongside the profile row.
   * Called by the in-process gateway (`telegramAuth`) right after
   * QR login succeeds. The state is the output of
   * `PostgresBackedDriver._save()` — a JSON-friendly object holding
   * the entire mtcute storage graph. Safe to call repeatedly.
   *
   * If the profile row does not exist yet, it is created with
   * `is_active=true` (mirrors the legacy `upsertSession` semantics).
   * The `state` is encrypted here at the repository boundary; callers
   * pass the plain JS object so the encryption key handling stays in
   * one place.
   *
   * @param {Object} params
   * @param {number} params.telegramUserId
   * @param {Object} params.sessionState  plain state from `PostgresBackedDriver._save()`
   * @param {string|null} [params.phone]
   * @param {string|null} [params.firstName]
   * @param {string|null} [params.lastName]
   * @param {string|null} [params.username]
   * @param {number|null} [params.userId]
   */
  async upsertSession({
    telegramUserId,
    sessionString,
    sessionState,
    phone = null,
    firstName = null,
    lastName = null,
    username = null,
    userId = null,
  }) {
    // Accept either the legacy `sessionString` (kept for backwards
    // compat with existing call sites that pass the marker) or the
    // new `sessionState` blob. When `sessionState` is missing, fall
    // back to wrapping the legacy string in a plain object so the
    // encrypted row is still populated — operators get a
    // recoverable row instead of a NULL.
    const stateToPersist = sessionState ?? (sessionString ? { legacy: sessionString } : null);
    if (!stateToPersist) {
      throw new Error(
        '[chatbotTelegram.repository.upsertSession] requires sessionState or sessionString'
      );
    }
    const encrypted = encryptBaileysBlob(stateToPersist);

    if (!sessionState && sessionString) {
      // Back-compat: when callers still pass the legacy
      // `sessionString` marker, keep the old behaviour of ALSO
      // upserting the profile row. This matches the prior
      // `upsertSession` JSON body so external callers (admin
      // scripts, future CLI tools) keep working without code
      // changes. New code paths should pass `sessionState`
      // directly.
      const { rows } = await db.query(
        `INSERT INTO telegram_accounts
           (id_user, telegram_user_id, phone, first_name, last_name, username)
         VALUES (COALESCE($1, (SELECT id_user FROM telegram_accounts
                                WHERE telegram_user_id = $2 LIMIT 1)),
                 $2, $3, $4, $5, $6)
         ON CONFLICT (telegram_user_id) DO UPDATE SET
           phone      = COALESCE(EXCLUDED.phone,      telegram_accounts.phone),
           first_name = COALESCE(EXCLUDED.first_name, telegram_accounts.first_name),
           last_name  = COALESCE(EXCLUDED.last_name,  telegram_accounts.last_name),
           username   = COALESCE(EXCLUDED.username,   telegram_accounts.username),
           is_active  = true,
           updated_at = NOW()
         RETURNING *`,
        [userId, telegramUserId, phone, firstName, lastName, username]
      );
      // Insert/update the state row in a second statement. We
      // accept the small risk of a torn write between the two
      // rows because the legacy path is only kept alive for
      // call sites we still need to migrate; the new
      // `saveSessionState` direct method uses a single UPSERT.
      await db.query(
        `INSERT INTO telegram_session_state (telegram_user_id, state)
         VALUES ($1, $2)
         ON CONFLICT (telegram_user_id) DO UPDATE SET
           state      = EXCLUDED.state,
           updated_at = NOW()`,
        [Number(telegramUserId), encrypted]
      );
      return rows[0];
    }

    // New path: ensure the profile row exists BEFORE inserting the
    // state row. Bug trước: chỉ insert telegram_session_state thuần
    // → FK violation
    //   "violates foreign key constraint
    //    telegram_session_state_telegram_user_id_fkey"
    // vì telegram_session_state có FK refer telegram_accounts.
    // Sửa: insert telegram_accounts (UPSERT) trước, sau đó insert
    // telegram_session_state. Nếu telegram_accounts đã tồn tại (re-login
    // cùng telegram_user_id) thì chỉ update phone/first_name/...
    // via ON CONFLICT (legacy path đã làm đúng phần này — new path
    // trước đây bỏ sót).
    await db.query(
      `INSERT INTO telegram_accounts
         (id_user, telegram_user_id, phone, first_name, last_name, username)
       VALUES (COALESCE($1, (SELECT id_user FROM telegram_accounts
                              WHERE telegram_user_id = $2 LIMIT 1)),
               $2, $3, $4, $5, $6)
       ON CONFLICT (telegram_user_id) DO UPDATE SET
         phone      = COALESCE(EXCLUDED.phone,      telegram_accounts.phone),
         first_name = COALESCE(EXCLUDED.first_name, telegram_accounts.first_name),
         last_name  = COALESCE(EXCLUDED.last_name,  telegram_accounts.last_name),
         username   = COALESCE(EXCLUDED.username,   telegram_accounts.username),
         is_active  = true,
         updated_at = NOW()`,
      [userId, telegramUserId, phone, firstName, lastName, username]
    );

    const { rows } = await db.query(
      `INSERT INTO telegram_session_state (telegram_user_id, state)
       VALUES ($1, $2)
       ON CONFLICT (telegram_user_id) DO UPDATE SET
         state      = EXCLUDED.state,
         updated_at = NOW()
       RETURNING telegram_user_id, schema_version, updated_at`,
      [Number(telegramUserId), encrypted]
    );
    return rows[0];
  }

  /**
   * Drop the stored session blob without deleting the profile row.
   * Used when a transport reports the stored session is no longer
   * authorised (e.g. `getClient()` fails `isAuthorized()`).
   */
  async clearSessionString(telegramUserId) {
    await db.query(
      `DELETE FROM telegram_session_state WHERE telegram_user_id = $1`,
      [Number(telegramUserId)]
    );
  }

  /**
   * List every Telegram account that has a stored session. Mirrors
   * the Python gateway's `storage.list_all()` so the in-process
   * `listAccounts` facade can produce an `is_loaded` summary. The
   * `session_state` column is left encrypted — callers that want the
   * decrypted blob should call `getSessionString(telegram_user_id)`
   * directly to avoid double-decryption and to keep blast radius
   * small if the encryption key is ever rotated.
   */
  async listAllSessions() {
    const { rows } = await db.query(
      `SELECT ta.id, ta.id_user, ta.telegram_user_id, ta.phone, ta.first_name,
              ta.last_name, ta.username, ta.is_active, tss.state,
              tss.updated_at AS session_updated_at
       FROM telegram_accounts ta
       JOIN telegram_session_state tss
         ON tss.telegram_user_id = ta.telegram_user_id
       ORDER BY tss.updated_at DESC NULLS LAST, ta.id DESC`
    );
    return rows;
  }

  // ── Direct session state accessors (preferred new API) ──────────────

  /**
   * Load + decrypt the mtcute state for a single account. Thin
   * wrapper around `getSessionString` that exists so the
   * `telegramMtProtoStorage.js` driver can name its dependency
   * without having to know the repository's legacy method name.
   */
  async loadSessionState(telegramUserId) {
    return this.getSessionString(telegramUserId);
  }

  /**
   * Encrypt + UPSERT the mtcute state for a single account. The
   * state is the JSON-serialisable object produced by
   * `PostgresBackedDriver._save()`. Foreign key to
   * `telegram_accounts(telegram_user_id)` is enforced — caller
   * must have created the profile row first (via
   * `createAccount`/`upsertSession`) before saving the state.
   */
  async saveSessionState(telegramUserId, state) {
    if (state === null || state === undefined) {
      throw new Error(
        '[chatbotTelegram.repository.saveSessionState] state is required'
      );
    }
    if (typeof state !== 'object') {
      throw new Error(
        '[chatbotTelegram.repository.saveSessionState] state must be an object'
      );
    }
    const encrypted = encryptBaileysBlob(state);
    // Caller must have created the profile row via `upsertSession` /
    // `createAccount` BEFORE calling this method — telegram_session_state
    // has a FK to telegram_accounts(telegram_user_id) so the parent row
    // must exist or the INSERT fails with:
    //   "violates foreign key constraint
    //    telegram_session_state_telegram_user_id_fkey"
    const { rows } = await db.query(
      `INSERT INTO telegram_session_state (telegram_user_id, state)
       VALUES ($1, $2)
       ON CONFLICT (telegram_user_id) DO UPDATE SET
         state      = EXCLUDED.state,
         updated_at = NOW()
       RETURNING telegram_user_id, schema_version, updated_at`,
      [Number(telegramUserId), encrypted]
    );
    return rows[0];
  }

  /**
   * Hard-delete the mtcute state row. Foreign-key CASCADE on
   * `telegram_accounts` removal also triggers this, so a manual
   * call here is only needed when the profile row stays but the
   * session needs to be wiped (e.g. forced re-scan).
   */
  async deleteSessionState(telegramUserId) {
    await db.query(
      `DELETE FROM telegram_session_state WHERE telegram_user_id = $1`,
      [Number(telegramUserId)]
    );
  }

  /**
   * Return every `telegram_user_id` that has a persisted mtcute
   * session, ordered most-recently-active first. Used by
   * `TelegramSessionManager.restoreSessionsFromDb()` at boot.
   *
   * Returning just the keys (not the full blobs) keeps the boot
   * scan O(1) round-trip regardless of how many accounts exist —
   * each restore then issues one focused `loadSessionState` call.
   */
  async listAllSessionStateKeys() {
    const { rows } = await db.query(
      `SELECT telegram_user_id
       FROM telegram_session_state
       ORDER BY updated_at DESC`
    );
    return rows.map((r) => Number(r.telegram_user_id));
  }

  /**
   * Bind a session's owning Telegram user id to a specific
   * `telegram_accounts.id`. Called right after QR login.
   */
  async bindAccount(telegramUserId, accountId) {
    const { rows } = await db.query(
      `UPDATE telegram_accounts SET id_user = COALESCE(id_user, $2), updated_at = NOW()
       WHERE telegram_user_id = $1
       RETURNING *`,
      [Number(telegramUserId), Number(accountId)]
    );
    return rows[0] || null;
  }

  /**
   * Hard-delete an account row by `telegram_user_id`.
   */
  async deleteByTelegramUserId(telegramUserId) {
    const { rows } = await db.query(
      `DELETE FROM telegram_accounts WHERE telegram_user_id = $1 RETURNING *`,
      [Number(telegramUserId)]
    );
    return rows[0] || null;
  }

  async listAccountsByUser(userId) {
    const { rows } = await db.query(
      `SELECT * FROM telegram_accounts
       WHERE id_user = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  }

  async deleteAccount(userId, id) {
    const { rows } = await db.query(
      `DELETE FROM telegram_accounts
       WHERE id = $1 AND id_user = $2
       RETURNING *`,
      [id, userId]
    );
    return rows[0] || null;
  }

  async deactivateAccount(userId, id) {
    const { rows } = await db.query(
      `UPDATE telegram_accounts
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND id_user = $2
       RETURNING *`,
      [id, userId]
    );
    return rows[0] || null;
  }

  async touchActivity(id) {
    await db.query(
      `UPDATE telegram_accounts SET last_activity_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  // ── Per-chatbot enable (DeployTab) ────────────────────────────────

  /**
   * One row per (account, chatbot) with the enable flag + DM/group split.
   * Mirrors `chatbotZaloAccount.repository.js:listAccountsForUser` so the
   * toggle modal in the Studio can be built with minimal divergence.
   */
  async listAccountsForUser(userId, chatbotId = null) {
    const params = [userId];
    let chatbotJoin = '';
    if (chatbotId != null) {
      params.push(chatbotId);
      chatbotJoin = `LEFT JOIN telegram_chatbot_settings tcs
        ON tcs.id_telegram_account = ta.id AND tcs.id_chatbot = $2`;
    } else {
      chatbotJoin = `LEFT JOIN LATERAL (
        SELECT is_enabled, is_enabled_dm, is_enabled_group, id_chatbot
        FROM telegram_chatbot_settings
        WHERE id_telegram_account = ta.id
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      ) tcs ON true`;
    }

    const { rows } = await db.query(
      `SELECT
         ta.id,
         ta.id_user,
         ta.telegram_user_id,
         ta.phone,
         ta.first_name,
         ta.last_name,
         ta.username,
         ta.is_active,
         ta.last_activity_at,
         ta.created_at,
         tcs.is_enabled        AS chatbot_enabled,
         tcs.is_enabled_dm     AS chatbot_enabled_dm,
         tcs.is_enabled_group  AS chatbot_enabled_group,
         tcs.id_chatbot        AS settings_chatbot_id,
         cb.name               AS chatbot_name
       FROM telegram_accounts ta
       ${chatbotJoin}
       LEFT JOIN custom_chatbots cb
         ON cb.id = tcs.id_chatbot AND cb.id_user = ta.id_user AND cb.is_active = true
       WHERE ta.id_user = $1 AND ta.is_active = true
       ORDER BY ta.created_at DESC`,
      params
    );
    return rows;
  }

  async setEnabled(userId, telegramAccountId, chatbotId, enabled) {
    await this.assertOwned(userId, telegramAccountId);
    // Khi enabled=true, mặc định BẬT cả DM và group (giống UX các kênh
    // khác: Zalo Personal, WhatsApp Baileys). Khi enabled=false → tắt
    // tất cả.
    //
    // Bug trước: insert values `true, false` luôn set is_enabled_dm=false
    // và is_enabled_group=false. Kết quả:
    //   - `pickEnabledChatbotForTelegram` filter
    //     `(is_enabled_dm = true OR is_enabled_group = true)` loại row
    //     → idChatbot=null → webhook skip ngay.
    //   - Nếu vẫn pass được filter (vd row cũ), `processTelegramPersonalBatch`
    //     vẫn skip với "dm disabled" / "group disabled".
    // User thấy "đã bật chatbot cho Telegram" (is_enabled=true) nhưng
    // AI không rep — đúng triệu chứng production 14/09/2026.
    const dm = Boolean(enabled);
    const grp = Boolean(enabled);
    // ── NEW (Bug 22/09 — Zalo parity): snap `custom_chatbots.system_instruction`
    // ── vào `telegram_chatbot_settings.chatbot_system_instruction` khi
    // bật chatbot. Đây là nguồn fallback chính cho AI pipeline khi
    // `chatbot_settings.channel='telegram_personal'.system_instruction` rỗng.
    // Chỉ fill khi row hiện tại trống — KHÔNG ghi đè giá trị đã có
    // (giữ nguyên giá trị user đã edit thủ công).
    const { rows } = await db.query(
      `INSERT INTO telegram_chatbot_settings
         (id_telegram_account, id_chatbot, is_enabled,
          is_enabled_dm, is_enabled_group, chatbot_system_instruction)
       VALUES ($1, $2, $3, $4, $5,
               (SELECT NULLIF(BTRIM(cb.system_instruction), '')
                  FROM custom_chatbots cb
                 WHERE cb.id = $2 AND cb.is_active = true))
       ON CONFLICT (id_telegram_account, id_chatbot) DO UPDATE SET
         is_enabled      = EXCLUDED.is_enabled,
         is_enabled_dm   = EXCLUDED.is_enabled_dm,
         is_enabled_group = EXCLUDED.is_enabled_group,
         chatbot_system_instruction = COALESCE(
           NULLIF(BTRIM(telegram_chatbot_settings.chatbot_system_instruction), ''),
           NULLIF(BTRIM(EXCLUDED.chatbot_system_instruction), '')
         ),
         updated_at = NOW()
       RETURNING *`,
      [telegramAccountId, chatbotId, enabled, dm, grp]
    );
    return rows[0];
  }

  /**
   * Read settings row for a (telegram_account, chatbot) tuple with
   * `custom_chatbots.system_instruction` JOINed in as
   * `chatbot_system_instruction` — mirrors `chatbotZaloAccount.repository.js`
   * so the AI pipeline can fallback the same way Zalo Personal does.
   *
   * Returns `null` if no row exists yet for this (account, chatbot).
   */
  async getSettingsForAccount(telegramAccountId, chatbotId) {
    if (!telegramAccountId || !chatbotId) return null;
    const { rows } = await db.query(
      `SELECT tcs.*,
              cb.name              AS chatbot_name,
              cb.system_instruction AS chatbot_system_instruction,
              cb.ai_model          AS chatbot_ai_model,
              cb.temperature       AS chatbot_temperature,
              cb.max_tokens        AS chatbot_max_tokens,
              cb.response_style    AS chatbot_response_style,
              cb.welcome_message   AS chatbot_welcome_message
         FROM telegram_chatbot_settings tcs
         JOIN custom_chatbots cb ON cb.id = tcs.id_chatbot
        WHERE tcs.id_telegram_account = $1
          AND tcs.id_chatbot = $2
        LIMIT 1`,
      [telegramAccountId, chatbotId]
    );
    return rows[0] || null;
  }

  /**
   * One-off backfill: rows hiện tại có is_enabled=true nhưng
   * is_enabled_dm/is_enabled_group=false do bug cũ trong setEnabled.
   * Bật cả 2 lên true để chatbot rep lại được. Idempotent.
   */
  async backfillStuckEnabledRows() {
    const { rows } = await db.query(
      `UPDATE telegram_chatbot_settings
         SET is_enabled_dm = true,
             is_enabled_group = true,
             updated_at = NOW()
       WHERE is_enabled = true
         AND (is_enabled_dm = false OR is_enabled_group = false)
       RETURNING id, id_telegram_account, id_chatbot`
    );
    if (rows.length > 0) {
      console.log(
        `[chatbotTelegram.repository] backfill: unstuck ${rows.length} rows ` +
        `(is_enabled=true nhưng DM/group=false do bug cũ):`,
        rows.map((r) => `${r.id_telegram_account}/${r.id_chatbot}`).join(', ')
      );
    }
    return rows;
  }

  async getEnabledChatbots(telegramAccountId, { isDm = false, isGroup = false } = {}) {
    const conditions = [
      'tcs.id_telegram_account = $1',
      'tcs.is_enabled = true',
      'ta.is_active = true',
    ];
    const params = [telegramAccountId];
    if (isDm) conditions.push('tcs.is_enabled_dm = true');
    if (isGroup) conditions.push('tcs.is_enabled_group = true');

    const { rows } = await db.query(
      `SELECT
         tcs.id_chatbot       AS id,
         tcs.id_chatbot,
         cb.name              AS chatbot_name,
         cb.system_instruction,
         cb.ai_model,
         cb.temperature,
         cb.max_tokens,
         cb.response_style,
         cb.welcome_message,
         cb.greeting_msg,
         ta.id_user
       FROM telegram_chatbot_settings tcs
       JOIN telegram_accounts ta ON ta.id = tcs.id_telegram_account
       JOIN custom_chatbots cb
         ON cb.id = tcs.id_chatbot AND cb.is_active = true
       WHERE ${conditions.join(' AND ')}
       ORDER BY cb.id ASC`,
      params
    );
    return rows;
  }

  async disableAllForUser(userId) {
    await db.query(
      `UPDATE telegram_chatbot_settings tcs
       SET is_enabled = false, updated_at = NOW()
       FROM telegram_accounts ta
       WHERE tcs.id_telegram_account = ta.id
         AND ta.id_user = $1`,
      [userId]
    );
  }
}

export default new ChatbotTelegramRepository();

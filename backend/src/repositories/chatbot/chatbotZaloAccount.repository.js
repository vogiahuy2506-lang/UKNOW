import db from '../../config/database.js';

class ChatbotZaloAccountRepository {
  async assertOwnedConfiguration(userId, zaloSettingId, data = {}) {
    const { rows } = await db.query(
      `SELECT 1
       FROM zalo_settings zs
       WHERE zs.id = $1 AND zs.id_user = $2 AND zs.is_active = true
         AND ($3::bigint IS NULL OR EXISTS (
           SELECT 1 FROM custom_chatbots cb
           WHERE cb.id = $3 AND cb.id_user = $2 AND cb.is_active = true
         ))
         AND ($4::bigint IS NULL OR EXISTS (
           SELECT 1 FROM sub_assistants sa
           WHERE sa.id = $4 AND sa.id_user = $2 AND sa.is_active = true
         ))`,
      [zaloSettingId, userId, data.id_chatbot || null, data.id_sub_assistant || null]
    );
    if (!rows[0]) {
      const error = new Error('Không tìm thấy tài khoản Zalo hoặc cấu hình chatbot trong không gian làm việc');
      error.status = 404;
      throw error;
    }
  }

  /**
   * Get chatbot settings for a specific Zalo account
   * @param {number} userId
   * @param {number} zaloSettingId
   * @returns {Promise<object|null>}
   */
  /**
   * Get chatbot settings for a specific Zalo account.
   *
   * @param {number} userId
   * @param {number} zaloSettingId
   * @param {object} [opts]
   * @param {number|null} [opts.idChatbot] - If provided, returns the row for this
   *   (user, zalo, chatbot) tuple. If omitted, returns the most recently updated
   *   row (legacy behavior — backwards compat for callers that haven't been
   *   migrated to the per-chatbot model).
   * @returns {Promise<object|null>}
   */
  async getSettings(userId, zaloSettingId, { idChatbot } = {}) {
    const { rows } = await db.query(
      `SELECT czs.*, sa.name AS sub_assistant_name, sa.greeting_msg,
              cb.name AS chatbot_name, cb.system_instruction AS chatbot_system_instruction,
              cb.ai_model AS chatbot_ai_model,
              cb.temperature AS chatbot_temperature,
              cb.max_tokens AS chatbot_max_tokens,
              cb.response_style AS chatbot_response_style,
              cb.welcome_message AS chatbot_welcome_message
       FROM chatbot_zalo_account_settings czs
       LEFT JOIN sub_assistants sa
              ON sa.id = czs.id_sub_assistant AND sa.id_user = czs.id_user
       LEFT JOIN custom_chatbots cb
              ON cb.id = czs.id_chatbot AND cb.id_user = czs.id_user AND cb.is_active = true
       WHERE czs.id_user = $1 AND czs.id_zalo_setting = $2
         AND ($3::bigint IS NULL OR czs.id_chatbot = $3::bigint)
       ORDER BY czs.id_chatbot NULLS LAST, czs.updated_at DESC NULLS LAST
       LIMIT 1`,
      [userId, zaloSettingId, idChatbot ?? null]
    );
    return rows[0] || null;
  }

  /**
   * Get all chatbot settings for a user (with Zalo account info)
   * @param {number} userId
   * @returns {Promise<object[]>}
   */
  async getAllSettingsForUser(userId) {
    const { rows } = await db.query(
      `SELECT czs.*,
              zs.display_name AS zalo_display_name,
              zs.status AS zalo_status,
              zs.is_active AS zalo_is_active,
              sa.name AS sub_assistant_name,
              cb.name AS chatbot_name,
              cb.system_instruction AS chatbot_system_instruction
       FROM chatbot_zalo_account_settings czs
       JOIN zalo_settings zs ON zs.id = czs.id_zalo_setting
       LEFT JOIN sub_assistants sa
              ON sa.id = czs.id_sub_assistant AND sa.id_user = czs.id_user
       LEFT JOIN custom_chatbots cb
              ON cb.id = czs.id_chatbot AND cb.id_user = czs.id_user AND cb.is_active = true
       WHERE czs.id_user = $1
       ORDER BY czs.created_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * List all Zalo accounts (zalo_settings) of the user with chatbot-enabled flag.
   * Returns one row per linked account, regardless of whether settings row exists.
   *
   * @param {number} userId
   * @param {number|null} [chatbotId] - If provided, the chatbot_enabled flag reflects
   *   the row matching this chatbot. If omitted/null, the flag reflects the most
   *   recently updated row for that (user, zalo) pair (legacy behavior).
   */
  async listAccountsForUser(userId, chatbotId = null) {
    // When chatbotId is given, only LEFT JOIN the matching row for that chatbot.
    // Otherwise use a subquery to pick the most recent row per (user, zalo), so
    // a zalo linked to multiple chatbots shows ONE consistent state.
    const chatbotJoinClause = chatbotId == null
      ? `LEFT JOIN LATERAL (
           SELECT is_enabled, id_chatbot
           FROM chatbot_zalo_account_settings
           WHERE id_zalo_setting = zs.id AND id_user = zs.id_user
           ORDER BY updated_at DESC NULLS LAST, id DESC
           LIMIT 1
         ) czs ON true`
      : `LEFT JOIN chatbot_zalo_account_settings czs
           ON czs.id_zalo_setting = zs.id AND czs.id_user = zs.id_user
              AND czs.id_chatbot = $2`;
    // S-12: 1 tài khoản Zalo = 1 chatbot. Khi biết đang xem chatbot nào, trả thêm chatbot KHÁC đang bật trên tài khoản
    // này để hộp Zalo cá nhân hiện "Đang bật cho: <tên>" (và backend chặn bật bot thứ hai, xem findOtherEnabledChatbot).
    const otherChatbotColumns = chatbotId == null
      ? ''
      : `,
              oth.id_chatbot AS other_chatbot_id,
              oth.name AS other_chatbot_name`;
    const otherChatbotJoin = chatbotId == null
      ? ''
      : `LEFT JOIN (
           SELECT DISTINCT ON (o.id_zalo_setting) o.id_zalo_setting, o.id_chatbot, ocb.name
           FROM chatbot_zalo_account_settings o
           JOIN custom_chatbots ocb
             ON ocb.id = o.id_chatbot AND ocb.id_user = o.id_user AND ocb.is_active = true
           WHERE o.id_user = $1
             AND o.is_enabled = true AND o.id_chatbot IS NOT NULL AND o.id_chatbot <> $2
           ORDER BY o.id_zalo_setting, o.updated_at DESC NULLS LAST, o.id DESC
         ) oth ON oth.id_zalo_setting = zs.id`;

    const { rows } = await db.query(
      `SELECT zs.id,
              zs.id_user,
              zs.display_name,
              zs.zalo_user_id,
              zs.zalo_name,
              zs.zalo_phone,
              zs.status,
              zs.is_active,
              zs.last_connected_at,
              zs.created_at,
              czs.is_enabled AS chatbot_enabled,
              czs.id_chatbot,
              cb.name AS chatbot_name${otherChatbotColumns}
       FROM zalo_settings zs
       ${chatbotJoinClause}
       LEFT JOIN custom_chatbots cb
              ON cb.id = czs.id_chatbot AND cb.id_user = zs.id_user AND cb.is_active = true
       ${otherChatbotJoin}
       WHERE zs.id_user = $1 AND zs.is_active = true
       ORDER BY zs.is_default DESC, zs.created_at DESC`,
      chatbotId == null ? [userId] : [userId, chatbotId]
    );
    return rows;
  }

  /**
   * Enable/disable chatbot for a Zalo account linked to a specific chatbot.
   * Each (user, zalo, chatbot) tuple is independent — toggling chatbot A does not
   * affect chatbot B sharing the same Zalo account.
   *
   * Bug 2.3 revised: the auto-fill that copied `custom_chatbots.id_sub_assistant`
   * into `chatbot_zalo_account_settings.id_sub_assistant` was removed because the
   * sub_assistant indirection itself is being removed from the custom_chatbot path
   * (see migration 166). Channel-level config still owns the per-account
   * sub_assistant (used by kb_chunks RAG); custom_chatbot RAG now queries
   * `custom_chatbot_chunks` directly by chatbot_id.
   *
   * @param {number} userId
   * @param {number} zaloSettingId
   * @param {number|null} idChatbot - chatbot the row belongs to. Pass null for the
   *   "default" row that is not yet linked to any specific chatbot.
   * @param {boolean} enabled
   * @returns {Promise<object>}
   */
  async setEnabled(userId, zaloSettingId, idChatbot, enabled) {
    await this.assertOwnedConfiguration(userId, zaloSettingId, { id_chatbot: idChatbot });
    const { rows } = await db.query(
      `INSERT INTO chatbot_zalo_account_settings
         (id_user, id_zalo_setting, id_chatbot, is_enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id_user, id_zalo_setting, id_chatbot) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         updated_at = NOW()
       RETURNING *`,
      [userId, zaloSettingId, idChatbot, enabled]
    );
    return rows[0];
  }

  /**
   * S-12 — chatbot KHÁC (còn hoạt động) đang bật trên tài khoản Zalo này. Quy tắc "1 tài khoản = 1 chatbot": nếu có
   * thì không cho bật thêm bot thứ hai (backend chọn bot theo vòng tròn, khách mới bị chia ngầm giữa các bot).
   * Chỉ tính dòng có id_chatbot (dòng mặc định id_chatbot NULL là cấu hình mức kênh, không phải một chatbot) và chỉ
   * dòng đang bật; dòng cũ đã trùng (user 39) không bị đụng — chỉ chặn lúc bật thêm.
   * @returns {Promise<{ id: number, name: string }|null>}
   */
  async findOtherEnabledChatbot(userId, zaloSettingId, chatbotId) {
    const { rows } = await db.query(
      `SELECT cb.id, cb.name
       FROM chatbot_zalo_account_settings czs
       JOIN custom_chatbots cb
         ON cb.id = czs.id_chatbot AND cb.id_user = czs.id_user AND cb.is_active = true
       WHERE czs.id_user = $1 AND czs.id_zalo_setting = $2
         AND czs.is_enabled = true AND czs.id_chatbot IS NOT NULL
         AND czs.id_chatbot <> $3::bigint
       ORDER BY czs.updated_at DESC NULLS LAST, czs.id DESC
       LIMIT 1`,
      [userId, zaloSettingId, chatbotId]
    );
    return rows[0] || null;
  }

  /**
   * Delete chatbot settings for a Zalo account
   * @param {number} userId
   * @param {number} zaloSettingId
   * @returns {Promise<void>}
   */
  async deleteSettings(userId, zaloSettingId) {
    await db.query(
      `DELETE FROM chatbot_zalo_account_settings
       WHERE id_user = $1 AND id_zalo_setting = $2`,
      [userId, zaloSettingId]
    );
  }

  async disableAllForUser(userId) {
    await db.query(
      `UPDATE chatbot_zalo_account_settings
       SET is_enabled = false, updated_at = NOW()
       WHERE id_user = $1`,
      [userId]
    );
  }

  /**
   * Tắt mọi dòng cấu hình Zalo gắn với MỘT chatbot (dùng khi xoá chatbot). Phải chạy mỗi lần xoá, không chỉ khi
   * chủ hết chatbot (`disableAllForUser`): dòng còn is_enabled = true của chatbot đã xoá mềm làm hội thoại Zalo
   * đã ghim chatbot đó vẫn được AI trả lời (A P1-4).
   * @returns {Promise<number>} số dòng được tắt
   */
  async disableForChatbot(userId, chatbotId) {
    const { rowCount } = await db.query(
      `UPDATE chatbot_zalo_account_settings
       SET is_enabled = false, updated_at = NOW()
       WHERE id_user = $1 AND id_chatbot = $2 AND is_enabled = true`,
      [userId, chatbotId]
    );
    return rowCount;
  }

  /**
   * Get all enabled chatbot accounts for a user
   * @param {number} userId
   * @returns {Promise<object[]>}
   */
  async getEnabledAccounts(userId) {
    const { rows } = await db.query(
      `SELECT czs.*, zs.display_name AS zalo_display_name
       FROM chatbot_zalo_account_settings czs
       JOIN zalo_settings zs ON zs.id = czs.id_zalo_setting
       WHERE czs.id_user = $1 AND czs.is_enabled = true
       ORDER BY czs.created_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Pick the chatbot a NEW Zalo personal conversation should be pinned to.
   *
   * Picker order:
   *   1. If a chatbot has already handled this (user, zalo) before, prefer it
   *      (round-robin by conversation.id mod chat.length) so successive new
   *      conversations spread across chatbots fairly instead of all piling on
   *      the most-recently-enabled one.
   *   2. Fall back to deterministic order: the active chatbot with the lowest
   *      custom_chatbots.id — this is stable across restarts and easy to reason
   *      about ("the first chatbot you created handles this").
   *   3. If no chatbots are enabled, returns null and the caller should treat
   *      the row as the "default" (id_chatbot=NULL) channel-level config.
   *
   * @param {number} userId
   * @param {number} zaloSettingId
   * @param {number} roundRobinSeed - any stable number per call site
   *   (e.g. conversation.id) used to spread load evenly.
   * @returns {Promise<number|null>}
   */
  async pickEnabledChatbotForZalo(userId, zaloSettingId, roundRobinSeed = 0) {
    const { rows } = await db.query(
      `SELECT czs.id_chatbot
         FROM chatbot_zalo_account_settings czs
         JOIN custom_chatbots cb
           ON cb.id = czs.id_chatbot AND cb.id_user = czs.id_user AND cb.is_active = true
        WHERE czs.id_user = $1
          AND czs.id_zalo_setting = $2
          AND czs.id_chatbot IS NOT NULL
          AND czs.is_enabled = true
        ORDER BY czs.id_chatbot ASC`,
      [userId, zaloSettingId]
    );
    if (rows.length === 0) return null;
    const idx = ((Number(roundRobinSeed) || 0) % rows.length + rows.length) % rows.length;
    return Number(rows[idx].id_chatbot);
  }

  /**
   * Get sub-assistants for a user (for dropdown selection)
   * @param {number} userId
   * @returns {Promise<object[]>}
   */
  async getSubAssistants(userId) {
    const { rows } = await db.query(
      `SELECT id, name, greeting_msg, description
       FROM sub_assistants
       WHERE id_user = $1 AND is_active = true
       ORDER BY name`,
      [userId]
    );
    return rows;
  }
}

export default new ChatbotZaloAccountRepository();

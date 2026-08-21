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
      const error = new Error('Không tìm thấy tài khoản Zalo hoặc cấu hình chatbot trong workspace');
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
              cb.name AS chatbot_name, cb.system_instruction AS chatbot_system_instruction
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
              cb.name AS chatbot_name
       FROM zalo_settings zs
       ${chatbotJoinClause}
       LEFT JOIN custom_chatbots cb
              ON cb.id = czs.id_chatbot AND cb.id_user = zs.id_user AND cb.is_active = true
       WHERE zs.id_user = $1 AND zs.is_active = true
       ORDER BY zs.is_default DESC, zs.created_at DESC`,
      chatbotId == null ? [userId] : [userId, chatbotId]
    );
    return rows;
  }

  /**
   * Upsert chatbot settings for a Zalo account
   * @param {number} userId
   * @param {number} zaloSettingId
   * @param {object} data
   * @returns {Promise<object>}
   */
  async upsertSettings(userId, zaloSettingId, data) {
    await this.assertOwnedConfiguration(userId, zaloSettingId, data);
    const { rows } = await db.query(
      `INSERT INTO chatbot_zalo_account_settings
         (id_user, id_zalo_setting, is_enabled, id_sub_assistant, welcome_message,
          ai_model, temperature, max_tokens, response_style, system_instruction, settings,
          id_chatbot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id_user, id_zalo_setting, id_chatbot) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         id_sub_assistant = EXCLUDED.id_sub_assistant,
         welcome_message = EXCLUDED.welcome_message,
         ai_model = EXCLUDED.ai_model,
         temperature = EXCLUDED.temperature,
         max_tokens = EXCLUDED.max_tokens,
         response_style = EXCLUDED.response_style,
         system_instruction = EXCLUDED.system_instruction,
         settings = EXCLUDED.settings,
         id_chatbot = EXCLUDED.id_chatbot,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        zaloSettingId,
        data.is_enabled !== undefined ? data.is_enabled : false,
        data.id_sub_assistant || null,
        data.welcome_message || null,
        data.ai_model || 'gemini-2.5-flash',
        data.temperature || 0.7,
        data.max_tokens || 2048,
        data.response_style || 'friendly',
        data.system_instruction || null,
        JSON.stringify(data.settings || {}),
        data.id_chatbot || null,
      ]
    );
    return rows[0];
  }

  /**
   * Enable/disable chatbot for a Zalo account linked to a specific chatbot.
   * Each (user, zalo, chatbot) tuple is independent — toggling chatbot A does not
   * affect chatbot B sharing the same Zalo account.
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

import db from '../../config/database.js';

class ChatbotZaloAccountRepository {
  /**
   * Get chatbot settings for a specific Zalo account
   * @param {number} userId
   * @param {number} zaloSettingId
   * @returns {Promise<object|null>}
   */
  async getSettings(userId, zaloSettingId) {
    const { rows } = await db.query(
      `SELECT czs.*, sa.name AS sub_assistant_name, sa.greeting_msg,
              cb.name AS chatbot_name, cb.system_instruction AS chatbot_system_instruction
       FROM chatbot_zalo_account_settings czs
       LEFT JOIN sub_assistants sa ON sa.id = czs.id_sub_assistant
       LEFT JOIN custom_chatbots cb ON cb.id = czs.id_chatbot AND cb.is_active = true
       WHERE czs.id_user = $1 AND czs.id_zalo_setting = $2`,
      [userId, zaloSettingId]
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
       LEFT JOIN sub_assistants sa ON sa.id = czs.id_sub_assistant
       LEFT JOIN custom_chatbots cb ON cb.id = czs.id_chatbot AND cb.is_active = true
       WHERE czs.id_user = $1
       ORDER BY czs.created_at DESC`,
      [userId]
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
    const { rows } = await db.query(
      `INSERT INTO chatbot_zalo_account_settings
         (id_user, id_zalo_setting, is_enabled, id_sub_assistant, welcome_message,
          ai_model, temperature, max_tokens, response_style, system_instruction, settings,
          id_chatbot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id_user, id_zalo_setting) DO UPDATE SET
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
   * Enable/disable chatbot for a Zalo account
   * @param {number} userId
   * @param {number} zaloSettingId
   * @param {boolean} enabled
   * @returns {Promise<object>}
   */
  async setEnabled(userId, zaloSettingId, enabled) {
    const { rows } = await db.query(
      `INSERT INTO chatbot_zalo_account_settings
         (id_user, id_zalo_setting, is_enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (id_user, id_zalo_setting) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         updated_at = NOW()
       RETURNING *`,
      [userId, zaloSettingId, enabled]
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

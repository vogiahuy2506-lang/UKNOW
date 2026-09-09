import db from '../../config/database.js';

/**
 * Repository for `chatbot_whatsapp_baileys_settings` (Baileys QR sessions).
 *
 * Each row represents a per-(user, session, chatbot) AI enable flag for a
 * WhatsApp session connected via Baileys (QR scan). This is independent
 * from `chatbot_whatsapp_account_settings` (Cloud API via Meta OAuth) — a
 * user can have BOTH kinds and toggle each separately.
 *
 * Runtime lookup of the actual Baileys session happens through
 * `whatsappBaileys.service` (in-memory + on-disk creds).
 */
class ChatbotWhatsAppBaileysRepository {
  /**
   * Verify the Baileys session belongs to the user. We don't have a DB row
   * for the session itself, so we just assert the settings row's
   * (id_user, session_key) matches.
   */
  async assertOwnedSession(userId, sessionKey) {
    if (!sessionKey || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionKey)) {
      const error = new Error('session_key không hợp lệ');
      error.status = 400;
      throw error;
    }
    // Confirm the session_key starts with `${userId}-` (the convention used
    // by whatsappBaileys.service.safeSessionKey). The shortKey is whatever
    // comes after that prefix.
    if (!sessionKey.startsWith(`${userId}-`)) {
      const error = new Error('Session WhatsApp không thuộc về user hiện tại');
      error.status = 403;
      throw error;
    }
  }

  /**
   * Get a settings row for (user, session, chatbot).
   */
  async getSettings(userId, sessionKey, { idChatbot } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM chatbot_whatsapp_baileys_settings
       WHERE id_user = $1
         AND session_key = $2
         AND ($3::bigint IS NULL OR id_chatbot = $3::bigint)
       ORDER BY id_chatbot NULLS LAST, updated_at DESC NULLS LAST
       LIMIT 1`,
      [userId, sessionKey, idChatbot ?? null]
    );
    return rows[0] || null;
  }

  /**
   * Toggle is_enabled for (user, session, chatbot). Lazy-creates the row.
   */
  async setEnabled(userId, sessionKey, idChatbot, enabled) {
    await this.assertOwnedSession(userId, sessionKey);
    const { rows } = await db.query(
      `INSERT INTO chatbot_whatsapp_baileys_settings
         (id_user, session_key, id_chatbot, is_enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ON CONSTRAINT uq_chatbot_whatsapp_baileys_user_session_chatbot DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         updated_at = NOW()
       RETURNING *`,
      [userId, sessionKey, idChatbot, enabled]
    );
    return rows[0];
  }

  /**
   * Webhook-side lookup: is AI enabled for this (session, chatbot)?
   */
  async isEnabledForChatbot(sessionKey, chatbotId) {
    const { rows } = await db.query(
      `SELECT is_enabled FROM chatbot_whatsapp_baileys_settings
       WHERE session_key = $1 AND id_chatbot = $2
       LIMIT 1`,
      [sessionKey, chatbotId]
    );
    return rows[0]?.is_enabled === true;
  }

  /**
   * Upsert full settings row (model/temperature/welcome/system_instruction).
   */
  async upsertSettings(userId, sessionKey, data) {
    await this.assertOwnedSession(userId, sessionKey);
    const { rows } = await db.query(
      `INSERT INTO chatbot_whatsapp_baileys_settings
         (id_user, session_key, id_chatbot, is_enabled, id_sub_assistant,
          welcome_message, ai_model, temperature, max_tokens, response_style,
          system_instruction, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT ON CONSTRAINT uq_chatbot_whatsapp_baileys_user_session_chatbot DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         id_sub_assistant = EXCLUDED.id_sub_assistant,
         welcome_message = EXCLUDED.welcome_message,
         ai_model = EXCLUDED.ai_model,
         temperature = EXCLUDED.temperature,
         max_tokens = EXCLUDED.max_tokens,
         response_style = EXCLUDED.response_style,
         system_instruction = EXCLUDED.system_instruction,
         settings = EXCLUDED.settings,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        sessionKey,
        data.id_chatbot || null,
        data.is_enabled !== undefined ? data.is_enabled : false,
        data.id_sub_assistant || null,
        data.welcome_message || null,
        data.ai_model || 'gemini-2.5-flash',
        data.temperature ?? 0.7,
        data.max_tokens || 2048,
        data.response_style || 'friendly',
        data.system_instruction || null,
        JSON.stringify(data.settings || {}),
      ]
    );
    return rows[0];
  }
}

export default new ChatbotWhatsAppBaileysRepository();

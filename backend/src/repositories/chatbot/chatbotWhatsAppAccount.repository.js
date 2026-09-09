import db from '../../config/database.js';

/**
 * Repository for `chatbot_whatsapp_account_settings`.
 *
 * Mirrors `chatbotZaloAccount.repository.js` but keyed by
 * `chatbot_channel_connections.id` (multi-account per chatbot) and
 * designed to support per-(user, whatsapp_account, chatbot) AI toggles.
 */
class ChatbotWhatsAppAccountRepository {
  /**
   * Verify that the channel connection + optional chatbot both belong to the
   * user before mutating settings. Used by every mutating method.
   */
  async assertOwnedConfiguration(userId, channelConnectionId, { idChatbot } = {}) {
    const { rows } = await db.query(
      `SELECT 1
       FROM chatbot_channel_connections ccc
       JOIN custom_chatbots cc ON cc.id = ccc.id_chatbot
       WHERE ccc.id = $1
         AND ccc.channel_type = 'whatsapp'
         AND cc.id_user = $2
         AND cc.is_active = true
         AND ($3::bigint IS NULL OR EXISTS (
           SELECT 1 FROM custom_chatbots cb
           WHERE cb.id = $3 AND cb.id_user = $2 AND cb.is_active = true
         ))`,
      [channelConnectionId, userId, idChatbot ?? null]
    );
    if (!rows[0]) {
      const error = new Error('Không tìm thấy tài khoản WhatsApp hoặc cấu hình chatbot trong workspace');
      error.status = 404;
      throw error;
    }
  }

  /**
   * Get the settings row for a (user, whatsapp account, chatbot) tuple.
   * Returns null if no row exists yet — toggle creates the row lazily.
   */
  async getSettings(userId, channelConnectionId, { idChatbot } = {}) {
    const { rows } = await db.query(
      `SELECT cws.*, cb.name AS chatbot_name
       FROM chatbot_whatsapp_account_settings cws
       LEFT JOIN custom_chatbots cb
              ON cb.id = cws.id_chatbot AND cb.id_user = cws.id_user
       WHERE cws.id_user = $1
         AND cws.id_channel_connection = $2
         AND ($3::bigint IS NULL OR cws.id_chatbot = $3::bigint)
       ORDER BY cws.id_chatbot NULLS LAST, cws.updated_at DESC NULLS LAST
       LIMIT 1`,
      [userId, channelConnectionId, idChatbot ?? null]
    );
    return rows[0] || null;
  }

  /**
   * Insert / update the entire settings row for the tuple. Used when the
   * user edits AI configuration (model, temperature, system instruction).
   * NOT used by `toggleWhatsAppAccountChatbot` — that uses setEnabled.
   */
  async upsertSettings(userId, channelConnectionId, data) {
    await this.assertOwnedConfiguration(userId, channelConnectionId, { idChatbot: data.id_chatbot });
    const { rows } = await db.query(
      `INSERT INTO chatbot_whatsapp_account_settings
         (id_user, id_channel_connection, id_chatbot, is_enabled, id_sub_assistant,
          welcome_message, ai_model, temperature, max_tokens, response_style,
          system_instruction, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT ON CONSTRAINT uq_chatbot_whatsapp_account_chatbot DO UPDATE SET
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
        channelConnectionId,
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

  /**
   * Toggle is_enabled for a (user, whatsapp, chatbot) tuple. Lazily creates
   * the row when none exists yet. This is the workhorse for the
   * per-chatbot AI switch in the WhatsAppChannelModal.
   */
  async setEnabled(userId, channelConnectionId, idChatbot, enabled) {
    await this.assertOwnedConfiguration(userId, channelConnectionId, { idChatbot });
    const { rows } = await db.query(
      `INSERT INTO chatbot_whatsapp_account_settings
         (id_user, id_channel_connection, id_chatbot, is_enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ON CONSTRAINT uq_chatbot_whatsapp_account_chatbot DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         updated_at = NOW()
       RETURNING *`,
      [userId, channelConnectionId, idChatbot, enabled]
    );
    return rows[0];
  }

  /**
   * Webhook-side lookup: did the user enable AI for this tuple?
   * If no settings row exists we treat it as disabled (user must opt in).
   */
  async isEnabledForChatbot(channelConnectionId, chatbotId) {
    const { rows } = await db.query(
      `SELECT is_enabled FROM chatbot_whatsapp_account_settings
       WHERE id_channel_connection = $1 AND id_chatbot = $2
       LIMIT 1`,
      [channelConnectionId, chatbotId]
    );
    return rows[0]?.is_enabled === true;
  }

  /**
   * List every WhatsApp account connection owned by the user, joined with
   * the per-chatbot enable flag (when chatbotId is provided).
   *
   * IMPORTANT: bảng `chatbot_channel_connections` KHÔNG có cột `id_user` —
   * mỗi connection thuộc về một chatbot, và chatbot mới thuộc về user.
   * Query cũ filter `cb.id_user = $1` khiến modal trong tab Deploy chỉ thấy
   * account gắn vào chatbot CỦA user đó. Account mà user liên kết qua
   * ChannelSettings (chưa gắn vào chatbot nào, hoặc gắn vào chatbot của
   * user khác dùng chung workspace) sẽ bị ẩn → modal Deploy báo trống
   * dù ChannelSettings hiển thị đầy đủ.
   *
   * Cách fix hợp lý nhất cho nghiệp vụ hiện tại: list theo `id_user` của
   * workspace owner thông qua JOIN tất cả custom_chatbots của user đó.
   * Nếu 1 connection được share giữa nhiều chatbot cùng owner (multi-account
   * per chatbot đã được migration 194 hỗ trợ), vẫn trả đúng 1 row — vì
   * `chatbot_channel_connections` keyed theo `id_chatbot + channel_type +
   * external_channel_id`, mỗi row ứng với 1 account trên 1 chatbot.
   */
  async listAccountsForUser(userId, chatbotId = null) {
    // ownership giờ lấy thẳng từ custom_chatbots.id_user của user đang login
    // (không phụ thuộc chatbot cụ thể nào). Các JOIN cũ tham chiếu
    // `ccc.id_user` đã được sửa sang `cb.id_user` (cb = custom_chatbots).
    const chatbotJoinClause = chatbotId == null
      ? `LEFT JOIN LATERAL (
           SELECT is_enabled, id_chatbot
           FROM chatbot_whatsapp_account_settings
           WHERE id_channel_connection = ccc.id AND id_user = $1
           ORDER BY updated_at DESC NULLS LAST, id DESC
           LIMIT 1
         ) cws ON true`
      : `LEFT JOIN chatbot_whatsapp_account_settings cws
           ON cws.id_channel_connection = ccc.id AND cws.id_user = $1
              AND cws.id_chatbot = $2`;

    const { rows } = await db.query(
      `SELECT ccc.id,
              ccc.id_chatbot,
              ccc.display_name,
              ccc.phone_number,
              ccc.waba_id,
              ccc.phone_number_id,
              ccc.business_id,
              ccc.app_id,
              ccc.is_active,
              ccc.connected_at,
              ccc.last_activity_at,
              ccc.settings,
              COALESCE(ccc.settings->>'is_default', 'false')::boolean AS is_default,
              cws.is_enabled AS chatbot_enabled,
              cws.id_chatbot AS settings_chatbot_id,
              cb.name AS chatbot_name
       FROM chatbot_channel_connections ccc
       JOIN custom_chatbots cb ON cb.id = ccc.id_chatbot
       ${chatbotJoinClause}
       WHERE ccc.channel_type = 'whatsapp'
         AND cb.id_user = $1
       ORDER BY (COALESCE(ccc.settings->>'is_default', 'false')::boolean) DESC, ccc.connected_at DESC NULLS LAST, ccc.created_at DESC`,
      chatbotId == null ? [userId] : [userId, chatbotId]
    );
    return rows;
  }

  /**
   * Disable all per-chatbot settings for the user — called when the last
   * chatbot is deleted to avoid dangling references.
   */
  async disableAllForUser(userId) {
    await db.query(
      `UPDATE chatbot_whatsapp_account_settings
       SET is_enabled = false, updated_at = NOW()
       WHERE id_user = $1`,
      [userId]
    );
  }
}

export default new ChatbotWhatsAppAccountRepository();

import db from '../../config/database.js';

class ChatbotChannelRepository {
  // ── Chatbot Channel Connections ─────────────────────────────────

  /**
   * Find channel connection by webhook token
   */
  async findByWebhookToken(webhookToken) {
    const { rows } = await db.query(
      `SELECT ccc.*, cc.id_user, cc.name as chatbot_name, cc.widget_key
       FROM chatbot_channel_connections ccc
       JOIN custom_chatbots cc ON cc.id = ccc.id_chatbot
       WHERE ccc.webhook_token = $1 AND ccc.is_active = true AND cc.is_active = true`,
      [webhookToken]
    );
    return rows[0] || null;
  }

  /**
   * Get all channel connections for a chatbot
   */
  async findByChatbotId(chatbotId) {
    const { rows } = await db.query(
      `SELECT * FROM chatbot_channel_connections
       WHERE id_chatbot = $1 AND is_active = true
       ORDER BY channel_type`,
      [chatbotId]
    );
    return rows;
  }

  /**
   * Get active channel connection for a chatbot and type
   */
  async findActiveChannel(chatbotId, channelType) {
    const { rows } = await db.query(
      `SELECT * FROM chatbot_channel_connections
       WHERE id_chatbot = $1 AND channel_type = $2 AND is_active = true`,
      [chatbotId, channelType]
    );
    return rows[0] || null;
  }

  /**
   * Create or update channel connection for chatbot
   */
  async upsertChannel(chatbotId, channelType, data) {
    const { rows } = await db.query(
      `INSERT INTO chatbot_channel_connections 
         (id_chatbot, channel_type, credentials, webhook_token, webhook_url, 
          display_name, external_channel_id, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id_chatbot, channel_type) DO UPDATE SET
         credentials = EXCLUDED.credentials,
         webhook_token = COALESCE(EXCLUDED.webhook_token, chatbot_channel_connections.webhook_token),
         webhook_url = EXCLUDED.webhook_url,
         display_name = EXCLUDED.display_name,
         external_channel_id = EXCLUDED.external_channel_id,
         settings = EXCLUDED.settings,
         is_active = true,
         updated_at = NOW()
       RETURNING *`,
      [
        chatbotId,
        channelType,
        JSON.stringify(data.credentials || {}),
        data.webhook_token,
        data.webhook_url,
        data.display_name,
        data.external_channel_id,
        JSON.stringify(data.settings || {}),
      ]
    );
    return rows[0];
  }

  /**
   * Deactivate channel connection
   */
  async deactivateChannel(chatbotId, channelType) {
    const { rows } = await db.query(
      `UPDATE chatbot_channel_connections
       SET is_active = false, updated_at = NOW()
       WHERE id_chatbot = $1 AND channel_type = $2
       RETURNING *`,
      [chatbotId, channelType]
    );
    return rows[0];
  }

  async deactivateAllForChatbot(chatbotId) {
    await db.query(
      `UPDATE chatbot_channel_connections
       SET is_active = false, updated_at = NOW()
       WHERE id_chatbot = $1`,
      [chatbotId]
    );
  }

  /**
   * Update last activity timestamp
   */
  async updateLastActivity(id) {
    await db.query(
      `UPDATE chatbot_channel_connections
       SET last_activity_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  async getOrCreateConversation({ chatbotId, channelId, externalId, source }) {
    const existing = await db.query(
      `SELECT * FROM chatbot_conversations
       WHERE id_channel = $1 AND external_id = $2 AND status = 'active'
       ORDER BY created_at DESC LIMIT 1`,
      [channelId, externalId]
    );

    if (existing.rows[0]) {
      return existing.rows[0];
    }

    const created = await db.query(
      `INSERT INTO chatbot_conversations
         (id_chatbot, id_channel, channel_type, external_id, source)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [chatbotId, channelId, source.replace('_oa', ''), externalId, source]
    );

    return created.rows[0];
  }

  async addMessage(conversationId, { role, content, message_type, external_id }) {
    const { rows } = await db.query(
      `INSERT INTO chatbot_messages (id_conversation, role, content, message_type, external_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id_conversation, external_id) WHERE external_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [conversationId, role, content, message_type || 'text', external_id || null]
    );

    if (!rows[0] && external_id) {
      const { rows: existingRows } = await db.query(
        `SELECT * FROM chatbot_messages
         WHERE id_conversation = $1 AND external_id = $2
         LIMIT 1`,
        [conversationId, external_id]
      );
      return existingRows[0] ? { ...existingRows[0], isDuplicate: true } : null;
    }

    await db.query(
      `UPDATE chatbot_conversations SET last_message_at = NOW() WHERE id = $1`,
      [conversationId]
    );
    return rows[0];
  }

  async getLatestMessageId(conversationId) {
    const { rows } = await db.query(
      `SELECT MAX(id)::integer AS id FROM chatbot_messages WHERE id_conversation = $1`,
      [conversationId]
    );
    return rows[0]?.id ?? null;
  }

  /**
   * Get all active channels of a type for a user
   */
  async findUserChannelsByType(userId, channelType) {
    const { rows } = await db.query(
      `SELECT ccc.*, cc.name as chatbot_name, cc.widget_key
       FROM chatbot_channel_connections ccc
       JOIN custom_chatbots cc ON cc.id = ccc.id_chatbot
       WHERE cc.id_user = $1 AND ccc.channel_type = $2 AND ccc.is_active = true
       ORDER BY cc.name`,
      [userId, channelType]
    );
    return rows;
  }

  async getChannelAccessToken(channelId) {
    const { rows } = await db.query(
      `SELECT credentials->>'access_token' as access_token FROM channel_connections WHERE id = $1`,
      [channelId]
    );
    return rows[0]?.access_token ?? null;
  }

  async getChatbotChannelAccessToken(channelId) {
    const { rows } = await db.query(
      `SELECT credentials->>'access_token' AS access_token
       FROM chatbot_channel_connections
       WHERE id = $1 AND is_active = true`,
      [channelId]
    );
    return rows[0]?.access_token ?? null;
  }

  async findActiveChannelById(channelId) {
    const { rows } = await db.query(
      `SELECT ccc.*
       FROM chatbot_channel_connections ccc
       JOIN custom_chatbots cc ON cc.id = ccc.id_chatbot
       WHERE ccc.id = $1 AND ccc.is_active = true AND cc.is_active = true`,
      [channelId]
    );
    return rows[0] || null;
  }

  async getChannelPageAccessToken(channelId) {
    const { rows } = await db.query(
      `SELECT credentials->>'page_access_token' as page_access_token FROM channel_connections WHERE id = $1`,
      [channelId]
    );
    return rows[0]?.page_access_token ?? null;
  }

  // ── WhatsApp-specific helpers (migration 194) ────────────────────────

  /**
   * Upsert a WhatsApp account connection on a chatbot.
   * Multiple WhatsApp accounts per chatbot are allowed — UNIQUE key is
   * (id_chatbot, channel_type, external_channel_id).
   *
   * Note: this intentionally does NOT touch `is_active` on update. The user
   * must opt-in via ChannelSettings toggle after connection.
   */
  async upsertWhatsAppAccount(chatbotId, data) {
    const { rows } = await db.query(
      `INSERT INTO chatbot_channel_connections
         (id_chatbot, channel_type, credentials, webhook_token, webhook_url,
          display_name, external_channel_id, settings,
          phone_number, waba_id, phone_number_id, business_id, app_id,
          is_active)
       VALUES ($1, 'whatsapp', $2, $3, $4, $5, $6, $7,
               $8, $9, $10, $11, $12,
               COALESCE($13, false))
       ON CONFLICT ON CONSTRAINT uq_chatbot_channel_whatsapp DO UPDATE SET
         credentials = EXCLUDED.credentials,
         webhook_token = COALESCE(EXCLUDED.webhook_token, chatbot_channel_connections.webhook_token),
         webhook_url = EXCLUDED.webhook_url,
         display_name = EXCLUDED.display_name,
         settings = EXCLUDED.settings,
         phone_number = EXCLUDED.phone_number,
         waba_id = EXCLUDED.waba_id,
         phone_number_id = EXCLUDED.phone_number_id,
         business_id = EXCLUDED.business_id,
         app_id = EXCLUDED.app_id,
         -- Preserve user's manual toggle decision.
         is_active = CASE
           WHEN chatbot_channel_connections.connected_at IS NULL THEN COALESCE($13, false)
           ELSE chatbot_channel_connections.is_active
         END,
         updated_at = NOW()
       RETURNING *`,
      [
        chatbotId,
        JSON.stringify(data.credentials || {}),
        data.webhook_token,
        data.webhook_url,
        data.display_name || data.phone_number,
        data.external_channel_id || data.phone_number_id,
        JSON.stringify(data.settings || {}),
        data.phone_number || null,
        data.waba_id || null,
        data.phone_number_id || null,
        data.business_id || null,
        data.app_id || null,
        typeof data.is_active === 'boolean' ? data.is_active : null,
      ]
    );
    return rows[0];
  }

  /**
   * Deactivate a single WhatsApp connection by its primary key.
   * Unlike deactivateChannel (which targets a (chatbot, type) pair) this
   * targets a specific row so multi-account disconnects work correctly.
   */
  async deactivateWhatsAppById(id) {
    const { rows } = await db.query(
      `UPDATE chatbot_channel_connections
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND channel_type = 'whatsapp'
       RETURNING *`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Toggle the global `is_active` flag on a WhatsApp connection.
   * Used by ChannelSettings "Bật AI cho tài khoản này" toggle.
   */
  async updateWhatsAppActive(id, isActive) {
    const { rows } = await db.query(
      `UPDATE chatbot_channel_connections
       SET is_active = $2, updated_at = NOW()
       WHERE id = $1 AND channel_type = 'whatsapp'
       RETURNING *`,
      [id, Boolean(isActive)]
    );
    return rows[0] || null;
  }

  /**
   * Lookup an active WhatsApp channel by phone_number_id.
   * Used when the webhook routing path needs to find the channel without
   * relying on the webhook_token in the URL (e.g. callbacks from Meta's
   * Embedded Signup phone assignment webhook).
   */
  async findWhatsAppChannelByPhoneNumberId(phoneNumberId) {
    const { rows } = await db.query(
      `SELECT ccc.*, cc.id_user, cc.name as chatbot_name, cc.widget_key
       FROM chatbot_channel_connections ccc
       JOIN custom_chatbots cc ON cc.id = ccc.id_chatbot
       WHERE ccc.phone_number_id = $1
         AND ccc.channel_type = 'whatsapp'
         AND ccc.is_active = true
         AND cc.is_active = true
       LIMIT 1`,
      [phoneNumberId]
    );
    return rows[0] || null;
  }

  /**
   * Mark a WhatsApp connection as the user's default (one per user).
   * `is_default` is stored inside the `settings` JSONB column to avoid a
   * schema change — only one row may have it true at a time.
   */
  async setWhatsAppDefault(userId, channelId) {
    // First unset on every row of the user, then set on the target row.
    // We touch settings->'is_default' rather than a real column.
    await db.query(
      `UPDATE chatbot_channel_connections ccc
       SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('is_default', false),
           updated_at = NOW()
       FROM custom_chatbots cc
       WHERE ccc.id_chatbot = cc.id
         AND cc.id_user = $1
         AND ccc.channel_type = 'whatsapp'
         AND COALESCE(ccc.settings->>'is_default', 'false')::boolean = true`,
      [userId]
    );
    await db.query(
      `UPDATE chatbot_channel_connections ccc
       SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('is_default', true),
           updated_at = NOW()
       FROM custom_chatbots cc
       WHERE ccc.id_chatbot = cc.id
         AND cc.id_user = $1
         AND ccc.id = $2
         AND ccc.channel_type = 'whatsapp'`,
      [userId, channelId]
    );
  }

  /**
   * Delete a channel_conversations record + its messages.
   * @param {number} conversationId - channel_conversations.id
   * @param {number} userId - owner to verify ownership via channel_connections join
   */
  async deleteChannelConversation(conversationId, userId) {
    return db.query(
      `DELETE FROM channel_conversations
       WHERE id = $1
         AND id_channel IN (
           SELECT cc.id FROM channel_connections cc WHERE cc.id_user = $2
         )`,
      [conversationId, userId]
    );
  }
}

export default new ChatbotChannelRepository();

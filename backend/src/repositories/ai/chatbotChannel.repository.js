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
    await db.query(
      `INSERT INTO chatbot_messages (id_conversation, role, content, message_type, external_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [conversationId, role, content, message_type || 'text', external_id || null]
    );

    await db.query(
      `UPDATE chatbot_conversations SET last_message_at = NOW() WHERE id = $1`,
      [conversationId]
    );
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

  async getChannelPageAccessToken(channelId) {
    const { rows } = await db.query(
      `SELECT credentials->>'page_access_token' as page_access_token FROM channel_connections WHERE id = $1`,
      [channelId]
    );
    return rows[0]?.page_access_token ?? null;
  }
}

export default new ChatbotChannelRepository();

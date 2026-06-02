import db from '../../config/database.js';

class ChatbotRepository {
  // ── Chatbot Settings ────────────────────────────────────────────

  async getSettings(userId, channel) {
    const { rows } = await db.query(
      `SELECT cs.*, sa.name AS sub_assistant_name, sa.greeting_msg
       FROM chatbot_settings cs
       LEFT JOIN sub_assistants sa ON sa.id = cs.id_sub_assistant
       WHERE cs.id_user = $1 AND cs.channel = $2`,
      [userId, channel]
    );
    return rows[0] || null;
  }

  async upsertSettings(userId, channel, data) {
    const { rows } = await db.query(
      `INSERT INTO chatbot_settings
         (id_user, channel, id_sub_assistant, is_enabled, welcome_message,
          ai_model, temperature, max_tokens, response_style, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id_user, channel) DO UPDATE SET
         id_sub_assistant = EXCLUDED.id_sub_assistant,
         is_enabled = EXCLUDED.is_enabled,
         welcome_message = EXCLUDED.welcome_message,
         ai_model = EXCLUDED.ai_model,
         temperature = EXCLUDED.temperature,
         max_tokens = EXCLUDED.max_tokens,
         response_style = EXCLUDED.response_style,
         settings = EXCLUDED.settings,
         updated_at = NOW()
       RETURNING *`,
      [userId, channel, data.id_sub_assistant || null,
       data.is_enabled !== undefined ? data.is_enabled : true,
       data.welcome_message || null, data.ai_model || 'gemini-2.5-flash',
       data.temperature || 0.7, data.max_tokens || 2048,
       data.response_style || 'friendly',
       JSON.stringify(data.settings || {})]
    );
    return rows[0];
  }

  // ── Channel Connections ─────────────────────────────────────────

  async findAllChannelsByUser(userId) {
    const { rows } = await db.query(
      `SELECT * FROM channel_connections WHERE id_user = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  }

  async findChannelByType(userId, channel) {
    const { rows } = await db.query(
      `SELECT * FROM channel_connections WHERE id_user = $1 AND channel = $2`,
      [userId, channel]
    );
    return rows[0] || null;
  }

  async upsertChannel(userId, channel, { display_name, credentials, webhook_url, settings }) {
    const { rows } = await db.query(
      `INSERT INTO channel_connections (id_user, channel, display_name, credentials, webhook_url, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id_user, channel) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         credentials = EXCLUDED.credentials,
         webhook_url = EXCLUDED.webhook_url,
         settings = EXCLUDED.settings,
         is_active = true,
         updated_at = NOW()
       RETURNING *`,
      [userId, channel, display_name || null,
       JSON.stringify(credentials || {}), webhook_url || null,
       JSON.stringify(settings || {})]
    );
    return rows[0];
  }

  async deactivateChannel(userId, channel) {
    await db.query(
      `UPDATE channel_connections SET is_active = false, updated_at = NOW()
       WHERE id_user = $1 AND channel = $2`,
      [userId, channel]
    );
  }

  // ── Web Widget Configs ─────────────────────────────────────────

  async findWidgetByKey(widgetKey) {
    const { rows } = await db.query(
      `SELECT wc.*, sa.name AS sub_assistant_name, sa.greeting_msg, sa.avatar_url
       FROM web_widget_configs wc
       LEFT JOIN sub_assistants sa ON sa.id = wc.id_sub_assistant
       WHERE wc.widget_key = $1 AND wc.is_active = true`,
      [widgetKey]
    );
    return rows[0] || null;
  }

  async findWidgetsByUser(userId) {
    const { rows } = await db.query(
      `SELECT wc.*, sa.name AS sub_assistant_name,
              (SELECT COUNT(*) FROM webchat_conversations WHERE id_widget_config = wc.id) AS conversation_count
       FROM web_widget_configs wc
       LEFT JOIN sub_assistants sa ON sa.id = wc.id_sub_assistant
       WHERE wc.id_user = $1
       ORDER BY wc.created_at DESC`,
      [userId]
    );
    return rows;
  }

  async createWidget(userId, { id_sub_assistant, widget_key, display_name, theme_color, position, welcome_message, allowed_domains, settings }) {
    const { rows } = await db.query(
      `INSERT INTO web_widget_configs
         (id_user, id_sub_assistant, widget_key, display_name, theme_color, position, welcome_message, allowed_domains, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, id_sub_assistant || null, widget_key, display_name || null,
       theme_color || '#3B82F6', position || 'bottom-right',
       welcome_message || null, allowed_domains || null,
       JSON.stringify(settings || {})]
    );
    return rows[0];
  }

  async updateWidget(id, userId, data) {
    const { rows } = await db.query(
      `UPDATE web_widget_configs SET
         display_name = COALESCE($3, display_name),
         theme_color = COALESCE($4, theme_color),
         position = COALESCE($5, position),
         welcome_message = COALESCE($6, welcome_message),
         is_active = COALESCE($7, is_active),
         allowed_domains = COALESCE($8, allowed_domains),
         settings = COALESCE($9, settings),
         updated_at = NOW()
       WHERE id = $1 AND id_user = $2
       RETURNING *`,
      [id, userId, data.display_name, data.theme_color, data.position,
       data.welcome_message, data.is_active, data.allowed_domains,
       data.settings ? JSON.stringify(data.settings) : null]
    );
    return rows[0];
  }

  async deleteWidget(id, userId) {
    await db.query(
      `DELETE FROM web_widget_configs WHERE id = $1 AND id_user = $2`,
      [id, userId]
    );
  }

  // ── Web Chat Conversations & Messages ──────────────────────────

  async getOrCreateWebChatConversation({ widgetConfigId, userId, sessionId, visitorName, visitorEmail, visitorInfo }) {
    let conv;
    if (sessionId) {
      const existing = await db.query(
        `SELECT * FROM webchat_conversations
         WHERE id_widget_config = $1 AND session_id = $2 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [widgetConfigId, sessionId]
      );
      if (existing.rows[0]) {
        conv = existing.rows[0];
      }
    }

    if (!conv) {
      const created = await db.query(
        `INSERT INTO webchat_conversations
           (id_user, id_widget_config, session_id, visitor_name, visitor_email, visitor_info)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, widgetConfigId, sessionId || null, visitorName || null,
         visitorEmail || null, JSON.stringify(visitorInfo || {})]
      );
      conv = created.rows[0];
    }
    return conv;
  }

  async getWebChatMessages(conversationId, { limit = 50, beforeId = null } = {}) {
    const beforeFilter = beforeId ? `AND id < $3` : '';
    const params = beforeId ? [conversationId, limit, beforeId] : [conversationId, limit];
    const { rows } = await db.query(
      `SELECT * FROM webchat_messages
       WHERE id_conversation = $1 ${beforeFilter}
       ORDER BY created_at DESC
       LIMIT $2`,
      params
    );
    return rows.reverse();
  }

  async addWebChatMessage(conversationId, userId, { role, content, attachments, metadata }) {
    const { rows } = await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, attachments, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [conversationId, userId, role, content,
       JSON.stringify(attachments || []), JSON.stringify(metadata || {})]
    );

    await db.query(
      `UPDATE webchat_conversations SET last_message_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    return rows[0];
  }

  // ── Channel Conversations & Messages ───────────────────────────

  async getOrCreateChannelConversation({ channelId, userId, externalId, visitorName, visitorInfo }) {
    let conv;
    const existing = await db.query(
      `SELECT * FROM channel_conversations
       WHERE id_channel = $1 AND external_id = $2`,
      [channelId, externalId]
    );
    if (existing.rows[0]) {
      conv = existing.rows[0];
    } else {
      const created = await db.query(
        `INSERT INTO channel_conversations (id_user, id_channel, channel, external_id, visitor_name, visitor_info)
         SELECT $1, $2, ch.channel, $3, $4, $5
         FROM channel_connections ch WHERE ch.id = $2
         RETURNING *`,
        [userId, channelId, externalId, visitorName || null, JSON.stringify(visitorInfo || {})]
      );
      conv = created.rows[0];
    }
    return conv;
  }

  async getChannelMessages(conversationId, { limit = 50 } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM channel_messages
       WHERE id_conversation = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [conversationId, limit]
    );
    return rows;
  }

  async addChannelMessage(conversationId, userId, channelId, { role, content, message_type, external_id, external_ts, attachments, metadata }) {
    const { rows } = await db.query(
      `INSERT INTO channel_messages
         (id_conversation, id_user, id_channel, role, content, message_type, external_id, external_ts, attachments, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [conversationId, userId, channelId, role, content,
       message_type || 'text', external_id || null, external_ts || null,
       JSON.stringify(attachments || []), JSON.stringify(metadata || {})]
    );

    await db.query(
      `UPDATE channel_conversations SET last_message_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    return rows[0];
  }

  // ── Custom Chatbots (Public) ─────────────────────────────────────

  async findChatbotById(chatbotId) {
    const { rows } = await db.query(
      `SELECT id, id_user, name, description, system_instruction, greeting_msg,
              avatar_url, is_active, theme_color, position, welcome_message,
              created_at, updated_at
       FROM custom_chatbots
       WHERE id = $1 AND is_active = true`,
      [chatbotId]
    );
    return rows[0] || null;
  }
}

export default new ChatbotRepository();

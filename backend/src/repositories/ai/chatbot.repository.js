import db from '../../config/database.js';

class ChatbotRepository {
  async assertOwnedSubAssistant(userId, subAssistantId) {
    if (!subAssistantId) return;
    const { rows } = await db.query(
      `SELECT 1 FROM sub_assistants
       WHERE id = $1 AND id_user = $2 AND is_active = true`,
      [subAssistantId, userId]
    );
    if (!rows[0]) {
      const error = new Error('Sub-assistant not found in workspace');
      error.status = 404;
      throw error;
    }
  }

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
    await this.assertOwnedSubAssistant(userId, data.id_sub_assistant);
    const { rows } = await db.query(
      `INSERT INTO chatbot_settings
         (id_user, channel, id_sub_assistant, is_enabled, welcome_message,
          ai_model, temperature, max_tokens, response_style, system_instruction, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id_user, channel) DO UPDATE SET
         id_sub_assistant = EXCLUDED.id_sub_assistant,
         is_enabled = EXCLUDED.is_enabled,
         welcome_message = EXCLUDED.welcome_message,
         ai_model = EXCLUDED.ai_model,
         temperature = EXCLUDED.temperature,
         max_tokens = EXCLUDED.max_tokens,
         response_style = EXCLUDED.response_style,
         system_instruction = EXCLUDED.system_instruction,
         settings = EXCLUDED.settings,
         updated_at = NOW()
       RETURNING *`,
      [userId, channel, data.id_sub_assistant || null,
       data.is_enabled !== undefined ? data.is_enabled : true,
       data.welcome_message || null, data.ai_model || 'gemini-2.5-flash',
       data.temperature || 0.7, data.max_tokens || 2048,
       data.response_style || 'friendly',
       data.system_instruction || null,
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

  async findChannelByWebhookToken(webhookToken) {
    const { rows } = await db.query(
      `SELECT cc.*, u.id AS user_id FROM channel_connections cc
       JOIN users u ON u.id = cc.id_user
       WHERE cc.webhook_token = $1 AND cc.is_active = true`,
      [webhookToken]
    );
    return rows[0] || null;
  }

  async findFirstActiveChannelByType(channel) {
    const { rows } = await db.query(
      `SELECT cc.*, u.id AS user_id FROM channel_connections cc
       JOIN users u ON u.id = cc.id_user
       WHERE cc.channel = $1 AND cc.is_active = true
       LIMIT 1`,
      [channel]
    );
    return rows[0] || null;
  }

  async upsertChannel(userId, channel, { display_name, credentials, webhook_url, webhook_token, settings }) {
    const { rows } = await db.query(
      `INSERT INTO channel_connections (id_user, channel, display_name, credentials, webhook_url, webhook_token, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id_user, channel) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         credentials = EXCLUDED.credentials,
         webhook_url = EXCLUDED.webhook_url,
         webhook_token = COALESCE(EXCLUDED.webhook_token, channel_connections.webhook_token),
         settings = EXCLUDED.settings,
         is_active = true,
         updated_at = NOW()
       RETURNING *`,
      [userId, channel, display_name || null,
       JSON.stringify(credentials || {}), webhook_url || null,
       webhook_token || null,
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

  /**
   * Same lookup as findWidgetByKey but ignores is_active.
   * widget_key is UNIQUE regardless of is_active, so any create-on-miss path MUST use
   * this — otherwise a deactivated row is invisible to the SELECT yet still blocks the
   * INSERT, and the 23505 retry can never find it.
   */
  async findWidgetByKeyAnyStatus(widgetKey) {
    const { rows } = await db.query(
      `SELECT wc.*, sa.name AS sub_assistant_name, sa.greeting_msg, sa.avatar_url
       FROM web_widget_configs wc
       LEFT JOIN sub_assistants sa ON sa.id = wc.id_sub_assistant
       WHERE wc.widget_key = $1`,
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

  async createWidget(userId, { 
    id_sub_assistant, widget_key, display_name, theme_color, position, welcome_message, 
    allowed_domains, settings, logo_url, primary_color, background_color, text_color, 
    accent_color, suggested_questions, border_radius, show_avatar, chat_height 
  }) {
    await this.assertOwnedSubAssistant(userId, id_sub_assistant);
    const { rows } = await db.query(
      `INSERT INTO web_widget_configs
         (id_user, id_sub_assistant, widget_key, display_name, theme_color, position, 
          welcome_message, allowed_domains, settings, logo_url, primary_color, 
          background_color, text_color, accent_color, suggested_questions,
          border_radius, show_avatar, chat_height)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [userId, id_sub_assistant || null, widget_key, display_name || null,
       theme_color || '#3B82F6', position || 'bottom-right',
       welcome_message || null, allowed_domains || null,
       JSON.stringify(settings || {}),
       logo_url || null, primary_color || '#3B82F6', background_color || '#FFFFFF',
       text_color || '#1F2937', accent_color || '#60A5FA',
       suggested_questions || [], border_radius || 16, 
       show_avatar !== false, chat_height || '500px']
    );
    return rows[0];
  }

  /**
   * Resolve the single web_widget_configs row for a custom chatbot.
   * Keys off custom_chatbots.widget_key (fallback chatbot_<id>) — never id_sub_assistant.
   *
   * Reads ignore is_active on purpose. These rows are internal plumbing created by the
   * system, not something the owner manages in the UI; the chatbot's own is_active is
   * what gates public access (findChatbotById filters it). Filtering here would make a
   * deactivated row unreadable but still UNIQUE-blocking, i.e. a permanent 500.
   */
  async resolveWidgetForChatbot(chatbot, { create = true } = {}) {
    if (!chatbot?.id) return null;
    const key = String(chatbot.widget_key || `chatbot_${chatbot.id}`).trim();
    if (!key) return null;

    let widget = await this.findWidgetByKeyAnyStatus(key);
    if (widget) return widget;
    if (!create) return null;

    try {
      return await this.createWidget(chatbot.id_user, {
        widget_key: key,
        display_name: chatbot.name || 'Web Chat',
        theme_color: chatbot.primary_color || '#6366f1',
        primary_color: chatbot.primary_color || '#6366f1',
        welcome_message: chatbot.welcome_message || 'Xin chào! Tôi có thể giúp gì cho bạn?',
      });
    } catch (err) {
      // Concurrent create: UNIQUE(widget_key) → re-read winner
      if (err?.code === '23505') {
        widget = await this.findWidgetByKeyAnyStatus(key);
        if (widget) return widget;
      }
      throw err;
    }
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
         logo_url = COALESCE($10, logo_url),
         primary_color = COALESCE($11, primary_color),
         background_color = COALESCE($12, background_color),
         text_color = COALESCE($13, text_color),
         accent_color = COALESCE($14, accent_color),
         suggested_questions = COALESCE($15, suggested_questions),
         border_radius = COALESCE($16, border_radius),
         show_avatar = COALESCE($17, show_avatar),
         chat_height = COALESCE($18, chat_height),
         updated_at = NOW()
       WHERE id = $1 AND id_user = $2
       RETURNING *`,
      [id, userId, 
       data.display_name, data.theme_color, data.position,
       data.welcome_message, data.is_active, data.allowed_domains,
       data.settings ? JSON.stringify(data.settings) : null,
       data.logo_url, data.primary_color, data.background_color,
       data.text_color, data.accent_color, data.suggested_questions,
       data.border_radius, data.show_avatar, data.chat_height]
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
         ORDER BY created_at ASC LIMIT 1`,
        [widgetConfigId, sessionId]
      );
      if (existing.rows[0]) {
        conv = existing.rows[0];
      }
    }

    if (!conv) {
      try {
        const created = await db.query(
          `INSERT INTO webchat_conversations
             (id_user, id_widget_config, session_id, visitor_name, visitor_email, visitor_info)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [userId, widgetConfigId, sessionId || null, visitorName || null,
           visitorEmail || null, JSON.stringify(visitorInfo || {})]
        );
        conv = created.rows[0];
      } catch (err) {
        // Partial unique index uniq_webchat_active_session (migration 098)
        if (err?.code === '23505' && sessionId) {
          const raced = await db.query(
            `SELECT * FROM webchat_conversations
             WHERE id_widget_config = $1 AND session_id = $2 AND status = 'active'
             ORDER BY created_at ASC LIMIT 1`,
            [widgetConfigId, sessionId]
          );
          if (raced.rows[0]) return raced.rows[0];
        }
        throw err;
      }
    }
    return conv;
  }

  /**
   * If conversation still has no useful visitor_name, set it from the first visitor message snippet.
   */
  async maybeSetWebChatVisitorNameFromMessage(conversationId, message) {
    const snippet = String(message || '').trim().replace(/\s+/g, ' ').slice(0, 48);
    if (!snippet) return;

    await db.query(
      `UPDATE webchat_conversations
       SET visitor_name = $2
       WHERE id = $1
         AND (
           visitor_name IS NULL
           OR trim(visitor_name) = ''
           OR visitor_name ~ '^[Kk]hách'
         )`,
      [conversationId, snippet]
    );
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

  async findWebChatConversationWithOwner(conversationId) {
    const { rows } = await db.query(
      `SELECT wc.*, ww.id_user FROM webchat_conversations wc
       JOIN web_widget_configs ww ON ww.id = wc.id_widget_config
       WHERE wc.id = $1`,
      [conversationId]
    );
    return rows[0] || null;
  }

  async findActiveWebChatConversationId({ widgetConfigId, sessionId }) {
    const { rows } = await db.query(
      `SELECT id FROM webchat_conversations
       WHERE id_widget_config = $1 AND session_id = $2 AND status = 'active'
       ORDER BY created_at ASC LIMIT 1`,
      [widgetConfigId, sessionId]
    );
    return rows[0]?.id || null;
  }

  async getAgentWebChatMessagesAfter({ conversationId, lastMessageId = null }) {
    let query = `SELECT id, role, content, created_at FROM webchat_messages
                 WHERE id_conversation = $1 AND role = 'agent'`;
    const params = [conversationId];

    if (lastMessageId) {
      query += ` AND id > $2`;
      params.push(lastMessageId);
    }

    query += ` ORDER BY created_at ASC`;

    const { rows } = await db.query(query, params);
    return rows;
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

  async deleteWebChatConversation(conversationId, userId) {
    await db.query(
      `DELETE FROM webchat_messages WHERE id_conversation = $1`,
      [conversationId]
    );
    const result = await db.query(
      `DELETE FROM webchat_conversations WHERE id = $1 AND id_user = $2 RETURNING id`,
      [conversationId, userId]
    );
    return result.rowCount > 0;
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

  async addChannelMessage(conversationId, userId, channelId, { role, content, message_type, external_id, external_ts, attachments, metadata, raw_data }) {
    const { rows } = await db.query(
      `INSERT INTO channel_messages
         (id_conversation, id_user, id_channel, role, content, message_type, external_id, external_ts, attachments, metadata, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [conversationId, userId, channelId, role, content,
       message_type || 'text', external_id || null, external_ts || null,
       JSON.stringify(attachments || []), JSON.stringify(metadata || {}), 
       raw_data ? JSON.stringify(raw_data) : null]
    );

    await db.query(
      `UPDATE channel_conversations SET last_message_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    return rows[0];
  }

  // ── Custom Chatbots (Public) ─────────────────────────────────────

  /**
   * List chatbots for user with optional origin filter.
   * @param {number} userId
   * @param {string|null} origin - 'self_created', 'shared', 'marketplace_purchased', or null for all
   */
  async listChatbotsByUser(userId, origin = null) {
    let query = `SELECT id, id_user, name, description, system_instruction, greeting_msg,
              avatar_url, is_active, theme_color, position, welcome_message,
              primary_color, background_color, text_color, accent_color,
              logo_url, show_avatar, border_radius, chat_height,
              suggested_questions, widget_key,
              COALESCE(origin, 'self_created') as origin, reply_limit_config,
              created_at, updated_at
       FROM custom_chatbots
       WHERE id_user = $1 AND is_active = true`;
    const params = [userId];

    if (origin) {
      if (origin === 'self_created') {
        query += ` AND (origin = $2 OR origin IS NULL OR NOT origin IN ('shared', 'marketplace_purchased'))`;
      } else if (origin === 'shared' || origin === 'shared_with_me') {
        query += ` AND origin = 'shared'`;
      } else {
        query += ` AND origin = $2`;
      }
      params.push(origin);
    }

    query += ` ORDER BY created_at DESC`;
    const { rows } = await db.query(query, params);
    return rows;
  }

  async countActiveChatbotsByUser(userId) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM custom_chatbots
       WHERE id_user = $1 AND is_active = true`,
      [userId]
    );
    return rows[0]?.count || 0;
  }

  async findFirstActiveByUser(userId) {
    const { rows } = await db.query(
      `SELECT id, id_user, name, description, system_instruction, greeting_msg,
              avatar_url, is_active, theme_color, position, welcome_message,
              primary_color, background_color, text_color, accent_color,
              logo_url, show_avatar, border_radius, chat_height,
              suggested_questions, widget_key, allow_attachments,
              created_at, updated_at
       FROM custom_chatbots
       WHERE id_user = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }

  async createChatbot(userId, data) {
    const { rows } = await db.query(
      `INSERT INTO custom_chatbots
         (id_user, name, description, system_instruction, greeting_msg, avatar_url,
          theme_color, position, welcome_message, is_active,
          primary_color, background_color, text_color, accent_color,
          logo_url, show_avatar, border_radius, chat_height, suggested_questions, widget_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [userId, data.name || 'New Chatbot', data.description || '',
       data.system_instruction || '', data.greeting_msg || 'Xin chào! Tôi có thể giúp gì cho bạn?',
       data.avatar_url || null, data.theme_color || '#6366F1', data.position || 'bottom-right',
       data.welcome_message || 'Xin chào! Tôi có thể giúp gì cho bạn?', data.is_active !== false,
       data.primary_color || '#6366F1', data.background_color || '#FFFFFF',
       data.text_color || '#1F2937', data.accent_color || '#60A5FA',
       data.logo_url || null, data.show_avatar !== false, data.border_radius || 16,
       data.chat_height || '600px', data.suggested_questions || [],
       data.widget_key || null]
    );
    return rows[0];
  }

  async findChatbotById(chatbotId, userId = null) {
    const { rows } = await db.query(
      `SELECT id, id_user, name, description, system_instruction, greeting_msg,
              avatar_url, is_active, theme_color, position, welcome_message,
              primary_color, background_color, text_color, accent_color,
              logo_url, show_avatar, border_radius, chat_height,
              suggested_questions, widget_key, allow_attachments,
              temperature, max_tokens, ai_model, origin,
              created_at, updated_at
       FROM custom_chatbots
       WHERE id = $1 AND is_active = true
         AND ($2::bigint IS NULL OR id_user = $2::bigint)`,
      [chatbotId, userId ?? null]
    );
    return rows[0] || null;
  }

  async updateChatbot(chatbotId, userId, data) {
    // Handle suggested_questions specially - COALESCE doesn't work well with arrays
    // If data.suggested_questions is undefined, keep the old value
    // If it's an empty array [], set it to empty array
    const suggestedQuestions = data.suggested_questions === undefined
      ? null  // null means "don't update this field"
      : data.suggested_questions;  // empty array or array with values

    // Build query dynamically based on whether suggested_questions is being updated
    let query, params;

    if (suggestedQuestions === null) {
      // Don't update suggested_questions field
      query = `UPDATE custom_chatbots SET
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         system_instruction = COALESCE($5, system_instruction),
         greeting_msg = COALESCE($6, greeting_msg),
         avatar_url = COALESCE($7, avatar_url),
         theme_color = COALESCE($8, theme_color),
         welcome_message = COALESCE($9, welcome_message),
         primary_color = COALESCE($10, primary_color),
         background_color = COALESCE($11, background_color),
         text_color = COALESCE($12, text_color),
         accent_color = COALESCE($13, accent_color),
         logo_url = COALESCE($14, logo_url),
         show_avatar = COALESCE($15, show_avatar),
         position = COALESCE($16, position),
         border_radius = COALESCE($17, border_radius),
         chat_height = COALESCE($18, chat_height),
         widget_key = COALESCE($19, widget_key),
         allow_attachments = COALESCE($20, allow_attachments),
         reply_limit_config = COALESCE($21::jsonb, reply_limit_config),
         temperature = COALESCE($22::numeric, temperature),
         max_tokens = COALESCE($23, max_tokens),
         ai_model = COALESCE($24, ai_model),
         response_style = COALESCE($25, response_style),
         updated_at = NOW()
       WHERE id = $1 AND id_user = $2
       RETURNING *`;
      params = [chatbotId, userId,
       data.name, data.description, data.system_instruction, data.greeting_msg,
       data.avatar_url, data.theme_color, data.welcome_message,
       data.primary_color, data.background_color, data.text_color, data.accent_color,
       data.logo_url, data.show_avatar, data.position, data.border_radius,
       data.chat_height, data.widget_key,
       data.allow_attachments === undefined ? null : Boolean(data.allow_attachments),
       data.reply_limit_config === undefined ? null : JSON.stringify(data.reply_limit_config),
       data.temperature, data.max_tokens, data.ai_model, data.response_style];
    } else {
      // Update suggested_questions field
      query = `UPDATE custom_chatbots SET
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         system_instruction = COALESCE($5, system_instruction),
         greeting_msg = COALESCE($6, greeting_msg),
         avatar_url = COALESCE($7, avatar_url),
         theme_color = COALESCE($8, theme_color),
         welcome_message = COALESCE($9, welcome_message),
         primary_color = COALESCE($10, primary_color),
         background_color = COALESCE($11, background_color),
         text_color = COALESCE($12, text_color),
         accent_color = COALESCE($13, accent_color),
         logo_url = COALESCE($14, logo_url),
         show_avatar = COALESCE($15, show_avatar),
         position = COALESCE($16, position),
         border_radius = COALESCE($17, border_radius),
         chat_height = COALESCE($18, chat_height),
         suggested_questions = $19,
         widget_key = COALESCE($20, widget_key),
         allow_attachments = COALESCE($21, allow_attachments),
         reply_limit_config = COALESCE($22::jsonb, reply_limit_config),
         temperature = COALESCE($23::numeric, temperature),
         max_tokens = COALESCE($24, max_tokens),
         ai_model = COALESCE($25, ai_model),
         response_style = COALESCE($26, response_style),
         updated_at = NOW()
       WHERE id = $1 AND id_user = $2
       RETURNING *`;
      params = [chatbotId, userId,
       data.name, data.description, data.system_instruction, data.greeting_msg,
       data.avatar_url, data.theme_color, data.welcome_message,
       data.primary_color, data.background_color, data.text_color, data.accent_color,
       data.logo_url, data.show_avatar, data.position, data.border_radius,
       data.chat_height, suggestedQuestions, data.widget_key,
       data.allow_attachments === undefined ? null : Boolean(data.allow_attachments),
       data.reply_limit_config === undefined ? null : JSON.stringify(data.reply_limit_config),
       data.temperature, data.max_tokens, data.ai_model, data.response_style];
    }

    const { rows } = await db.query(query, params);
    return rows[0] || null;
  }

  async deleteChatbot(chatbotId, userId) {
    const { rows } = await db.query(
      `UPDATE custom_chatbots SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND id_user = $2
       RETURNING id`,
      [chatbotId, userId]
    );
    return rows[0] || null;
  }

  async disableAllSettingsForUser(userId) {
    await db.query(
      `UPDATE chatbot_settings
       SET is_enabled = false, updated_at = NOW()
       WHERE id_user = $1`,
      [userId]
    );
  }

  async getCustomChatbotDocuments(chatbotId) {
    const { rows } = await db.query(
      `SELECT id, chunk_text, source, chunk_index, created_at
       FROM custom_chatbot_chunks
       WHERE chatbot_id = $1
       ORDER BY chunk_index`,
      [chatbotId]
    );

    const docsMap = {};
    for (const row of rows) {
      const source = row.source || 'Unknown';
      if (!docsMap[source]) {
        docsMap[source] = {
          id: row.id,
          title: source,
          type: 'file',
          status: 'ready',
          chunk_count: 0,
          created_at: row.created_at,
        };
      }
      docsMap[source].chunk_count++;
    }

    return Object.values(docsMap);
  }

  // Find chatbot by widget_key (public access)
  async findChatbotByWidgetKey(widgetKey) {
    const { rows } = await db.query(
      `SELECT id, id_user, name, description, system_instruction, greeting_msg,
              avatar_url, is_active, theme_color, position, welcome_message,
              primary_color, background_color, text_color, accent_color,
              logo_url, show_avatar, border_radius, chat_height,
              suggested_questions, widget_key, allow_attachments,
              created_at, updated_at
       FROM custom_chatbots
       WHERE widget_key = $1 AND is_active = true`,
      [widgetKey]
    );
    return rows[0] || null;
  }

  async getChannelIdFromConversation(conversationId) {
    const { rows } = await db.query(
      `SELECT id_channel FROM channel_conversations WHERE id = $1`,
      [conversationId]
    );
    return rows[0]?.id_channel ?? null;
  }

  async getConversationHistory(conversationId, limit, options = {}) {
    const normalizedOptions = typeof options === 'number'
      ? { beforeMessageId: options }
      : (options || {});
    const {
      beforeMessageId = null,
      throughMessageId = null,
      excludeMessageIds = [],
    } = normalizedOptions;

    const conditions = ['id_conversation = $1'];
    const params = [conversationId];

    if (beforeMessageId) {
      params.push(beforeMessageId);
      conditions.push(`id < $${params.length}`);
    }
    if (throughMessageId) {
      params.push(throughMessageId);
      conditions.push(`id <= $${params.length}`);
    }
    const excludedIds = Array.isArray(excludeMessageIds)
      ? excludeMessageIds.map(Number).filter(Number.isInteger)
      : [];
    if (excludedIds.length > 0) {
      params.push(excludedIds);
      conditions.push(`id <> ALL($${params.length}::integer[])`);
    }

    const { rows } = await db.query(
      `SELECT * FROM chatbot_messages
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit]
    );
    return rows;
  }
}

export default new ChatbotRepository();

import db from '../../config/database.js';

class UnifiedInboxRepository {
  /**
   * Get all conversations across all channels for a user
   * @param {number} userId
   * @param {object} filters - { channel, status, search, limit, offset }
   */
  async getConversations(userId, filters = {}) {
    const { channel, status = 'active', search, limit = 20, offset = 0 } = filters;

    // Build channel filter
    let channelFilter = '';
    const params = [userId, limit, offset];
    let paramIndex = 4;

    if (channel) {
      channelFilter = `AND cc.channel = $${paramIndex}`;
      params.push(channel);
      paramIndex++;
    }

    // Build search filter
    let searchFilter = '';
    if (search) {
      searchFilter = `AND (
        cc.visitor_name ILIKE $${paramIndex} OR
        cw.visitor_name ILIKE $${paramIndex} OR
        cw.visitor_email ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Build status filter - removed because it incorrectly references non-existent 'conv' alias
    // Status is already handled in the individual WHERE clauses below
    const statusFilter = '';

    // Unified query for all conversations
    const query = `
      WITH all_conversations AS (
        -- Channel conversations (Zalo OA, Facebook, Zalo Personal)
        SELECT
          cc.id,
          cc.id_user,
          cc.external_id,
          cc.visitor_name,
          cc.visitor_info,
          cc.started_at,
          cc.last_message_at,
          cc.status,
          'channel' as conversation_type,
          cc.id_channel,
          NULL::BIGINT as id_widget_config,
          ch.channel,
          ch.display_name as channel_display_name,
          ch.is_active as channel_is_active,
          (
            SELECT content FROM channel_messages
            WHERE id_conversation = cc.id
            ORDER BY created_at DESC LIMIT 1
          ) as last_message,
          (
            SELECT COUNT(*) FROM channel_messages
            WHERE id_conversation = cc.id AND role = 'visitor' AND is_read = false
          ) as unread_count,
          (
            SELECT created_at FROM channel_messages
            WHERE id_conversation = cc.id
            ORDER BY created_at DESC LIMIT 1
          ) as last_message_at_override
        FROM channel_conversations cc
        JOIN channel_connections ch ON ch.id = cc.id_channel
        WHERE cc.id_user = $1 ${channelFilter} ${searchFilter}
        ${status ? `AND cc.status = '${status}'` : ''}

        UNION ALL

        -- Web chat conversations
        SELECT
          wc.id,
          wc.id_user,
          wc.session_id as external_id,
          wc.visitor_name,
          wc.visitor_info,
          wc.started_at,
          wc.last_message_at,
          wc.status,
          'webchat' as conversation_type,
          NULL::BIGINT as id_channel,
          wc.id_widget_config,
          'web' as channel,
          ww.display_name as channel_display_name,
          ww.is_active as channel_is_active,
          (
            SELECT content FROM webchat_messages
            WHERE id_conversation = wc.id
            ORDER BY created_at DESC LIMIT 1
          ) as last_message,
          (
            SELECT COUNT(*) FROM webchat_messages
            WHERE id_conversation = wc.id AND role = 'visitor' AND is_read = false
          ) as unread_count,
          (
            SELECT created_at FROM webchat_messages
            WHERE id_conversation = wc.id
            ORDER BY created_at DESC LIMIT 1
          ) as last_message_at_override
        FROM webchat_conversations wc
        JOIN web_widget_configs ww ON ww.id = wc.id_widget_config
        WHERE wc.id_user = $1 ${searchFilter}
        ${status ? `AND wc.status = '${status}'` : ''}
      )
      SELECT * FROM all_conversations
      ORDER BY COALESCE(last_message_at_override, last_message_at) DESC
      LIMIT $2 OFFSET $3
    `;

    const { rows } = await db.query(query, params);
    return rows;
  }

  /**
   * Get total count of conversations
   */
  async getConversationsCount(userId, filters = {}) {
    const { channel, status = 'active', search } = filters;

    let channelFilter = '';
    const params = [userId];
    let paramIndex = 2;

    if (channel) {
      channelFilter = `AND cc.channel = $${paramIndex}`;
      params.push(channel);
      paramIndex++;
    }

    let searchFilter = '';
    if (search) {
      searchFilter = `AND (
        cc.visitor_name ILIKE $${paramIndex} OR
        cw.visitor_name ILIKE $${paramIndex} OR
        cw.visitor_email ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const query = `
      SELECT COUNT(*) as total FROM (
        SELECT cc.id FROM channel_conversations cc
        JOIN channel_connections ch ON ch.id = cc.id_channel
        WHERE cc.id_user = $1 ${channelFilter} ${status ? `AND cc.status = '${status}'` : ''} ${searchFilter}

        UNION ALL

        SELECT wc.id FROM webchat_conversations wc
        WHERE wc.id_user = $1 ${status ? `AND wc.status = '${status}'` : ''} ${searchFilter}
      ) as combined
    `;

    const { rows } = await db.query(query, params);
    return parseInt(rows[0]?.total || 0);
  }

  /**
   * Get single conversation with messages
   */
  async getConversationById(userId, conversationId, conversationType) {
    if (conversationType === 'channel') {
      const { rows } = await db.query(
        `SELECT cc.*, ch.channel, ch.display_name as channel_display_name
         FROM channel_conversations cc
         JOIN channel_connections ch ON ch.id = cc.id_channel
         WHERE cc.id = $1 AND cc.id_user = $2`,
        [conversationId, userId]
      );
      return rows[0] || null;
    } else {
      const { rows } = await db.query(
        `SELECT wc.*, ww.display_name as channel_display_name, 'web' as channel
         FROM webchat_conversations wc
         JOIN web_widget_configs ww ON ww.id = wc.id_widget_config
         WHERE wc.id = $1 AND wc.id_user = $2`,
        [conversationId, userId]
      );
      return rows[0] || null;
    }
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId, conversationType, { limit = 50, beforeId = null } = {}) {
    let beforeFilter = beforeId ? `AND id < $3` : '';
    let params = beforeId ? [conversationId, limit, beforeId] : [conversationId, limit];

    if (conversationType === 'channel') {
      const { rows } = await db.query(
        `SELECT * FROM channel_messages
         WHERE id_conversation = $1 ${beforeFilter}
         ORDER BY created_at DESC
         LIMIT $2`,
        params
      );
      return rows.reverse();
    } else {
      const { rows } = await db.query(
        `SELECT * FROM webchat_messages
         WHERE id_conversation = $1 ${beforeFilter}
         ORDER BY created_at DESC
         LIMIT $2`,
        params
      );
      return rows.reverse();
    }
  }

  /**
   * Mark messages as read
   */
  async markAsRead(conversationId, conversationType) {
    const now = new Date().toISOString();

    if (conversationType === 'channel') {
      await db.query(
        `UPDATE channel_messages SET is_read = true, read_at = $2
         WHERE id_conversation = $1 AND role = 'visitor' AND is_read = false`,
        [conversationId, now]
      );
    } else {
      await db.query(
        `UPDATE webchat_messages SET is_read = true, read_at = $2
         WHERE id_conversation = $1 AND role = 'visitor' AND is_read = false`,
        [conversationId, now]
      );
    }
  }

  /**
   * Get total unread count across all channels
   */
  async getUnreadCount(userId) {
    const { rows } = await db.query(
      `SELECT
        (
          SELECT COUNT(*) FROM channel_messages cm
          JOIN channel_conversations cc ON cc.id = cm.id_conversation
          WHERE cc.id_user = $1 AND cm.role = 'visitor' AND cm.is_read = false
        ) + (
          SELECT COUNT(*) FROM webchat_messages wm
          JOIN webchat_conversations wc ON wc.id = wm.id_conversation
          WHERE wc.id_user = $1 AND wm.role = 'visitor' AND wm.is_read = false
        ) as total_unread`,
      [userId]
    );
    return parseInt(rows[0]?.total_unread || 0);
  }

  /**
   * Get unread count by channel
   */
  async getUnreadCountByChannel(userId) {
    const { rows } = await db.query(
      `SELECT
        'web' as channel, (
          SELECT COUNT(*) FROM webchat_messages wm
          JOIN webchat_conversations wc ON wc.id = wm.id_conversation
          WHERE wc.id_user = $1 AND wm.role = 'visitor' AND wm.is_read = false
        ) as unread
      UNION ALL
      SELECT
        cc.channel, (
          SELECT COUNT(*) FROM channel_messages cm
          JOIN channel_conversations conv ON conv.id = cm.id_conversation
          WHERE conv.id_channel = cc.id AND cm.role = 'visitor' AND cm.is_read = false
        ) as unread
      FROM channel_connections cc
      WHERE cc.id_user = $1 AND cc.is_active = true`,
      [userId]
    );
    return rows;
  }

  /**
   * Send a message from agent/admin
   */
  async sendMessage(conversationId, userId, conversationType, channelId, { role = 'agent', content, attachments = [] }) {
    const now = new Date().toISOString();

    if (conversationType === 'channel') {
      await db.query(
        `INSERT INTO channel_messages (id_conversation, id_user, id_channel, role, content, attachments, is_read, read_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
        [conversationId, userId, channelId, role, content, JSON.stringify(attachments), now]
      );
      await db.query(
        `UPDATE channel_conversations SET last_message_at = $2 WHERE id = $1`,
        [conversationId, now]
      );
    } else {
      await db.query(
        `INSERT INTO webchat_messages (id_conversation, id_user, role, content, attachments, is_read, read_at)
         VALUES ($1, $2, $3, $4, $5, true, $6)`,
        [conversationId, userId, role, content, JSON.stringify(attachments), now]
      );
      await db.query(
        `UPDATE webchat_conversations SET last_message_at = $2 WHERE id = $1`,
        [conversationId, now]
      );
    }
  }

  /**
   * Get all sent messages (outbox) for a user
   * @param {number} userId
   * @param {object} filters - { channel, search, startDate, endDate, limit, offset }
   */
  async getOutboxMessages(userId, filters = {}) {
    const { channel, search, startDate, endDate, limit = 20, offset = 0 } = filters;

    const params = [userId, limit, offset];
    let paramIndex = 4;
    let channelFilter = '';
    let dateFilter = '';
    let searchFilter = '';

    // Channel filter
    if (channel) {
      channelFilter = `AND ch.channel = $${paramIndex}`;
      params.push(channel);
      paramIndex++;
    }

    // Date range filter
    if (startDate) {
      dateFilter += ` AND cm.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      dateFilter += ` AND cm.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    // Search filter
    if (search) {
      searchFilter = `AND (
        cc.visitor_name ILIKE $${paramIndex} OR
        cw.visitor_name ILIKE $${paramIndex} OR
        cm.content ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const query = `
      WITH outbox_messages AS (
        -- Channel messages (Zalo OA, Facebook, Zalo Personal) sent by agent
        SELECT
          cm.id,
          cm.id_user,
          cm.id_conversation,
          cc.visitor_name,
          cc.visitor_info,
          cc.external_id,
          cc.status as conversation_status,
          'channel' as conversation_type,
          ch.channel,
          ch.display_name as channel_display_name,
          cm.content,
          cm.attachments,
          cm.created_at,
          cm.is_read,
          cm.read_at,
          (
            SELECT COUNT(*) FROM channel_messages
            WHERE id_conversation = cc.id AND role = 'visitor' AND is_read = false
          ) as unread_count
        FROM channel_messages cm
        JOIN channel_conversations cc ON cc.id = cm.id_conversation
        JOIN channel_connections ch ON ch.id = cc.id_channel
        WHERE cm.id_user = $1 AND cm.role = 'agent' ${channelFilter} ${dateFilter} ${searchFilter}

        UNION ALL

        -- Web chat messages sent by agent
        SELECT
          wm.id,
          wm.id_user,
          wm.id_conversation,
          wc.visitor_name,
          wc.visitor_info,
          wc.session_id as external_id,
          wc.status as conversation_status,
          'webchat' as conversation_type,
          'web' as channel,
          ww.display_name as channel_display_name,
          wm.content,
          wm.attachments,
          wm.created_at,
          wm.is_read,
          wm.read_at,
          (
            SELECT COUNT(*) FROM webchat_messages
            WHERE id_conversation = wc.id AND role = 'visitor' AND is_read = false
          ) as unread_count
        FROM webchat_messages wm
        JOIN webchat_conversations wc ON wc.id = wm.id_conversation
        JOIN web_widget_configs ww ON ww.id = wc.id_widget_config
        WHERE wm.id_user = $1 AND wm.role = 'agent' ${dateFilter} ${searchFilter}
      )
      SELECT * FROM outbox_messages
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const { rows } = await db.query(query, params);
    return rows;
  }

  /**
   * Get total count of outbox messages
   */
  async getOutboxMessagesCount(userId, filters = {}) {
    const { channel, search, startDate, endDate } = filters;

    const params = [userId];
    let paramIndex = 2;
    let channelFilter = '';
    let dateFilter = '';
    let searchFilter = '';

    if (channel) {
      channelFilter = `AND ch.channel = $${paramIndex}`;
      params.push(channel);
      paramIndex++;
    }

    if (startDate) {
      dateFilter += ` AND cm.created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      dateFilter += ` AND cm.created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (search) {
      searchFilter = `AND (
        cc.visitor_name ILIKE $${paramIndex} OR
        cw.visitor_name ILIKE $${paramIndex} OR
        cm.content ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const query = `
      SELECT COUNT(*) as total FROM (
        SELECT cm.id FROM channel_messages cm
        JOIN channel_conversations cc ON cc.id = cm.id_conversation
        JOIN channel_connections ch ON ch.id = cc.id_channel
        WHERE cm.id_user = $1 AND cm.role = 'agent' ${channelFilter} ${dateFilter} ${searchFilter}

        UNION ALL

        SELECT wm.id FROM webchat_messages wm
        JOIN webchat_conversations wc ON wc.id = wm.id_conversation
        WHERE wm.id_user = $1 AND wm.role = 'agent' ${dateFilter} ${searchFilter}
      ) as outbox
    `;

    const { rows } = await db.query(query, params);
    return parseInt(rows[0]?.total || 0);
  }

  /**
   * Get outbox statistics by channel
   */
  async getOutboxStatsByChannel(userId) {
    const { rows } = await db.query(
      `SELECT
        'web' as channel,
        (
          SELECT COUNT(*) FROM webchat_messages wm
          JOIN webchat_conversations wc ON wc.id = wm.id_conversation
          WHERE wc.id_user = $1 AND wm.role = 'agent'
        ) as total_sent,
        (
          SELECT COUNT(*) FROM webchat_messages wm
          JOIN webchat_conversations wc ON wc.id = wm.id_conversation
          WHERE wc.id_user = $1 AND wm.role = 'agent' AND wm.is_read = true
        ) as total_read
      UNION ALL
      SELECT
        cc.channel,
        (
          SELECT COUNT(*) FROM channel_messages cm
          JOIN channel_conversations conv ON conv.id = cm.id_conversation
          WHERE conv.id_channel = cc.id AND cm.role = 'agent'
        ) as total_sent,
        (
          SELECT COUNT(*) FROM channel_messages cm
          JOIN channel_conversations conv ON conv.id = cm.id_conversation
          WHERE conv.id_channel = cc.id AND cm.role = 'agent' AND cm.is_read = true
        ) as total_read
      FROM channel_connections cc
      WHERE cc.id_user = $1`,
      [userId]
    );
    return rows;
  }

  /**
   * Get a single sent message by ID
   */
  async getOutboxMessageById(userId, messageId) {
    // Try channel_messages first
    let { rows } = await db.query(
      `SELECT cm.*, cc.visitor_name, cc.visitor_info, cc.external_id, cc.status as conversation_status,
              'channel' as conversation_type, ch.channel, ch.display_name as channel_display_name,
              (
                SELECT content FROM channel_messages
                WHERE id_conversation = cc.id AND role = 'visitor'
                ORDER BY created_at DESC LIMIT 1
              ) as last_reply
       FROM channel_messages cm
       JOIN channel_conversations cc ON cc.id = cm.id_conversation
       JOIN channel_connections ch ON ch.id = cc.id_channel
       WHERE cm.id = $1 AND cm.id_user = $2 AND cm.role = 'agent'`,
      [messageId, userId]
    );

    if (rows.length > 0) return rows[0];

    // Try webchat_messages
    ({ rows } = await db.query(
      `SELECT wm.*, wc.visitor_name, wc.visitor_info, wc.session_id as external_id, wc.status as conversation_status,
              'webchat' as conversation_type, 'web' as channel, ww.display_name as channel_display_name,
              (
                SELECT content FROM webchat_messages
                WHERE id_conversation = wc.id AND role = 'visitor'
                ORDER BY created_at DESC LIMIT 1
              ) as last_reply
       FROM webchat_messages wm
       JOIN webchat_conversations wc ON wc.id = wm.id_conversation
       JOIN web_widget_configs ww ON ww.id = wc.id_widget_config
       WHERE wm.id = $1 AND wm.id_user = $2 AND wm.role = 'agent'`,
      [messageId, userId]
    ));

    return rows[0] || null;
  }
}

export default new UnifiedInboxRepository();

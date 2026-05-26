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
}

export default new UnifiedInboxRepository();

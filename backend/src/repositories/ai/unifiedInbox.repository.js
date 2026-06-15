import db from '../../config/database.js';

class UnifiedInboxRepository {
  /**
   * Get all conversations across all channels for a user
   * @param {number} userId
   * @param {object} filters - { channel, status, search, limit, offset, zaloAccountId }
   */
  async getConversations(userId, filters = {}) {
    const { channel, status = 'active', search, limit = 20, offset = 0, zaloAccountId } = filters;

    // Build channel filter
    let channelFilter = '';
    const params = [userId, limit, offset];
    let paramIndex = 4;

    if (channel) {
      channelFilter = `AND cc.channel = $${paramIndex}`;
      params.push(channel);
      paramIndex++;
    }

    // Build zaloAccountId filter (for zalo_personal channel filtering by specific account)
    let zaloAccountIdFilter = '';
    if (zaloAccountId) {
      zaloAccountIdFilter = `AND zp.id_zalo_setting = $${paramIndex}`;
      params.push(parseInt(zaloAccountId));
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
        -- Channel conversations (Zalo OA, Facebook)
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
          NULL::BIGINT as id_zalo_setting,
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

        -- Zalo Personal conversations
        SELECT
          zp.id,
          zp.id_user,
          zp.external_id,
          zp.visitor_name,
          zp.visitor_info,
          zp.started_at,
          zp.last_message_at,
          zp.status,
          'zalo_personal' as conversation_type,
          NULL::BIGINT as id_channel,
          NULL::BIGINT as id_widget_config,
          zp.id_zalo_setting,
          'zalo_personal' as channel,
          COALESCE(zs.display_name, 'Zalo Cá nhân') as channel_display_name,
          CASE WHEN zs.status = 'connected' THEN true ELSE false END as channel_is_active,
          (
            SELECT content FROM zalo_personal_messages
            WHERE id_conversation = zp.id
            ORDER BY created_at DESC LIMIT 1
          ) as last_message,
          (
            SELECT COUNT(*) FROM zalo_personal_messages
            WHERE id_conversation = zp.id AND role = 'visitor' AND is_read = false
          ) as unread_count,
          (
            SELECT created_at FROM zalo_personal_messages
            WHERE id_conversation = zp.id
            ORDER BY created_at DESC LIMIT 1
          ) as last_message_at_override
        FROM zalo_personal_conversations zp
        LEFT JOIN zalo_settings zs ON zs.id = zp.id_zalo_setting
        WHERE zp.id_user = $1 ${zaloAccountIdFilter} ${searchFilter}
        ${status ? `AND zp.status = '${status}'` : ''}

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
          NULL::BIGINT as id_zalo_setting,
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

    // Transform snake_case to camelCase for frontend compatibility
    return rows.map(row => {
      // Parse visitor_info to extract is_group flag
      const visitorInfo = typeof row.visitor_info === 'string' 
        ? JSON.parse(row.visitor_info) 
        : (row.visitor_info || {});
      
      // Determine display name - for groups, show group name prominently
      let displayName = row.visitor_name;
      const isGroup = visitorInfo.is_group === true;

      // For webchat: show "Chatbot Name - ID" instead of visitor_name
      if (row.conversation_type === 'webchat') {
        displayName = `${row.channel_display_name} - ${row.id}`;
      }
      
      // Transform snake_case to camelCase for frontend compatibility
      return {
        id: row.id,
        type: row.conversation_type,
        channel: row.channel,
        channelDisplayName: row.channel_display_name,
        channelIsActive: row.channel_is_active,
        idChannel: row.id_channel,
        idZaloSetting: row.id_zalo_setting,
        idWidgetConfig: row.id_widget_config,
        visitorName: displayName,
        visitorInfo: visitorInfo,
        isGroup: isGroup,
        groupId: isGroup ? visitorInfo.group_id : null,
        groupName: isGroup ? visitorInfo.group_name : null,
        externalId: row.external_id,
        status: row.status,
        startedAt: row.started_at,
        lastMessageAt: row.last_message_at_override || row.last_message_at,
        lastMessage: row.last_message,
        unreadCount: parseInt(row.unread_count || 0),
      };
    });
  }

  /**
   * Get total count of conversations
   */
  async getConversationsCount(userId, filters = {}) {
    const { channel, status = 'active', search, zaloAccountId } = filters;

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

    let zaloAccountIdFilter = '';
    if (zaloAccountId) {
      zaloAccountIdFilter = `AND zp.id_zalo_setting = $${paramIndex}`;
      params.push(parseInt(zaloAccountId));
      paramIndex++;
    }

    const query = `
      SELECT COUNT(*) as total FROM (
        SELECT cc.id FROM channel_conversations cc
        JOIN channel_connections ch ON ch.id = cc.id_channel
        WHERE cc.id_user = $1 ${channelFilter} ${status ? `AND cc.status = '${status}'` : ''} ${searchFilter}

        UNION ALL

        SELECT zp.id FROM zalo_personal_conversations zp
        WHERE zp.id_user = $1 ${zaloAccountIdFilter} ${status ? `AND zp.status = '${status}'` : ''} ${searchFilter}

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
    } else if (conversationType === 'zalo_personal') {
      const { rows } = await db.query(
        `SELECT zp.*, 'zalo_personal' as channel, COALESCE(zs.display_name, 'Zalo Cá nhân') as channel_display_name
         FROM zalo_personal_conversations zp
         LEFT JOIN zalo_settings zs ON zs.id = zp.id_zalo_setting
         WHERE zp.id = $1 AND zp.id_user = $2`,
        [conversationId, userId]
      );
      if (rows[0]) {
        // Parse visitor_info to extract is_group
        const visitorInfo = typeof rows[0].visitor_info === 'string'
          ? JSON.parse(rows[0].visitor_info)
          : (rows[0].visitor_info || {});
        rows[0]._parsedVisitorInfo = visitorInfo;
        rows[0]._isGroup = visitorInfo.is_group === true;
      }
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

    // Helper to convert snake_case DB columns to camelCase for frontend
    const transformRow = (row) => ({
      id: row.id,
      conversationId: row.id_conversation,
      userId: row.id_user,
      zaloSettingId: row.id_zalo_setting,
      role: row.role,
      content: row.content,
      attachments: row.attachments ? (typeof row.attachments === 'string' ? JSON.parse(row.attachments) : row.attachments) : null,
      isRead: row.is_read,
      readAt: row.read_at,
      createdAt: row.created_at,
      messageType: row.message_type,
      externalId: row.external_id,
      externalTs: row.external_ts,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    });

    if (conversationType === 'channel') {
      const { rows } = await db.query(
        `SELECT * FROM channel_messages
         WHERE id_conversation = $1 ${beforeFilter}
         ORDER BY created_at DESC
         LIMIT $2`,
        params
      );
      console.log(`[UnifiedInbox] getMessages channel: conv=${conversationId}, found=${rows.length}`);
      return rows.reverse().map(transformRow);
    } else if (conversationType === 'zalo_personal') {
      const { rows } = await db.query(
        `SELECT * FROM zalo_personal_messages
         WHERE id_conversation = $1 ${beforeFilter}
         ORDER BY created_at DESC
         LIMIT $2`,
        params
      );
      console.log(`[UnifiedInbox] getMessages zalo_personal: conv=${conversationId}, found=${rows.length}`);
      return rows.reverse().map(transformRow);
    } else {
      const { rows } = await db.query(
        `SELECT * FROM webchat_messages
         WHERE id_conversation = $1 ${beforeFilter}
         ORDER BY created_at DESC
         LIMIT $2`,
        params
      );
      return rows.reverse().map(transformRow);
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
    } else if (conversationType === 'zalo_personal') {
      await db.query(
        `UPDATE zalo_personal_messages SET is_read = true, read_at = $2
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
          SELECT COUNT(*) FROM zalo_personal_messages zpm
          JOIN zalo_personal_conversations zpc ON zpc.id = zpm.id_conversation
          WHERE zpc.id_user = $1 AND zpm.role = 'visitor' AND zpm.is_read = false
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
        'zalo_personal' as channel, (
          SELECT COUNT(*) FROM zalo_personal_messages zpm
          JOIN zalo_personal_conversations zpc ON zpc.id = zpm.id_conversation
          WHERE zpc.id_user = $1 AND zpm.role = 'visitor' AND zpm.is_read = false
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
    } else if (conversationType === 'zalo_personal') {
      // Get zalo_setting_id from conversation
      const { rows } = await db.query(
        `SELECT id_zalo_setting FROM zalo_personal_conversations WHERE id = $1`,
        [conversationId]
      );
      const zaloSettingId = rows[0]?.id_zalo_setting;
      
      await db.query(
        `INSERT INTO zalo_personal_messages (id_conversation, id_user, id_zalo_setting, role, content, attachments, is_read, read_at)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
        [conversationId, userId, zaloSettingId, role, content, JSON.stringify(attachments), now]
      );
      await db.query(
        `UPDATE zalo_personal_conversations SET last_message_at = $2 WHERE id = $1`,
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
        zp.visitor_name ILIKE $${paramIndex} OR
        cm.content ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const query = `
      WITH outbox_messages AS (
        -- Channel messages (Zalo OA, Facebook) sent by agent
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

        -- Zalo Personal messages sent by agent
        SELECT
          zpm.id,
          zpm.id_user,
          zpm.id_conversation,
          zpc.visitor_name,
          zpc.visitor_info,
          zpc.external_id,
          zpc.status as conversation_status,
          'zalo_personal' as conversation_type,
          'zalo_personal' as channel,
          COALESCE(zs.display_name, 'Zalo Cá nhân') as channel_display_name,
          zpm.content,
          zpm.attachments,
          zpm.created_at,
          zpm.is_read,
          zpm.read_at,
          (
            SELECT COUNT(*) FROM zalo_personal_messages
            WHERE id_conversation = zpc.id AND role = 'visitor' AND is_read = false
          ) as unread_count
        FROM zalo_personal_messages zpm
        JOIN zalo_personal_conversations zpc ON zpc.id = zpm.id_conversation
        LEFT JOIN zalo_settings zs ON zs.id = zpc.id_zalo_setting
        WHERE zpm.id_user = $1 AND zpm.role = 'agent' ${dateFilter} ${searchFilter}
        ${channel === 'zalo_personal' ? channelFilter : ''}

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
        zp.visitor_name ILIKE $${paramIndex} OR
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

        SELECT zpm.id FROM zalo_personal_messages zpm
        JOIN zalo_personal_conversations zpc ON zpc.id = zpm.id_conversation
        WHERE zpm.id_user = $1 AND zpm.role = 'agent' ${dateFilter} ${searchFilter}
        ${channel === 'zalo_personal' ? channelFilter : ''}

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
        'zalo_personal' as channel,
        (
          SELECT COUNT(*) FROM zalo_personal_messages zpm
          JOIN zalo_personal_conversations zpc ON zpc.id = zpm.id_conversation
          WHERE zpc.id_user = $1 AND zpm.role = 'agent'
        ) as total_sent,
        (
          SELECT COUNT(*) FROM zalo_personal_messages zpm
          JOIN zalo_personal_conversations zpc ON zpc.id = zpm.id_conversation
          WHERE zpc.id_user = $1 AND zpm.role = 'agent' AND zpm.is_read = true
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

    // Try zalo_personal_messages
    ({ rows } = await db.query(
      `SELECT zpm.*, zpc.visitor_name, zpc.visitor_info, zpc.external_id, zpc.status as conversation_status,
              'zalo_personal' as conversation_type, 'zalo_personal' as channel, 
              COALESCE(zs.display_name, 'Zalo Cá nhân') as channel_display_name,
              (
                SELECT content FROM zalo_personal_messages
                WHERE id_conversation = zpc.id AND role = 'visitor'
                ORDER BY created_at DESC LIMIT 1
              ) as last_reply
       FROM zalo_personal_messages zpm
       JOIN zalo_personal_conversations zpc ON zpc.id = zpm.id_conversation
       LEFT JOIN zalo_settings zs ON zs.id = zpc.id_zalo_setting
       WHERE zpm.id = $1 AND zpm.id_user = $2 AND zpm.role = 'agent'`,
      [messageId, userId]
    ));

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

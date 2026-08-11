import db from '../../config/database.js';
import { isPlaceholderGroupName } from '../../utils/zaloGroupName.util.js';
import { formatWebchatDisplayName } from '../../utils/webchatDisplayName.util.js';

const VALID_STATUSES = new Set(['active', 'closed']);
const VALID_DATE_RANGES = new Set(['today', 'week', 'month']);

function normalizeConversationStatus(status) {
  if (!status || status === 'all') return null;
  return VALID_STATUSES.has(status) ? status : null;
}

function dateRangeStart(date) {
  const now = new Date();
  if (date === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (date === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (date === 'month') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return null;
}

/** @returns {{ statusSql: string, dateSql: string, nextIndex: number }} */
function buildStatusDateFilters({ status, date, params, startIndex }) {
  let idx = startIndex;
  let statusSql = '';
  let dateSql = '';

  const normalizedStatus = normalizeConversationStatus(status);
  if (normalizedStatus) {
    statusSql = `AND __TABLE__.status = $${idx}`;
    params.push(normalizedStatus);
    idx += 1;
  }

  if (date && VALID_DATE_RANGES.has(date)) {
    const since = dateRangeStart(date);
    if (since) {
      dateSql = `AND COALESCE(__TABLE__.last_message_at, __TABLE__.started_at) >= $${idx}`;
      params.push(since);
      idx += 1;
    }
  }

  return { statusSql, dateSql, nextIndex: idx };
}

function withTableAlias(sql, tableAlias) {
  return sql.replaceAll('__TABLE__', tableAlias);
}

/** @returns {{ sql: string, nextIndex: number, params: string[] }} */
function buildSearchFilter(search, startIndex) {
  if (!search) {
    return { sql: '', nextIndex: startIndex, params: [] };
  }

  const sql = `AND (
        __TABLE__.visitor_name ILIKE $${startIndex} OR
        __TABLE__.visitor_info::text ILIKE $${startIndex}
      )`;

  return {
    sql,
    nextIndex: startIndex + 1,
    params: [`%${search}%`],
  };
}

function withOutboxAliases(sql, convAlias, msgAlias) {
  return sql.replaceAll('__CONV__', convAlias).replaceAll('__MSG__', msgAlias);
}

/** @returns {{ sql: string, nextIndex: number, params: string[] }} */
function buildOutboxSearchFilter(search, startIndex) {
  if (!search) {
    return { sql: '', nextIndex: startIndex, params: [] };
  }

  const sql = `AND (
        __CONV__.visitor_name ILIKE $${startIndex} OR
        __CONV__.visitor_info::text ILIKE $${startIndex} OR
        __MSG__.content ILIKE $${startIndex}
      )`;

  return {
    sql,
    nextIndex: startIndex + 1,
    params: [`%${search}%`],
  };
}

/** @returns {{ sql: string, channelDate: string, zaloDate: string, webDate: string, nextIndex: number }} */
function buildOutboxDateFilter({ startDate, endDate, params, startIndex }) {
  let idx = startIndex;
  let sql = '';

  if (startDate) {
    sql += ` AND __MSG__.created_at >= $${idx}`;
    params.push(startDate);
    idx += 1;
  }
  if (endDate) {
    sql += ` AND __MSG__.created_at <= $${idx}`;
    params.push(endDate);
    idx += 1;
  }

  return {
    sql,
    channelDate: sql.replaceAll('__MSG__', 'cm'),
    zaloDate: sql.replaceAll('__MSG__', 'zpm'),
    webDate: sql.replaceAll('__MSG__', 'wm'),
    nextIndex: idx,
  };
}

function buildOutboxChannelGates(channel) {
  return {
    zaloChannelGate: (channel && channel !== 'zalo_personal') ? 'AND 1=0' : '',
    webChannelGate: (channel && channel !== 'web') ? 'AND 1=0' : '',
  };
}

const CHANNEL_CONNECTION_TYPES = new Set(['zalo_oa', 'facebook']);

/** Gate UNION branches when filtering inbox conversations by channel. */
function buildConversationChannelGates(channel) {
  if (!channel) {
    return { channelGate: '', zaloGate: '', webGate: '' };
  }
  if (channel === 'zalo_personal') {
    return { channelGate: 'AND 1=0', zaloGate: '', webGate: 'AND 1=0' };
  }
  if (channel === 'web') {
    return { channelGate: 'AND 1=0', zaloGate: 'AND 1=0', webGate: '' };
  }
  if (CHANNEL_CONNECTION_TYPES.has(channel)) {
    return { channelGate: '', zaloGate: 'AND 1=0', webGate: 'AND 1=0' };
  }
  return { channelGate: 'AND 1=0', zaloGate: 'AND 1=0', webGate: 'AND 1=0' };
}

class UnifiedInboxRepository {
  /**
   * Get all conversations across all channels for a user
   * @param {number} userId
   * @param {object} filters - { channel, status, search, limit, offset, zaloAccountId }
   */
  async getConversations(userId, filters = {}) {
    const { channel, status, date, search, limit = 20, offset = 0, zaloAccountId } = filters;

    // Build channel filter (Zalo OA / Facebook live in channel_connections branch only)
    let channelFilter = '';
    const params = [userId, limit, offset];
    let paramIndex = 4;

    if (channel && CHANNEL_CONNECTION_TYPES.has(channel)) {
      channelFilter = `AND ch.channel = $${paramIndex}`;
      params.push(channel);
      paramIndex++;
    }

    const { channelGate, zaloGate, webGate } = buildConversationChannelGates(channel);

    // Build zaloAccountId filter (for zalo_personal channel filtering by specific account)
    let zaloAccountIdFilter = '';
    if (zaloAccountId) {
      zaloAccountIdFilter = `AND zp.id_zalo_setting = $${paramIndex}`;
      params.push(parseInt(zaloAccountId, 10));
      paramIndex++;
    }

    // Build search filter
    const searchBuilt = buildSearchFilter(search, paramIndex);
    if (searchBuilt.params.length) {
      params.push(...searchBuilt.params);
      paramIndex = searchBuilt.nextIndex;
    }
    const ccSearch = withTableAlias(searchBuilt.sql, 'cc');
    const zpSearch = withTableAlias(searchBuilt.sql, 'zp');
    const wcSearch = withTableAlias(searchBuilt.sql, 'wc');

    const sharedFilters = buildStatusDateFilters({ status, date, params, startIndex: paramIndex });
    paramIndex = sharedFilters.nextIndex;
    const ccStatusDate = withTableAlias(`${sharedFilters.statusSql} ${sharedFilters.dateSql}`, 'cc');
    const zpStatusDate = withTableAlias(`${sharedFilters.statusSql} ${sharedFilters.dateSql}`, 'zp');
    const wcStatusDate = withTableAlias(`${sharedFilters.statusSql} ${sharedFilters.dateSql}`, 'wc');

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
          NULL::TEXT as group_name_override,
          (
            SELECT CASE
              WHEN NULLIF(TRIM(content), '') IS NOT NULL THEN content
              WHEN jsonb_array_length(COALESCE(attachments, '[]'::jsonb)) > 0 THEN
                CASE
                  WHEN attachments->0->>'type' IN ('image', 'photo') THEN 'Hình ảnh'
                  WHEN attachments->0->>'type' = 'sticker' THEN 'Sticker'
                  ELSE 'Tệp đính kèm'
                END
              ELSE content
            END
            FROM channel_messages
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
          ) as last_message_at_override,
          COALESCE(cc.ai_paused, false) as ai_paused,
          cc.ai_paused_at as ai_paused_at,
          NULL::TEXT as first_visitor_message
        FROM channel_conversations cc
        JOIN channel_connections ch ON ch.id = cc.id_channel
        WHERE cc.id_user = $1 ${channelFilter} ${channelGate} ${ccSearch}
        ${ccStatusDate}

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
          COALESCE(
            zg.group_name,
            NULLIF(zp.visitor_info::jsonb->>'group_name', ''),
            NULLIF(zp.visitor_info::jsonb->>'groupName', ''),
            (
              SELECT COALESCE(
                NULLIF(metadata::jsonb->>'group_name', ''),
                NULLIF(metadata::jsonb->>'groupName', ''),
                NULLIF(metadata::jsonb#>>'{_raw,group_name}', ''),
                NULLIF(metadata::jsonb#>>'{_raw,groupName}', ''),
                NULLIF(metadata::jsonb#>>'{_raw,gridName}', '')
              )
              FROM zalo_personal_messages
              WHERE id_conversation = zp.id
              ORDER BY created_at DESC
              LIMIT 1
            )
          ) as group_name_override,
          (
            SELECT CASE
              WHEN NULLIF(TRIM(content), '') IS NOT NULL THEN content
              WHEN jsonb_array_length(COALESCE(attachments, '[]'::jsonb)) > 0 THEN
                CASE
                  WHEN attachments->0->>'type' IN ('image', 'photo') THEN 'Hình ảnh'
                  WHEN attachments->0->>'type' = 'sticker' THEN 'Sticker'
                  ELSE 'Tệp đính kèm'
                END
              ELSE content
            END
            FROM zalo_personal_messages
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
          ) as last_message_at_override,
          COALESCE(zp.ai_paused, false) as ai_paused,
          zp.ai_paused_at as ai_paused_at,
          NULL::TEXT as first_visitor_message
        FROM zalo_personal_conversations zp
        LEFT JOIN zalo_settings zs ON zs.id = zp.id_zalo_setting
        LEFT JOIN LATERAL (
          SELECT group_name
          FROM zalo_groups
          WHERE id_zalo_setting = zp.id_zalo_setting
            AND group_name IS NOT NULL
            AND group_name <> ''
            AND (
              group_id = NULLIF(zp.visitor_info::jsonb->>'group_id', '')
              OR group_id = NULLIF(zp.visitor_info::jsonb->>'groupId', '')
              OR group_id = NULLIF(zp.external_id, '')
              OR group_id = NULLIF(regexp_replace(COALESCE(zp.visitor_info::jsonb->>'group_id', zp.external_id), '^group_', ''), '')
              OR CONCAT('group_', group_id) = NULLIF(zp.external_id, '')
            )
          ORDER BY updated_at DESC NULLS LAST, id DESC
          LIMIT 1
        ) zg ON true
        WHERE zp.id_user = $1 ${zaloAccountIdFilter} ${zpSearch}
        ${zpStatusDate} ${zaloGate}

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
          NULL::TEXT as group_name_override,
          (
            SELECT CASE
              WHEN NULLIF(TRIM(content), '') IS NOT NULL THEN content
              WHEN jsonb_array_length(COALESCE(attachments, '[]'::jsonb)) > 0 THEN
                CASE
                  WHEN attachments->0->>'type' IN ('image', 'photo') THEN 'Hình ảnh'
                  WHEN attachments->0->>'type' = 'sticker' THEN 'Sticker'
                  ELSE 'Tệp đính kèm'
                END
              ELSE content
            END
            FROM webchat_messages
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
          ) as last_message_at_override,
          COALESCE(wc.ai_paused, false) as ai_paused,
          wc.ai_paused_at as ai_paused_at,
          (
            SELECT content FROM webchat_messages
            WHERE id_conversation = wc.id AND role = 'visitor'
            ORDER BY created_at ASC LIMIT 1
          ) as first_visitor_message
        FROM webchat_conversations wc
        JOIN web_widget_configs ww ON ww.id = wc.id_widget_config
        WHERE wc.id_user = $1 ${wcSearch}
        ${wcStatusDate} ${webGate}
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
      const groupNameOverride = row.group_name_override
        && !isPlaceholderGroupName(row.group_name_override, visitorInfo.group_id || row.external_id)
        ? row.group_name_override
        : null;

      // For webchat: prefer visitor name / first message over "{widget} - {id}"
      if (row.conversation_type === 'webchat') {
        displayName = formatWebchatDisplayName({
          visitorName: row.visitor_name,
          channelDisplayName: row.channel_display_name,
          conversationId: row.id,
          firstMessageSnippet: row.first_visitor_message || null,
        });
      } else if (isGroup && groupNameOverride) {
        displayName = groupNameOverride;
        visitorInfo.group_name = visitorInfo.group_name || groupNameOverride;
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
        groupName: isGroup ? (visitorInfo.group_name || groupNameOverride) : null,
        externalId: row.external_id,
        status: row.status,
        startedAt: row.started_at,
        lastMessageAt: row.last_message_at_override || row.last_message_at,
        lastMessage: row.last_message,
        unreadCount: parseInt(row.unread_count || 0),
        aiPaused: row.ai_paused === true,
        aiPausedAt: row.ai_paused_at
          ? new Date(row.ai_paused_at).toISOString()
          : null,
      };
    });
  }

  /**
   * Get total count of conversations
   */
  async getConversationsCount(userId, filters = {}) {
    const { channel, status, date, search, zaloAccountId } = filters;

    let channelFilter = '';
    const params = [userId];
    let paramIndex = 2;

    if (channel && CHANNEL_CONNECTION_TYPES.has(channel)) {
      channelFilter = `AND ch.channel = $${paramIndex}`;
      params.push(channel);
      paramIndex++;
    }

    const { channelGate, zaloGate, webGate } = buildConversationChannelGates(channel);

    const searchBuilt = buildSearchFilter(search, paramIndex);
    if (searchBuilt.params.length) {
      params.push(...searchBuilt.params);
      paramIndex = searchBuilt.nextIndex;
    }
    const ccSearch = withTableAlias(searchBuilt.sql, 'cc');
    const zpSearch = withTableAlias(searchBuilt.sql, 'zp');
    const wcSearch = withTableAlias(searchBuilt.sql, 'wc');

    let zaloAccountIdFilter = '';
    if (zaloAccountId) {
      zaloAccountIdFilter = `AND zp.id_zalo_setting = $${paramIndex}`;
      params.push(parseInt(zaloAccountId, 10));
      paramIndex++;
    }

    const sharedFilters = buildStatusDateFilters({ status, date, params, startIndex: paramIndex });
    const ccStatusDate = withTableAlias(`${sharedFilters.statusSql} ${sharedFilters.dateSql}`, 'cc');
    const zpStatusDate = withTableAlias(`${sharedFilters.statusSql} ${sharedFilters.dateSql}`, 'zp');
    const wcStatusDate = withTableAlias(`${sharedFilters.statusSql} ${sharedFilters.dateSql}`, 'wc');

    const query = `
      SELECT COUNT(*) as total FROM (
        SELECT cc.id FROM channel_conversations cc
        JOIN channel_connections ch ON ch.id = cc.id_channel
        WHERE cc.id_user = $1 ${channelFilter} ${channelGate} ${ccStatusDate} ${ccSearch}

        UNION ALL

        SELECT zp.id FROM zalo_personal_conversations zp
        WHERE zp.id_user = $1 ${zaloAccountIdFilter} ${zpStatusDate} ${zpSearch} ${zaloGate}

        UNION ALL

        SELECT wc.id FROM webchat_conversations wc
        WHERE wc.id_user = $1 ${wcStatusDate} ${wcSearch} ${webGate}
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
        // Parse visitor_info to extract is_group (not table columns — migration 045)
        const visitorInfo = typeof rows[0].visitor_info === 'string'
          ? (() => { try { return JSON.parse(rows[0].visitor_info); } catch { return {}; } })()
          : (rows[0].visitor_info || {});
        rows[0]._parsedVisitorInfo = visitorInfo;
        rows[0]._isGroup = visitorInfo.is_group === true;
        rows[0].is_group = visitorInfo.is_group === true;
        rows[0].group_id = visitorInfo.group_id || null;
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
   * @returns {Promise<number|null>} zalo_personal message id when applicable; otherwise null
   */
  async sendMessage(conversationId, userId, conversationType, channelId, { role = 'agent', content, attachments = [], metadata = {} } = {}) {
    const now = new Date().toISOString();
    const metadataJson = JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {});

    if (conversationType === 'channel') {
      const { rows } = await db.query(
        `INSERT INTO channel_messages (id_conversation, id_user, id_channel, role, content, attachments, metadata, is_read, read_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true, $8)
         RETURNING id`,
        [conversationId, userId, channelId, role, content, JSON.stringify(attachments), metadataJson, now]
      );
      await db.query(
        `UPDATE channel_conversations SET last_message_at = $2 WHERE id = $1`,
        [conversationId, now]
      );
      return rows[0]?.id ?? null;
    }

    if (conversationType === 'zalo_personal') {
      return this.insertZaloPersonalAgentMessage(db, conversationId, userId, {
        role, content, attachments, metadataJson, now,
      });
    }

    await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content, attachments, metadata, is_read, read_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, true, $7)`,
      [conversationId, userId, role, content, JSON.stringify(attachments), metadataJson, now]
    );
    await db.query(
      `UPDATE webchat_conversations SET last_message_at = $2 WHERE id = $1`,
      [conversationId, now]
    );
    return null;
  }

  /**
   * @param {import('pg').Pool|import('pg').PoolClient} queryable
   * @returns {Promise<number|null>}
   */
  async insertZaloPersonalAgentMessage(queryable, conversationId, userId, {
    role = 'agent',
    content,
    attachments = [],
    metadata = {},
    metadataJson = null,
    now = null,
  } = {}) {
    const ts = now || new Date().toISOString();
    const meta = metadataJson ?? JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {});
    const { rows: settingRows } = await queryable.query(
      `SELECT id_zalo_setting FROM zalo_personal_conversations WHERE id = $1`,
      [conversationId]
    );
    const zaloSettingId = settingRows[0]?.id_zalo_setting;
    const { rows: inserted } = await queryable.query(
      `INSERT INTO zalo_personal_messages (id_conversation, id_user, id_zalo_setting, role, content, attachments, metadata, is_read, read_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true, $8)
       RETURNING id`,
      [conversationId, userId, zaloSettingId, role, content, JSON.stringify(attachments), meta, ts]
    );
    await queryable.query(
      `UPDATE zalo_personal_conversations SET last_message_at = $2 WHERE id = $1`,
      [conversationId, ts]
    );
    return inserted[0]?.id ?? null;
  }

  /**
   * After inbox-send via Zalo: bind durable echo keys on the pre-inserted agent row.
   * external_id = primary msgId (ON CONFLICT dedupe); metadata.zalo_msg_ids = all dispatches.
   * @param {number|string} messageId
   * @param {{ externalId?: string|null, msgIds?: Array<string|number|null|undefined> }} opts
   */
  async bindZaloPersonalOutboundMsgIds(messageId, { externalId = null, msgIds = [] } = {}) {
    const id = Number(messageId);
    if (!Number.isFinite(id) || id <= 0) return;
    const ids = [...new Set(
      (Array.isArray(msgIds) ? msgIds : [])
        .map((v) => (v == null || v === '' ? null : String(v)))
        .filter(Boolean)
    )];
    const primary = externalId != null && externalId !== ''
      ? String(externalId)
      : (ids[0] || null);
    if (!primary && ids.length === 0) return;

    await db.query(
      `UPDATE zalo_personal_messages
       SET external_id = COALESCE($2, external_id),
           metadata = COALESCE(metadata, '{}'::jsonb)
             || jsonb_build_object('zalo_msg_ids', $3::jsonb)
       WHERE id = $1`,
      [id, primary, JSON.stringify(ids.length > 0 ? ids : (primary ? [primary] : []))]
    );
  }

  async withTransaction(callback) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Pause / resume AI for one conversation.
   * reason='manual' → ai_paused_at NULL (stay paused until toggle on).
   * reason='handoff' → set ai_paused_at=NOW(), but do NOT overwrite an existing manual pause.
   * @returns {{ aiPaused: boolean, aiPausedAt: string|null }}
   */
  async setAiPaused(conversationId, conversationType, paused, reason = 'handoff') {
    const table =
      conversationType === 'zalo_personal' ? 'zalo_personal_conversations'
        : conversationType === 'webchat' ? 'webchat_conversations'
          : 'channel_conversations';
    const isPaused = !!paused;
    const pauseReason = isPaused && reason === 'manual' ? 'manual' : 'handoff';
    const { rows } = await db.query(
      `UPDATE ${table}
       SET ai_paused = $2,
           ai_paused_at = CASE
             WHEN $2 = false THEN NULL
             WHEN $3 = 'manual' THEN NULL
             WHEN ai_paused = true AND ai_paused_at IS NULL THEN NULL
             ELSE NOW()
           END
       WHERE id = $1
       RETURNING ai_paused, ai_paused_at`,
      [conversationId, isPaused, pauseReason]
    );
    const row = rows[0];
    return {
      aiPaused: row?.ai_paused === true,
      aiPausedAt: row?.ai_paused_at
        ? new Date(row.ai_paused_at).toISOString()
        : null,
    };
  }

  /**
   * Whether AI auto-reply is paused for this conversation (owner handoff).
   * Lazy auto-resume when owner setting ai_handoff_auto_resume_minutes has elapsed
   * since ai_paused_at (see aiHandoffResume.util.js).
   */
  async isAiPaused(conversationId, conversationType) {
    if (!conversationId) return false;
    const table =
      conversationType === 'zalo_personal' ? 'zalo_personal_conversations'
        : conversationType === 'webchat' ? 'webchat_conversations'
          : 'channel_conversations';

    try {
      const { shouldStayAiPaused, getCachedAutoResumeMinutes } = await import(
        '../../utils/aiHandoffResume.util.js'
      );
      const { rows } = await db.query(
        `SELECT ai_paused, ai_paused_at, id_user FROM ${table} WHERE id = $1`,
        [conversationId]
      );
      const row = rows[0];
      if (!row || row.ai_paused !== true) return false;

      const minutes = await getCachedAutoResumeMinutes(row.id_user);
      if (shouldStayAiPaused({
        aiPaused: true,
        aiPausedAt: row.ai_paused_at,
        autoResumeMinutes: minutes,
      })) {
        return true;
      }

      await db.query(
        `UPDATE ${table}
         SET ai_paused = false, ai_paused_at = NULL
         WHERE id = $1 AND ai_paused = true`,
        [conversationId]
      );
      return false;
    } catch (err) {
      // Column missing (migration not applied yet) — do not block AI.
      console.warn('[UnifiedInbox] isAiPaused check failed:', err.message);
      return false;
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

    // Channel filter
    if (channel) {
      channelFilter = `AND ch.channel = $${paramIndex}`;
      params.push(channel);
      paramIndex++;
    }

    const dateBuilt = buildOutboxDateFilter({ startDate, endDate, params, startIndex: paramIndex });
    paramIndex = dateBuilt.nextIndex;
    const { zaloChannelGate, webChannelGate } = buildOutboxChannelGates(channel);

    const searchBuilt = buildOutboxSearchFilter(search, paramIndex);
    if (searchBuilt.params.length) {
      params.push(...searchBuilt.params);
      paramIndex = searchBuilt.nextIndex;
    }
    const channelSearch = withOutboxAliases(searchBuilt.sql, 'cc', 'cm');
    const zaloSearch = withOutboxAliases(searchBuilt.sql, 'zpc', 'zpm');
    const webSearch = withOutboxAliases(searchBuilt.sql, 'wc', 'wm');

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
        WHERE cm.id_user = $1 AND cm.role = 'agent' ${channelFilter} ${dateBuilt.channelDate} ${channelSearch}

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
        WHERE zpm.id_user = $1 AND zpm.role = 'agent' ${dateBuilt.zaloDate} ${zaloSearch} ${zaloChannelGate}

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
        WHERE wm.id_user = $1 AND wm.role = 'agent' ${dateBuilt.webDate} ${webSearch} ${webChannelGate}
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

    if (channel) {
      channelFilter = `AND ch.channel = $${paramIndex}`;
      params.push(channel);
      paramIndex++;
    }

    const dateBuilt = buildOutboxDateFilter({ startDate, endDate, params, startIndex: paramIndex });
    paramIndex = dateBuilt.nextIndex;
    const { zaloChannelGate, webChannelGate } = buildOutboxChannelGates(channel);

    const searchBuilt = buildOutboxSearchFilter(search, paramIndex);
    if (searchBuilt.params.length) {
      params.push(...searchBuilt.params);
      paramIndex = searchBuilt.nextIndex;
    }
    const channelSearch = withOutboxAliases(searchBuilt.sql, 'cc', 'cm');
    const zaloSearch = withOutboxAliases(searchBuilt.sql, 'zpc', 'zpm');
    const webSearch = withOutboxAliases(searchBuilt.sql, 'wc', 'wm');

    const query = `
      SELECT COUNT(*) as total FROM (
        SELECT cm.id FROM channel_messages cm
        JOIN channel_conversations cc ON cc.id = cm.id_conversation
        JOIN channel_connections ch ON ch.id = cc.id_channel
        WHERE cm.id_user = $1 AND cm.role = 'agent' ${channelFilter} ${dateBuilt.channelDate} ${channelSearch}

        UNION ALL

        SELECT zpm.id FROM zalo_personal_messages zpm
        JOIN zalo_personal_conversations zpc ON zpc.id = zpm.id_conversation
        WHERE zpm.id_user = $1 AND zpm.role = 'agent' ${dateBuilt.zaloDate} ${zaloSearch} ${zaloChannelGate}

        UNION ALL

        SELECT wm.id FROM webchat_messages wm
        JOIN webchat_conversations wc ON wc.id = wm.id_conversation
        WHERE wm.id_user = $1 AND wm.role = 'agent' ${dateBuilt.webDate} ${webSearch} ${webChannelGate}
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

  /**
   * Patch metadata.send via jsonb_set (never overwrite whole metadata — preserves source).
   * @param {'zalo_personal'|'channel'} conversationType
   * @param {number|string} messageId
   * @param {{ status: string, error?: string|null, attempts?: number|null, setLockedAt?: boolean }} patch
   */
  async updateMessageSendStatus(conversationType, messageId, patch = {}) {
    const table = conversationType === 'zalo_personal'
      ? 'zalo_personal_messages'
      : 'channel_messages';
    const status = String(patch.status || 'failed');
    const error = patch.error == null ? null : String(patch.error);
    const attempts = patch.attempts == null ? null : Number(patch.attempts);
    const setLockedAt = Boolean(patch.setLockedAt);

    const { rows } = await db.query(
      `UPDATE ${table} m
       SET metadata = (
         WITH base AS (
           SELECT jsonb_set(
                    COALESCE(m.metadata, '{}'::jsonb),
                    '{send}',
                    COALESCE(m.metadata->'send', '{}'::jsonb),
                    true
                  ) AS meta
         ),
         with_status AS (
           SELECT jsonb_set(base.meta, '{send,status}', to_jsonb($2::text), true) AS meta FROM base
         ),
         with_error AS (
           SELECT jsonb_set(
                    with_status.meta,
                    '{send,error}',
                    CASE WHEN $3::text IS NULL THEN 'null'::jsonb ELSE to_jsonb($3::text) END,
                    true
                  ) AS meta
           FROM with_status
         ),
         with_attempts AS (
           SELECT jsonb_set(
                    with_error.meta,
                    '{send,attempts}',
                    CASE
                      WHEN $4::int IS NOT NULL THEN to_jsonb($4::int)
                      WHEN $2::text = 'failed' THEN to_jsonb(
                        COALESCE((with_error.meta->'send'->>'attempts')::int, 0) + 1
                      )
                      ELSE COALESCE(with_error.meta->'send'->'attempts', to_jsonb(1))
                    END,
                    true
                  ) AS meta
           FROM with_error
         ),
         with_failed_at AS (
           SELECT CASE
                    WHEN $2::text = 'failed'
                      THEN jsonb_set(with_attempts.meta, '{send,failedAt}', to_jsonb(NOW()), true)
                    ELSE with_attempts.meta
                  END AS meta
           FROM with_attempts
         ),
         with_locked_at AS (
           SELECT CASE
                    WHEN $5::boolean
                      THEN jsonb_set(with_failed_at.meta, '{send,lockedAt}', to_jsonb(NOW()), true)
                    ELSE with_failed_at.meta
                  END AS meta
           FROM with_failed_at
         )
         SELECT meta FROM with_locked_at
       )
       WHERE m.id = $1
       RETURNING m.id, m.metadata`,
      [messageId, status, error, Number.isFinite(attempts) ? attempts : null, setLockedAt]
    );
    return rows[0] || null;
  }

  /**
   * Atomically claim a failed/stale-retrying agent message for retry.
   * @returns {Promise<object|null>} claimed row or null
   */
  async claimMessageForRetry(conversationType, messageId) {
    const table = conversationType === 'zalo_personal'
      ? 'zalo_personal_messages'
      : 'channel_messages';
    const { rows } = await db.query(
      `UPDATE ${table}
       SET metadata = jsonb_set(
             jsonb_set(
               jsonb_set(
                 COALESCE(metadata, '{}'::jsonb),
                 '{send}',
                 COALESCE(metadata->'send', '{}'::jsonb),
                 true
               ),
               '{send,status}',
               '"retrying"',
               true
             ),
             '{send,lockedAt}',
             to_jsonb(NOW()),
             true
           )
       WHERE id = $1
         AND role = 'agent'
         AND (
           metadata->'send'->>'status' = 'failed'
           OR (
             metadata->'send'->>'status' = 'retrying'
             AND COALESCE(
                   (metadata->'send'->>'lockedAt')::timestamptz,
                   (metadata->'send'->>'failedAt')::timestamptz
                 ) < NOW() - INTERVAL '2 minutes'
           )
         )
       RETURNING id, id_conversation, id_user, role, content, attachments, metadata,
                 ${conversationType === 'zalo_personal' ? 'id_zalo_setting' : 'id_channel'}`,
      [messageId]
    );
    return rows[0] || null;
  }

  /**
   * Load agent message + conversation for retry, scoped to workspace owner userId.
   */
  async findAgentMessageForRetry(userId, messageId, conversationType) {
    if (conversationType === 'zalo_personal') {
      // is_group / group_id live in visitor_info JSONB (not table columns — see migration 045)
      const { rows } = await db.query(
        `SELECT zpm.id, zpm.id_conversation, zpm.id_user, zpm.id_zalo_setting, zpm.role,
                zpm.content, zpm.attachments, zpm.metadata,
                zp.external_id, zp.visitor_info, zp.id_user AS conversation_user_id,
                'zalo_personal' AS channel
         FROM zalo_personal_messages zpm
         JOIN zalo_personal_conversations zp ON zp.id = zpm.id_conversation
         WHERE zpm.id = $1 AND zp.id_user = $2 AND zpm.role = 'agent'`,
        [messageId, userId]
      );
      const row = rows[0];
      if (!row) return null;
      const visitorInfo = typeof row.visitor_info === 'string'
        ? (() => { try { return JSON.parse(row.visitor_info); } catch { return {}; } })()
        : (row.visitor_info || {});
      row.is_group = visitorInfo.is_group === true;
      row.group_id = visitorInfo.group_id || null;
      row._parsedVisitorInfo = visitorInfo;
      return row;
    }

    if (conversationType === 'channel') {
      const { rows } = await db.query(
        `SELECT cm.id, cm.id_conversation, cm.id_user, cm.id_channel, cm.role,
                cm.content, cm.attachments, cm.metadata,
                cc.external_id, cc.id_user AS conversation_user_id,
                ch.channel AS channel
         FROM channel_messages cm
         JOIN channel_conversations cc ON cc.id = cm.id_conversation
         JOIN channel_connections ch ON ch.id = cm.id_channel
         WHERE cm.id = $1 AND cc.id_user = $2 AND cm.role = 'agent'`,
        [messageId, userId]
      );
      return rows[0] || null;
    }

    return null;
  }
}

export default new UnifiedInboxRepository();

import db from '../../config/database.js';
import { decryptZaloCookieRow } from '../../utils/zaloCookieCrypto.util.js';
import {
  buildZaloGroupExternalIdCandidates,
  normalizeZaloGroupId,
} from '../../utils/zaloGroupName.util.js';

class ZaloPersonalRepository {
  /**
   * Find the active connected Zalo setting for a user.
   *
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async findActiveSessionByUserId(userId) {
    const { rows } = await db.query(
      `SELECT zs.*, zs.id as zalo_setting_id
       FROM zalo_settings zs
       WHERE zs.id_user = $1 AND zs.is_active = true AND zs.status = 'connected'
       LIMIT 1`,
      [userId]
    );
    return decryptZaloCookieRow(rows[0] || null);
  }

  /**
   * Find a connected Zalo setting by account id.
   *
   * @param {number} accountId
   * @returns {Promise<object|null>}
   */
  async findActiveSessionByAccountId(accountId) {
    const { rows } = await db.query(
      `SELECT zs.*, zs.id as zalo_setting_id
       FROM zalo_settings zs
       WHERE zs.id = $1 AND zs.is_active = true AND zs.status = 'connected'
       LIMIT 1`,
      [accountId]
    );
    return decryptZaloCookieRow(rows[0] || null);
  }

  /**
   * Find an existing conversation by zalo setting and external uid.
   * Với nhóm: tìm cả các biến thể g_/group_/group_g_ đã lưu lệch trước đây.
   *
   * @param {number} zaloSettingId
   * @param {string} externalId
   * @returns {Promise<object|null>}
   */
  async findConversation(zaloSettingId, externalId) {
    const ext = String(externalId || '').trim();
    if (!ext) return null;

    const candidates = (ext.startsWith('group_') || ext.startsWith('g_'))
      ? buildZaloGroupExternalIdCandidates(ext)
      : [ext];
    const preferred = (ext.startsWith('group_') || ext.startsWith('g_'))
      ? (normalizeZaloGroupId(ext).prefixed || ext)
      : ext;

    const { rows } = await db.query(
      `SELECT * FROM zalo_personal_conversations
       WHERE id_zalo_setting = $1
         AND external_id = ANY($2::text[])
       ORDER BY
         CASE WHEN external_id = $3 THEN 0 ELSE 1 END,
         id ASC
       LIMIT 1`,
      [zaloSettingId, candidates, preferred]
    );
    return rows[0] || null;
  }

  /**
   * Find a group conversation by sender ID.
   * This is used when Zalo API doesn't include group indicators in the message.
   *
   * @param {number} zaloSettingId
   * @param {string} senderId
   * @returns {Promise<object|null>}
   */
  async findGroupConversationBySender(zaloSettingId, senderId) {
    const { rows } = await db.query(
      `SELECT * FROM zalo_personal_conversations
       WHERE id_zalo_setting = $1 
         AND external_id LIKE $2
         AND visitor_info::text LIKE '%"is_group":true%'
       ORDER BY last_message_at DESC
       LIMIT 1`,
      [zaloSettingId, `group_%_${senderId}`]
    );
    return rows[0] || null;
  }

  /**
   * Insert a new conversation and return it.
   *
   * @param {object} params
   * @param {number} params.userId
   * @param {number} params.zaloSettingId
   * @param {string} params.externalId
   * @param {string|null} params.visitorName
   * @param {string} params.visitorInfo JSON string
   * @param {string} params.now ISO timestamp
   * @returns {Promise<object>}
   */
  async insertConversation({ userId, zaloSettingId, externalId, visitorName, visitorInfo, now }) {
    const { rows } = await db.query(
      `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name, visitor_info, last_message_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, zaloSettingId, externalId, visitorName, visitorInfo, now]
    );
    return rows[0];
  }

  /**
   * Update last_message_at on a conversation.
   *
   * @param {number} conversationId
   * @param {string} now ISO timestamp
   * @returns {Promise<void>}
   */
  async touchConversation(conversationId, now, visitorName = null, visitorInfo = null) {
    const updates = ['last_message_at = $2'];
    const params = [conversationId, now];
    let paramIndex = 3;

    if (visitorName !== null) {
      updates.push(`visitor_name = $${paramIndex}`);
      params.push(visitorName);
      paramIndex++;
    }

    if (visitorInfo !== null) {
      updates.push(`visitor_info = $${paramIndex}`);
      params.push(JSON.stringify(visitorInfo));
      paramIndex++;
    }

    await db.query(
      `UPDATE zalo_personal_conversations SET ${updates.join(', ')} WHERE id = $1`,
      params
    );
  }

  /**
   * Insert an incoming (visitor) message and return the inserted row.
   *
   * @param {object} params
   * @param {number} params.conversationId
   * @param {number} params.userId
   * @param {number} params.zaloSettingId
   * @param {string} params.role
   * @param {string} params.content
   * @param {string|null} params.externalId
   * @param {Date|string} params.externalTs
   * @param {string} params.metadata JSON string
   * @param {Date|string} params.createdAt
   * @returns {Promise<object>}
   */
  async insertMessage({ conversationId, userId, zaloSettingId, role, content, externalId, externalTs, metadata, createdAt }) {
    const { rows } = await db.query(
      `INSERT INTO zalo_personal_messages
       (id_conversation, id_user, id_zalo_setting, role, content, external_id, external_ts, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id_zalo_setting, external_id) WHERE external_id IS NOT NULL
       DO NOTHING
       RETURNING *`,
      [conversationId, userId, zaloSettingId, role, content, externalId, externalTs, metadata, createdAt]
    );
    // ON CONFLICT DO NOTHING → empty RETURNING; callers must treat undefined as duplicate skip
    return rows[0];
  }

  /**
   * Insert an agent (outbound) message without returning a full row.
   *
   * @param {object} params
   * @param {number} params.conversationId
   * @param {number} params.userId
   * @param {number} params.zaloSettingId
   * @param {string} params.content
   * @param {string} params.now ISO timestamp
   * @param {string|null} [params.externalId] Zalo msgId when known (echo dedupe)
   * @returns {Promise<void>}
   */
  async insertAgentMessage({ conversationId, userId, zaloSettingId, content, now, externalId = null, metadata = {} }) {
    await db.query(
      `INSERT INTO zalo_personal_messages
       (id_conversation, id_user, id_zalo_setting, role, content, external_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id_zalo_setting, external_id) WHERE external_id IS NOT NULL
       DO NOTHING`,
      [
        conversationId,
        userId,
        zaloSettingId,
        'agent',
        content,
        externalId,
        typeof metadata === 'object' && metadata !== null ? JSON.stringify(metadata) : '{}',
        now,
      ]
    );
  }

  /**
   * Delete a conversation and its messages.
   * @param {number} conversationId
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async deleteConversation(conversationId, userId) {
    try {
      // Delete messages first
      await db.query(
        `DELETE FROM zalo_personal_messages WHERE id_conversation = $1`,
        [conversationId]
      );
      // Delete conversation (verify ownership)
      const result = await db.query(
        `DELETE FROM zalo_personal_conversations WHERE id = $1 AND id_user = $2 RETURNING id`,
        [conversationId, userId]
      );
      return result.rowCount > 0;
    } catch (err) {
      console.error('[ZaloPersonalRepository] deleteConversation error:', err);
      throw err;
    }
  }

  /**
   * Find message by external ID
   * @param {string} externalId
   * @param {number} zaloSettingId
   * @returns {Promise<object|null>}
   */
  async findMessageByExternalId(externalId, zaloSettingId) {
    const { rows } = await db.query(
      `SELECT * FROM zalo_personal_messages 
       WHERE external_id = $1 AND id_zalo_setting = $2 LIMIT 1`,
      [externalId, zaloSettingId]
    );
    return rows[0] || null;
  }

  /**
   * Pause / resume AI for one Zalo Personal conversation.
   * reason='manual' → ai_paused_at NULL (stay paused until toggle on).
   * reason='handoff' → set ai_paused_at=NOW(), but do NOT overwrite an existing manual pause.
   * @returns {{ aiPaused: boolean, aiPausedAt: string|null }}
   */
  async setAiPaused(conversationId, paused, reason = 'handoff') {
    const isPaused = !!paused;
    const pauseReason = isPaused && reason === 'manual' ? 'manual' : 'handoff';
    const { rows } = await db.query(
      `UPDATE zalo_personal_conversations
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

  async isAiPaused(conversationId) {
    if (!conversationId) return false;
    try {
      const { shouldStayAiPaused, getCachedAutoResumeMinutes } = await import(
        '../../utils/aiHandoffResume.util.js'
      );
      const { rows } = await db.query(
        `SELECT ai_paused, ai_paused_at, id_user FROM zalo_personal_conversations WHERE id = $1`,
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
        `UPDATE zalo_personal_conversations
         SET ai_paused = false, ai_paused_at = NULL
         WHERE id = $1 AND ai_paused = true`,
        [conversationId]
      );
      return false;
    } catch (err) {
      console.warn('[ZaloPersonal] isAiPaused check failed:', err.message);
      return false;
    }
  }

  /**
   * Find conversation by ID and verify user ownership
   */
  async findConversationByIdAndUser(conversationId, userId) {
    const { rows } = await db.query(
      `SELECT * FROM zalo_personal_conversations
       WHERE id = $1 AND id_user = $2`,
      [conversationId, userId]
    );
    return rows[0] || null;
  }

  /**
   * Recent agent rows used to detect inbox-send echo before isSelf handoff pause.
   * @param {number} conversationId
   * @param {{ lookbackMs?: number }} [opts]
   * @returns {Promise<Array<{ source: string|null, externalId: string|null, zaloMsgIds: unknown, content: string|null, createdAt: Date }>>}
   */
  async listRecentAgentEchoCandidates(conversationId, { lookbackMs = 5 * 60 * 1000 } = {}) {
    const ms = Number(lookbackMs);
    const windowMs = Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 5 * 60 * 1000;
    const { rows } = await db.query(
      `SELECT role, content, external_id, metadata, created_at
       FROM zalo_personal_messages
       WHERE id_conversation = $1
         AND role = 'agent'
         AND created_at >= NOW() - ($2::text || ' milliseconds')::interval
       ORDER BY created_at DESC
       LIMIT 40`,
      [conversationId, String(windowMs)]
    );
    return rows.map((row) => {
      const metadata = typeof row.metadata === 'string'
        ? (() => { try { return JSON.parse(row.metadata || '{}'); } catch { return {}; } })()
        : (row.metadata || {});
      return {
        source: metadata?.source != null ? String(metadata.source) : null,
        externalId: row.external_id != null ? String(row.external_id) : null,
        zaloMsgIds: Array.isArray(metadata?.zalo_msg_ids) ? metadata.zalo_msg_ids : [],
        content: row.content != null ? String(row.content) : null,
        createdAt: row.created_at,
      };
    });
  }

  /**
   * Get messages for AI context - returns formatted messages
   */
  async getMessagesForContext(conversationId, limit = 50) {
    const { rows } = await db.query(
      `SELECT id, role, content, metadata, created_at 
       FROM zalo_personal_messages
       WHERE id_conversation = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [conversationId, limit]
    );
    
    return rows.map(row => ({
      ...row,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {}),
    }));
  }

  /**
   * Báo cáo hoạt động AI và tin nhắn theo ngày
   * @param {object} params
   * @param {number} params.userId
   * @param {string} params.startIso
   * @param {string} params.endIso
   * @param {number|null} [params.accountId]
   * @returns {Promise<Array<object>>}
   */
  async getAiActivityReport({ userId, startIso, endIso, accountId = null }) {
    const params = [userId, startIso, endIso];
    let accountFilter = '';
    if (accountId != null) {
      params.push(Number(accountId));
      accountFilter = `AND c.id_zalo_setting = $${params.length}`;
    }

    const { rows } = await db.query(
      `SELECT c.id,
              c.visitor_name,
              c.external_id,
              c.id_zalo_setting,
              COUNT(*) FILTER (WHERE m.role = 'visitor')                                AS khach_nhan,
              COUNT(*) FILTER (WHERE m.metadata->>'source' = 'ai_auto_reply')           AS ai_tra_loi,
              COUNT(*) FILTER (WHERE m.metadata->>'source' IN ('manual_inbox','owner_zalo_app')) AS nguoi_tra_loi,
              COUNT(*) FILTER (WHERE m.role = 'visitor' AND m.is_read = false)          AS chua_doc,
              MIN(m.created_at) FILTER (WHERE m.role = 'visitor')                       AS tin_dau,
              MAX(m.created_at)                                                          AS tin_cuoi,
              c.ai_paused,
              c.ai_paused_at
       FROM zalo_personal_conversations c
       JOIN zalo_personal_messages m ON m.id_conversation = c.id
       WHERE c.id_user = $1
         AND m.created_at >= $2 AND m.created_at < $3
         ${accountFilter}
       GROUP BY c.id
       ORDER BY tin_cuoi DESC`,
      params
    );
    return rows;
  }

  /**
   * Lấy tin nhắn trong ngày của các hội thoại phục vụ tóm tắt AI
   */
  async getMessagesForSummary({ conversationIds = [], userId, startIso, endIso }) {
    if (!Array.isArray(conversationIds) || conversationIds.length === 0) return [];
    const { rows } = await db.query(
      `SELECT id_conversation, role, content, metadata->>'source' as source, created_at
       FROM zalo_personal_messages
       WHERE id_user = $1
         AND id_conversation = ANY($2::bigint[])
         AND created_at >= $3 AND created_at < $4
       ORDER BY id_conversation, created_at ASC`,
      [userId, conversationIds, startIso, endIso]
    );
    return rows;
  }

  /**
   * Bật lại tất cả AI đang bị tạm dừng do handoff (không bật những hội thoại cố ý tắt manual)
   */
  async bulkResumeAiPaused(userId) {
    const result = await db.query(
      `UPDATE zalo_personal_conversations
       SET ai_paused = false, ai_paused_at = NULL
       WHERE id_user = $1 AND ai_paused = true AND ai_paused_at IS NOT NULL
       RETURNING id`,
      [userId]
    );
    return result.rowCount;
  }

  /**
   * Đếm số hội thoại bị AI tạm dừng do handoff quá số giờ quy định (mặc định 24h)
   */
  async countStaleAiPausedConversations(userId, hoursThreshold = 24) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM zalo_personal_conversations
       WHERE id_user = $1
         AND ai_paused = true
         AND ai_paused_at IS NOT NULL
         AND ai_paused_at <= NOW() - ($2::text || ' hours')::interval`,
      [userId, String(hoursThreshold)]
    );
    return rows[0]?.count || 0;
  }
}

export default new ZaloPersonalRepository();


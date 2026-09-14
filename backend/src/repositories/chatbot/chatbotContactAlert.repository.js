import db from '../../config/database.js';

class ChatbotContactAlertRepository {
  /**
   * Lấy id tin nhắn cuối cùng đã quét của một nguồn
   * @param {'web'|'channel'|'zalo_personal'} source
   * @param {object} [queryable=db]
   * @returns {Promise<number>}
   */
  async getCursor(source, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT last_message_id FROM chatbot_contact_scan_cursors WHERE source = $1 LIMIT 1`,
      [source]
    );
    return rows[0] ? Number(rows[0].last_message_id) || 0 : 0;
  }

  /**
   * Cập nhật cursor sau khi quét lô tin nhắn
   * @param {'web'|'channel'|'zalo_personal'} source
   * @param {number} lastMessageId
   * @param {object} [queryable=db]
   * @returns {Promise<void>}
   */
  async setCursor(source, lastMessageId, queryable = db) {
    await queryable.query(
      `INSERT INTO chatbot_contact_scan_cursors (source, last_message_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (source) DO UPDATE
       SET last_message_id = EXCLUDED.last_message_id,
           updated_at = NOW()`,
      [source, lastMessageId]
    );
  }

  /**
   * Lấy các tin nhắn mới của khách (role = 'visitor') sau id cursor
   * @param {'web'|'channel'|'zalo_personal'} source
   * @param {number} lastMessageId
   * @param {number} [limit=500]
   * @param {object} [queryable=db]
   * @returns {Promise<Array<object>>}
   */
  async fetchVisitorMessagesAfter(source, lastMessageId, limit = 500, queryable = db) {
    if (source === 'web') {
      const { rows } = await queryable.query(
        `SELECT m.id, m.id_user, m.id_conversation, m.content, m.created_at,
                c.visitor_name, 'web' AS source, NULL AS channel, NULL AS display_name
         FROM webchat_messages m
         JOIN webchat_conversations c ON c.id = m.id_conversation
         WHERE m.id > $1 AND m.role = 'visitor' AND m.content IS NOT NULL AND TRIM(m.content) != ''
         ORDER BY m.id ASC
         LIMIT $2`,
        [lastMessageId, limit]
      );
      return rows;
    }

    if (source === 'channel') {
      const { rows } = await queryable.query(
        `SELECT m.id, m.id_user, m.id_conversation, m.content, m.created_at,
                c.visitor_name, 'channel' AS source, cc.channel, cc.display_name
         FROM channel_messages m
         JOIN channel_conversations c ON c.id = m.id_conversation
         LEFT JOIN channel_connections cc ON cc.id = c.id_channel
         WHERE m.id > $1 AND m.role = 'visitor' AND m.content IS NOT NULL AND TRIM(m.content) != ''
         ORDER BY m.id ASC
         LIMIT $2`,
        [lastMessageId, limit]
      );
      return rows;
    }

    if (source === 'zalo_personal') {
      const { rows } = await queryable.query(
        `SELECT m.id, m.id_user, m.id_conversation, m.content, m.created_at,
                c.visitor_name, 'zalo_personal' AS source, 'zalo_personal' AS channel, zs.display_name
         FROM zalo_personal_messages m
         JOIN zalo_personal_conversations c ON c.id = m.id_conversation
         LEFT JOIN zalo_settings zs ON zs.id = c.id_zalo_setting
         WHERE m.id > $1 AND m.role = 'visitor' AND m.content IS NOT NULL AND TRIM(m.content) != ''
         ORDER BY m.id ASC
         LIMIT $2`,
        [lastMessageId, limit]
      );
      return rows;
    }

    return [];
  }

  /**
   * Kiểm tra trong hội thoại có phản hồi của người thật (role = 'agent') kể từ thời điểm sinceIso không
   * @param {'web'|'channel'|'zalo_personal'} source
   * @param {number} conversationId
   * @param {string|Date} sinceIso
   * @param {object} [queryable=db]
   * @returns {Promise<boolean>}
   */
  async hasAgentReplySince(source, conversationId, sinceIso, queryable = db) {
    let tableName = 'webchat_messages';
    if (source === 'channel') {
      tableName = 'channel_messages';
    } else if (source === 'zalo_personal') {
      tableName = 'zalo_personal_messages';
    }

    const { rows } = await queryable.query(
      `SELECT EXISTS (
         SELECT 1 FROM ${tableName}
         WHERE id_conversation = $1 AND role = 'agent' AND created_at >= $2
       ) AS has_agent`,
      [conversationId, sinceIso]
    );

    return Boolean(rows[0]?.has_agent);
  }

  /**
   * Lấy thông tin liên hệ của chính chủ shop để loại trừ
   * @param {number} idUser
   * @param {object} [queryable=db]
   * @returns {Promise<{ id: number, email: string|null, phone: string|null }|null>}
   */
  async getOwnerContact(idUser, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT id, email, phone FROM users WHERE id = $1 LIMIT 1`,
      [idUser]
    );
    return rows[0] || null;
  }

  /**
   * Ghi nhận hoặc cập nhật liên hệ vào sổ chatbot_contact_alerts
   * @param {object} params
   * @param {number} params.idUser
   * @param {'phone'|'email'} params.contactType
   * @param {string} params.contactValue
   * @param {string|Date} params.seenAt
   * @param {'web'|'channel'|'zalo_personal'} params.source
   * @param {number} params.conversationId
   * @param {number} params.messageId
   * @param {string} [params.excerpt]
   * @param {boolean} [params.pendingNotify=true]
   * @param {string|null} [params.suppressedReason=null]
   * @param {object} [queryable=db]
   * @returns {Promise<object>}
   */
  async upsertContact(
    {
      idUser,
      contactType,
      contactValue,
      seenAt,
      source,
      conversationId,
      messageId,
      excerpt,
      pendingNotify = true,
      suppressedReason = null,
    },
    queryable = db
  ) {
    const { rows } = await queryable.query(
      `INSERT INTO chatbot_contact_alerts (
         id_user, contact_type, contact_value,
         first_seen_at, last_seen_at, seen_count,
         last_source, last_conversation_id, last_message_id, last_excerpt,
         pending_notify, suppressed_reason, created_at, updated_at
       )
       VALUES (
         $1, $2, $3,
         $4, $4, 1,
         $5, $6, $7, $8,
         $9, $10, NOW(), NOW()
       )
       ON CONFLICT (id_user, contact_type, contact_value) DO UPDATE
       SET
         last_seen_at = GREATEST(chatbot_contact_alerts.last_seen_at, EXCLUDED.last_seen_at),
         seen_count = CASE
           WHEN EXCLUDED.last_message_id > chatbot_contact_alerts.last_message_id THEN chatbot_contact_alerts.seen_count + 1
           ELSE chatbot_contact_alerts.seen_count
         END,
         last_source = CASE
           WHEN EXCLUDED.last_message_id >= chatbot_contact_alerts.last_message_id THEN EXCLUDED.last_source
           ELSE chatbot_contact_alerts.last_source
         END,
         last_conversation_id = CASE
           WHEN EXCLUDED.last_message_id >= chatbot_contact_alerts.last_message_id THEN EXCLUDED.last_conversation_id
           ELSE chatbot_contact_alerts.last_conversation_id
         END,
         last_message_id = GREATEST(chatbot_contact_alerts.last_message_id, EXCLUDED.last_message_id),
         last_excerpt = CASE
           WHEN EXCLUDED.last_message_id >= chatbot_contact_alerts.last_message_id THEN EXCLUDED.last_excerpt
           ELSE chatbot_contact_alerts.last_excerpt
         END,
         pending_notify = CASE
           WHEN chatbot_contact_alerts.pending_notify = true THEN true
           WHEN chatbot_contact_alerts.last_notified_at IS NULL
                OR chatbot_contact_alerts.last_notified_at < NOW() - INTERVAL '24 hours' THEN EXCLUDED.pending_notify
           ELSE false
         END,
         suppressed_reason = CASE
           WHEN EXCLUDED.suppressed_reason IS NOT NULL THEN EXCLUDED.suppressed_reason
           ELSE chatbot_contact_alerts.suppressed_reason
         END,
         updated_at = NOW()
       RETURNING *`,
      [
        idUser,
        contactType,
        contactValue,
        seenAt,
        source,
        conversationId,
        messageId,
        excerpt || null,
        Boolean(pendingNotify),
        suppressedReason || null,
      ]
    );
    return rows[0] || null;
  }

  /**
   * Danh sách các liên hệ đang chờ báo, join bảng users lấy email chủ shop
   * Chỉ lấy users có status = 'active'
   * @param {object} [queryable=db]
   * @returns {Promise<Array<object>>}
   */
  async listPendingGroupedByUser(queryable = db) {
    const { rows } = await queryable.query(
      `SELECT a.*, u.email AS user_email, u.full_name AS user_full_name,
              COALESCE(wc.visitor_name, cc.visitor_name, zc.visitor_name) AS visitor_name,
              cc.channel AS channel_type,
              conn.display_name AS display_name
       FROM chatbot_contact_alerts a
       JOIN users u ON u.id = a.id_user
       LEFT JOIN webchat_conversations wc ON a.last_source = 'web' AND wc.id = a.last_conversation_id
       LEFT JOIN channel_conversations cc ON a.last_source = 'channel' AND cc.id = a.last_conversation_id
       LEFT JOIN channel_connections conn ON cc.id_channel = conn.id
       LEFT JOIN zalo_personal_conversations zc ON a.last_source = 'zalo_personal' AND zc.id = a.last_conversation_id
       WHERE a.pending_notify = true AND u.status = 'active'
       ORDER BY a.id_user ASC, a.created_at ASC`
    );
    return rows;
  }

  /**
   * Lấy thời điểm gửi thông báo gần nhất của hội thoại để tính cooldown 30 phút
   * @param {number} idUser
   * @param {'web'|'channel'|'zalo_personal'} source
   * @param {number} conversationId
   * @param {object} [queryable=db]
   * @returns {Promise<Date|null>}
   */
  async lastNotifiedAtForConversation(idUser, source, conversationId, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT MAX(last_notified_at) AS last_notified_at
       FROM chatbot_contact_alerts
       WHERE id_user = $1 AND last_source = $2 AND last_conversation_id = $3 AND last_notified_at IS NOT NULL`,
      [idUser, source, conversationId]
    );
    return rows[0]?.last_notified_at ? new Date(rows[0].last_notified_at) : null;
  }

  /**
   * Đánh dấu đã gửi thông báo thành công cho danh sách alert ids
   * @param {Array<number>} ids
   * @param {Date|string} notifiedAt
   * @param {object} [queryable=db]
   * @returns {Promise<void>}
   */
  async markNotified(ids, notifiedAt, queryable = db) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    await queryable.query(
      `UPDATE chatbot_contact_alerts
       SET pending_notify = false,
           last_notified_at = $2,
           updated_at = NOW()
       WHERE id = ANY($1::bigint[])`,
      [ids, notifiedAt]
    );
  }
}

const chatbotContactAlertRepository = new ChatbotContactAlertRepository();

export const getCursor = (...args) => chatbotContactAlertRepository.getCursor(...args);
export const setCursor = (...args) => chatbotContactAlertRepository.setCursor(...args);
export { ChatbotContactAlertRepository };
export default chatbotContactAlertRepository;

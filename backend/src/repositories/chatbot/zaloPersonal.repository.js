import db from '../../config/database.js';

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
    return rows[0] || null;
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
    return rows[0] || null;
  }

  /**
   * Find an existing conversation by zalo setting and external uid.
   *
   * @param {number} zaloSettingId
   * @param {string} externalId
   * @returns {Promise<object|null>}
   */
  async findConversation(zaloSettingId, externalId) {
    const { rows } = await db.query(
      `SELECT * FROM zalo_personal_conversations
       WHERE id_zalo_setting = $1 AND external_id = $2`,
      [zaloSettingId, externalId]
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
       RETURNING *`,
      [conversationId, userId, zaloSettingId, role, content, externalId, externalTs, metadata, createdAt]
    );
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
   * @returns {Promise<void>}
   */
  async insertAgentMessage({ conversationId, userId, zaloSettingId, content, now }) {
    await db.query(
      `INSERT INTO zalo_personal_messages
       (id_conversation, id_user, id_zalo_setting, role, content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [conversationId, userId, zaloSettingId, 'agent', content, now]
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
}

export default new ZaloPersonalRepository();

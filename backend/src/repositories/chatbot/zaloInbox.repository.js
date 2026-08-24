import db from '../../config/database.js';
import { decryptZaloCookieRows } from '../../utils/zaloCookieCrypto.util.js';

class ZaloInboxRepository {
  /**
   * Get all connected Zalo personal accounts with valid sessions.
   *
   * @returns {Promise<object[]>}
   */
  async findConnectedAccountsWithSessions() {
    const result = await db.query(
      `SELECT zs.id as account_id, zs.id_user, zs.cookie_text, zs.is_active, zs.status
       FROM zalo_settings zs
       WHERE zs.is_active = true AND zs.status = 'connected' AND zs.cookie_text IS NOT NULL`
    );
    return decryptZaloCookieRows(result.rows);
  }

  /**
   * Get a sample of all zalo_settings for debugging purposes.
   *
   * @returns {Promise<object[]>}
   */
  async findAllAccountsSample() {
    const result = await db.query(
      `SELECT id, id_user, is_active, status, cookie_text IS NOT NULL as has_cookie FROM zalo_settings WHERE id_user IS NOT NULL LIMIT 10`
    );
    return result.rows;
  }

  /**
   * Get all active connected Zalo personal accounts.
   *
   * @returns {Promise<object[]>}
   */
  async findActiveConnectedAccounts() {
    const result = await db.query(
      `SELECT zs.id as account_id, zs.id_user, zs.display_name as account_display_name,
              zs.zalo_name, zs.zalo_user_id, zs.status as account_status
       FROM zalo_settings zs
       WHERE zs.is_active = true AND zs.status = 'connected'`
    );
    return result.rows;
  }

  /**
   * Verify a Zalo account exists, is active, and belongs to the user.
   *
   * @param {number} accountId
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async findActiveAccount(accountId, userId) {
    const result = await db.query(
      `SELECT id FROM zalo_settings
       WHERE id = $1 AND id_user = $2 AND is_active = true AND status = 'connected'`,
      [accountId, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Check whether a message with the given external ID has already been processed.
   *
   * @param {string} externalId
   * @param {number} zaloSettingId
   * @returns {Promise<boolean>}
   */
  async isMessageProcessed(externalId, zaloSettingId) {
    const result = await db.query(
      `SELECT 1 FROM zalo_personal_messages
       WHERE external_id = $1 AND id_zalo_setting = $2
       LIMIT 1`,
      [externalId, zaloSettingId]
    );
    return result.rows.length > 0;
  }

  /**
   * Insert an incoming visitor message.
   *
   * @param {object} params
   * @param {number} params.conversationId
   * @param {number} params.userId
   * @param {number} params.zaloSettingId
   * @param {string} params.message
   * @param {string} params.externalId
   * @param {Date|string} params.externalTs
   * @param {object} params.metadata
   * @param {string} params.now ISO timestamp
   * @returns {Promise<void>}
   */
  async insertVisitorMessage({ conversationId, userId, zaloSettingId, message, externalId, externalTs, metadata, now }) {
    await db.query(
      `INSERT INTO zalo_personal_messages
       (id_conversation, id_user, id_zalo_setting, role, content, message_type, external_id, external_ts, metadata, created_at)
       VALUES ($1, $2, $3, 'visitor', $4, 'text', $5, $6, $7, $8)`,
      [
        conversationId,
        userId,
        zaloSettingId,
        message,
        externalId,
        externalTs ? new Date(externalTs) : now,
        JSON.stringify(metadata),
        now,
      ]
    );
  }

  /**
   * Update conversation last_message_at timestamp.
   *
   * @param {number} conversationId
   * @param {string} now ISO timestamp
   * @returns {Promise<void>}
   */
  async touchConversation(conversationId, now) {
    await db.query(
      `UPDATE zalo_personal_conversations SET last_message_at = $2 WHERE id = $1`,
      [conversationId, now]
    );
  }

  /**
   * Conditionally reset the AI conversation context.
   *
   * If the time gap since the conversation's last message exceeds
   * ZALO_SESSION_GAP_HOURS env var (default 8 hours), the visitor is starting
   * a new session and session_reset_at is set to now. The AI will only read
   * messages newer than session_reset_at, effectively giving a clean context.
   *
   * @param {number} conversationId
   * @param {Date|string} lastMessageAt - when the last visitor message arrived
   * @param {number} gapHours - threshold in hours (default 8)
   * @returns {Promise<boolean>} true if session was reset, false if gap is short
   */
  async maybeResetSession(conversationId, lastMessageAt, gapHours = null) {
    // Allow override via env var; defaults to 8 hours.
    const hours = gapHours ?? Number(process.env.ZALO_SESSION_GAP_HOURS ?? 8);
    const gapMs = hours * 60 * 60 * 1000;
    const gap = Date.now() - new Date(lastMessageAt).getTime();
    if (gap < gapMs) return false;

    await db.query(
      `UPDATE zalo_personal_conversations
          SET session_reset_at = NOW(),
              last_message_at = NOW()
        WHERE id = $1`,
      [conversationId]
    );
    return true;
  }

  /**
   * Insert a bot response message.
   *
   * @param {number} conversationId
   * @param {number} zaloSettingId
   * @param {number} userId
   * @param {string} content
   * @param {string} now ISO timestamp
   * @returns {Promise<void>}
   */
  async insertBotMessage(conversationId, zaloSettingId, userId, content, now) {
    await db.query(
      `INSERT INTO zalo_personal_messages
       (id_conversation, id_user, id_zalo_setting, role, content, message_type, created_at)
       VALUES ($1, $2, $3, 'bot', $4, 'text', $5)`,
      [conversationId, userId, zaloSettingId, content, now]
    );
  }

  /**
   * Find an existing conversation by setting ID and external contact ID.
   *
   * @param {number} zaloSettingId
   * @param {string} externalId
   * @returns {Promise<object|null>}
   */
  async findConversation(zaloSettingId, externalId) {
    const result = await db.query(
      `SELECT * FROM zalo_personal_conversations
       WHERE id_zalo_setting = $1 AND external_id = $2`,
      [zaloSettingId, externalId]
    );
    return result.rows[0] || null;
  }

  /**
   * Update visitor name and/or visitor info on an existing conversation.
   *
   * @param {number} conversationId
   * @param {string|null} visitorName new name (or null to skip)
   * @param {object|null} visitorInfo new info object (or null to skip)
   * @returns {Promise<void>}
   */
  async updateConversationVisitor(conversationId, visitorName, visitorInfo) {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (visitorName !== null && visitorName !== undefined) {
      updates.push(`visitor_name = $${paramIndex++}`);
      values.push(visitorName);
    }

    if (visitorInfo !== null && visitorInfo !== undefined) {
      updates.push(`visitor_info = $${paramIndex++}`);
      values.push(JSON.stringify(visitorInfo));
    }

    if (updates.length === 0) return;

    values.push(conversationId);
    await db.query(
      `UPDATE zalo_personal_conversations SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Create a new conversation.
   *
   * @param {number} userId
   * @param {number} zaloSettingId
   * @param {string} externalId
   * @param {string} visitorName
   * @param {object} visitorInfo
   * @param {number|null} [idChatbot] - Chatbot this conversation belongs to.
   *   Required when the (user, zalo) pair is shared by multiple chatbots: each
   *   conversation must be pinned to exactly one chatbot so toggling one
   *   doesn't affect the others (see migration 164).
   * @returns {Promise<object>} the created row
   */
  async createConversation(userId, zaloSettingId, externalId, visitorName, visitorInfo, idChatbot = null) {
    const result = await db.query(
      `INSERT INTO zalo_personal_conversations
       (id_user, id_zalo_setting, external_id, visitor_name, visitor_info, id_chatbot, last_message_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [userId, zaloSettingId, externalId, visitorName, JSON.stringify(visitorInfo), idChatbot]
    );
    return result.rows[0];
  }

  /**
   * Get conversations that need name backfill.
   *
   * @param {number} userId
   * @param {number} zaloSettingId
   * @returns {Promise<object[]>}
   */
  async findConversationsForBackfill(userId, zaloSettingId) {
    const result = await db.query(
      `SELECT id, external_id, visitor_name, visitor_info
       FROM zalo_personal_conversations
       WHERE id_user = $1 AND id_zalo_setting = $2
       AND (visitor_name IS NULL OR visitor_name LIKE 'User %' OR visitor_name LIKE 'Nhóm %' OR visitor_info::text NOT LIKE '%sender_name%' OR visitor_info::text NOT LIKE '%group_name%')`,
      [userId, zaloSettingId]
    );
    return result.rows;
  }

  /**
   * Update name and visitor_info on a conversation during backfill.
   *
   * @param {number} conversationId
   * @param {string} displayName
   * @param {object} updatedVisitorInfo
   * @returns {Promise<void>}
   */
  async backfillConversationName(conversationId, displayName, updatedVisitorInfo) {
    await db.query(
      `UPDATE zalo_personal_conversations
       SET visitor_name = $1, visitor_info = $2
       WHERE id = $3`,
      [displayName, JSON.stringify(updatedVisitorInfo), conversationId]
    );
  }

  /**
   * Look up a synced group name from zalo_groups.
   *
   * @param {number} zaloSettingId
   * @param {string} groupId
   * @returns {Promise<string|null>}
   */
  async findGroupNameById(zaloSettingId, groupId) {
    const bare = String(groupId || '').trim().replace(/^group_/, '');
    if (!bare) return null;

    const result = await db.query(
      `SELECT group_name
       FROM zalo_groups
       WHERE id_zalo_setting = $1
         AND (
           group_id = $2
           OR group_id = $3
           OR CONCAT('group_', group_id) = $3
         )
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [zaloSettingId, bare, `group_${bare}`]
    );

    return result.rows[0]?.group_name || null;
  }

  /**
   * Get a single Zalo account by ID (for listener registration).
   *
   * @param {number} accountId
   * @returns {Promise<object|null>}
   */
  async findAccountById(accountId) {
    const result = await db.query(
      `SELECT zs.id, zs.id_user, zs.display_name
       FROM zalo_settings zs
       WHERE zs.id = $1 AND zs.is_active = true AND zs.status = 'connected'`,
      [accountId]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete a conversation and its messages.
   *
   * @param {number} conversationId
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async deleteConversation(conversationId, userId) {
    // Delete messages first
    await db.query(
      `DELETE FROM zalo_personal_messages WHERE id_conversation = $1`,
      [conversationId]
    );
    // Delete conversation
    const result = await db.query(
      `DELETE FROM zalo_personal_conversations WHERE id = $1 AND id_user = $2 RETURNING id`,
      [conversationId, userId]
    );
    return result.rowCount > 0;
  }

  /**
   * Delete a conversation by externalId.
   *
   * @param {number} zaloSettingId
   * @param {string} externalId
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async deleteConversationByExternalId(zaloSettingId, externalId, userId) {
    const conv = await this.findConversation(zaloSettingId, externalId);
    if (!conv) return false;
    return this.deleteConversation(conv.id, userId);
  }
}

export default new ZaloInboxRepository();

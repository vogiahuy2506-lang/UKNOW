/**
 * Zalo Personal Bridge Adapter
 *
 * Uses the existing zca-js browser automation (already in use for outbound campaigns)
 * to listen for incoming messages and send replies.
 *
 * Architecture:
 * - When account connects → register message listener
 * - When new message event fires → call registered handler
 * - Send reply via zca-js sendText
 *
 * Note: This is a "bridge" because Zalo does NOT have an official public API
 * for personal accounts. This approach simulates interaction via browser automation.
 */
import db from '../../../config/database.js';
import zaloAccountSessionService from '../../zalo/zaloAccountSession.service.js';
import chatbotRepository from '../../../repositories/ai/chatbot.repository.js';

class ZaloPersonalAdapter {
  // Map accountId → message handler
  static messageHandlers = new Map();

  /**
   * Get the active Zalo personal session for a user.
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async getActiveSession(userId) {
    // Find zalo_settings for this user
    const { rows } = await db.query(
      `SELECT zs.*, zs.id as zalo_setting_id
       FROM zalo_settings zs
       WHERE zs.id_user = $1 AND zs.is_active = true AND zs.status = 'connected'
       LIMIT 1`,
      [userId]
    );

    if (!rows[0]) return null;

    const zaloSetting = rows[0];
    const accountId = zaloSetting.id;

    const api = zaloAccountSessionService.getAccountApi(accountId);
    return api ? { api, accountId, zaloSetting } : null;
  }

  /**
   * Get session by account ID (zalo_setting.id)
   */
  async getSessionByAccountId(accountId) {
    const api = zaloAccountSessionService.getAccountApi(accountId);
    if (!api) return null;

    const { rows } = await db.query(
      `SELECT zs.*, zs.id as zalo_setting_id
       FROM zalo_settings zs
       WHERE zs.id = $1 AND zs.is_active = true AND zs.status = 'connected'
       LIMIT 1`,
      [accountId]
    );

    return rows[0] ? { api, accountId, zaloSetting: rows[0] } : null;
  }

  /**
   * Register a message handler for an account.
   * @param {number} userId
   * @param {number} accountId - zalo_setting.id
   * @param {Function} handler - async function(message) {}
   */
  async registerMessageHandler(userId, accountId, handler) {
    const session = await this.getSessionByAccountId(accountId);
    if (!session?.api) {
      console.warn(`[ZaloPersonalAdapter] No active session for account ${accountId}`);
      return false;
    }

    const listener = session.api.listener;
    if (!listener) {
      console.warn(`[ZaloPersonalAdapter] No listener for account ${accountId}`);
      return false;
    }

    // Remove existing handler if any
    this.removeMessageHandler(accountId);

    // Store handler
    ZaloPersonalAdapter.messageHandlers.set(String(accountId), { userId, handler });

    // Attach to listener
    listener.on('message', async (message) => {
      const stored = ZaloPersonalAdapter.messageHandlers.get(String(accountId));
      if (stored?.handler) {
        // Access raw data from UserMessage object
        const rawData = message?.data || message;

        // Determine message source type (personal chat vs group)
        // Group message indicators:
        // 1. clientGroupId is present
        // 2. threadType === 1 (Zalo internal group indicator)
        // 3. idTo starts with 'g_' prefix
        // 4. isGroup flag is explicitly true in raw data
        const isGroup = Boolean(
          rawData?.clientGroupId || 
          rawData?.threadType === 1 || 
          rawData?.idTo?.startsWith('g_') ||
          rawData?.isGroup === true
        );
        
        // Build normalized message object with full metadata
        const msgData = {
          msgId: rawData.msgId || rawData.id || `zalo_${Date.now()}`,
          messageId: rawData.msgId || rawData.id,
          id: rawData.msgId || rawData.id,
          fromUid: rawData.uidFrom,
          senderId: rawData.uidFrom,
          uid: rawData.uidFrom,
          content: rawData.content || rawData.text || rawData.msg || '',
          message: rawData.content || rawData.text || rawData.msg || '',
          msg: rawData.content || rawData.text || rawData.msg || '',
          timestamp: rawData.timestamp || rawData.time || Date.now(),
          time: rawData.timestamp || rawData.time || Date.now(),
          createdAt: rawData.timestamp || rawData.time || Date.now(),
          // Meta info from UserMessage wrapper
          isSelf: message?.isSelf || false,
          type: message?.type || 'user',
          threadId: rawData.threadId || rawData.idTo,
          // Source context: personal or group
          isGroup: isGroup,
          groupId: rawData.clientGroupId || (isGroup ? rawData.idTo : null),
          groupName: rawData.groupName || null,
          // Full sender info
          senderName: rawData.displayName || rawData.alias || rawData.coinsName || null,
          senderAvatar: rawData.avatarThumb || rawData.avatar || null,
          // Message details
          msgType: rawData.msgType || rawData.type || 1,
          attachmentUrl: rawData.attachmentUrl || rawData.thumb || rawData.photo || null,
          // Original message object for debugging
          _raw: rawData,
        };
        
        console.log(`[ZaloPersonalAdapter] Incoming ${msgData.isGroup ? 'group' : 'personal'} message from ${msgData.fromUid}: ${String(msgData.content || '').substring(0, 50)}`);
        
        // Save to database for unified inbox
        try {
          await this.saveMessageToDatabase(stored.userId, accountId, msgData);
        } catch (dbErr) {
          console.error(`[ZaloPersonalAdapter] DB save error:`, dbErr.message);
        }
        
        // Call custom handler if registered
        if (stored.handler) {
          stored.handler(msgData).catch((err) => {
            console.error(`[ZaloPersonalAdapter] Handler error for user ${stored.userId}:`, err.message);
          });
        }
      }
    });

    console.log(`[ZaloPersonalAdapter] Registered message handler for user ${userId}, account ${accountId}`);
    return true;
  }

  /**
   * Remove message handler for an account.
   * @param {string|number} accountId
   */
  removeMessageHandler(accountId) {
    const key = String(accountId);
    ZaloPersonalAdapter.messageHandlers.delete(key);
  }

  /**
   * Save incoming message to database (for unified inbox).
   * Creates or updates conversation as needed.
   * @param {number} userId
   * @param {number} zaloSettingId
   * @param {object} msgData - normalized message data
   */
  async saveMessageToDatabase(userId, zaloSettingId, msgData) {
    const now = new Date().toISOString();

    // Skip self-messages (sent by own account)
    if (msgData.isSelf || msgData.fromUid === msgData.uid) {
      return null;
    }

    // Get or create conversation
    let { rows: convRows } = await db.query(
      `SELECT * FROM zalo_personal_conversations 
       WHERE id_zalo_setting = $1 AND external_id = $2`,
      [zaloSettingId, msgData.fromUid]
    );

    let conversationId;
    if (convRows.length === 0) {
      // Create new conversation
      const { rows: newConv } = await db.query(
        `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name, visitor_info, last_message_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          userId,
          zaloSettingId,
          msgData.fromUid,
          msgData.senderName || null,
          JSON.stringify({
            sender_name: msgData.senderName,
            sender_avatar: msgData.senderAvatar,
            is_group: msgData.isGroup || false,
            group_name: msgData.groupName || null,
          }),
          now,
        ]
      );
      conversationId = newConv[0].id;
    } else {
      conversationId = convRows[0].id;
      // Update last_message_at
      await db.query(
        `UPDATE zalo_personal_conversations SET last_message_at = $2 WHERE id = $1`,
        [conversationId, now]
      );
    }

    // Save message
    const { rows: msgRows } = await db.query(
      `INSERT INTO zalo_personal_messages 
       (id_conversation, id_user, id_zalo_setting, role, content, external_id, external_ts, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        conversationId,
        userId,
        zaloSettingId,
        'visitor',
        msgData.content || msgData.message || '',
        msgData.messageId || msgData.msgId,
        msgData.timestamp ? new Date(msgData.timestamp) : now,
        JSON.stringify({ 
          _raw: msgData._raw,
          sender_name: msgData.senderName,
          is_group: msgData.isGroup || false,
        }),
        msgData.timestamp ? new Date(msgData.timestamp) : now,
      ]
    );

    return {
      conversationId,
      messageId: msgRows[0].id,
    };
  }

  /**
   * Send a reply via Zalo personal account.
   * @param {object} params
   * @param {string} params.externalId - Zalo user ID (uid)
   * @param {string} params.message - text reply
   * @param {number} params.userId
   */
  async sendReply({ externalId, message, userId }) {
    const session = await this.getActiveSession(userId);
    if (!session?.api) {
      return { success: false, error: 'No active Zalo personal session' };
    }

    try {
      const api = session.api;
      // zca-js uses sendMessage(payload, uid) - NOT sendText
      const payload = String(message || '').slice(0, 4000);
      await api.sendMessage(payload, externalId);

      // Also save the sent message to database
      const now = new Date().toISOString();
      const { rows: convRows } = await db.query(
        `SELECT * FROM zalo_personal_conversations 
         WHERE id_zalo_setting = $1 AND external_id = $2`,
        [session.accountId, externalId]
      );

      if (convRows.length > 0) {
        await db.query(
          `INSERT INTO zalo_personal_messages 
           (id_conversation, id_user, id_zalo_setting, role, content, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [convRows[0].id, userId, session.accountId, 'agent', message, now]
        );
        await db.query(
          `UPDATE zalo_personal_conversations SET last_message_at = $2 WHERE id = $1`,
          [convRows[0].id, now]
        );
      }

      console.log(`[ZaloPersonalAdapter] Sent reply to uid ${externalId}`);
      return { success: true };
    } catch (err) {
      console.error('[ZaloPersonalAdapter] Failed to send reply:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Start listening for incoming messages on a Zalo personal account.
   * Uses the zca-js listener (already set up for outbound campaigns).
   * @param {number} userId
   */
  async startListener(userId) {
    const session = await this.getActiveSession(userId);
    if (!session?.api) {
      return { success: false, error: 'No active Zalo personal session' };
    }

    const listener = session.api.listener;
    if (!listener?.start) {
      return { success: false, error: 'Listener not available' };
    }

    try {
      zaloAccountSessionService.startAccountListenerSafely({
        accountId: session.accountId,
        api: session.api,
        context: 'zalo_personal_bridge',
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

export default new ZaloPersonalAdapter();

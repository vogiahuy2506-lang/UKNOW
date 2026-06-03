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
    listener.on('message', (message) => {
      const stored = ZaloPersonalAdapter.messageHandlers.get(String(accountId));
      if (stored?.handler) {
        // Access raw data from UserMessage object
        const rawData = message?.data || message;

        // Determine message source type (personal chat vs group)
        const isGroup = rawData?.clientGroupId || rawData?.threadType === 1 || 
                        rawData?.idTo?.startsWith('g_') || 
                        (rawData?.idTo && String(rawData.idTo).length > 15);
        
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
        
        stored.handler(msgData).catch((err) => {
          console.error(`[ZaloPersonalAdapter] Handler error for user ${stored.userId}:`, err.message);
        });
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
      if (api.sendText) {
        await api.sendText({ uid: externalId, message: message.slice(0, 4000) });
      } else {
        throw new Error('Zalo personal API does not support sendText');
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

/**
 * Zalo Personal Bridge Adapter
 *
 * Uses the existing zca-js browser automation (already in use for outbound campaigns)
 * to listen for incoming messages and send replies.
 *
 * Architecture:
 * - Background job polls Zalo personal session for new messages
 * - When new message detected → route to AI via chatRouter
 * - Send reply via zca-js sendText
 *
 * Note: This is a "bridge" because Zalo does NOT have an official public API
 * for personal accounts. This approach simulates interaction via browser automation.
 */
import zaloAccountSessionService from '../../zalo/zaloAccountSession.service.js';
import chatbotRepository from '../../../repositories/ai/chatbot.repository.js';

class ZaloPersonalAdapter {
  /**
   * Get the active Zalo personal session for a user.
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async getActiveSession(userId) {
    const channel = await chatbotRepository.findChannelByType(userId, 'zalo_personal');
    if (!channel?.is_active) return null;

    const accountId = channel.credentials?.zalo_account_id;
    if (!accountId) return null;

    const api = zaloAccountSessionService.getAccountApi(accountId);
    return api ? { api, channel } : null;
  }

  /**
   * Check for new messages in Zalo personal session.
   * @param {number} userId
   * @returns {Promise<object[]>} new messages
   */
  async pollNewMessages(userId) {
    const session = await this.getActiveSession(userId);
    if (!session?.api) {
      return [];
    }

    try {
      const api = session.api;
      if (!api.getLastMessages) return [];

      // Get last messages from the zca-js API
      const messages = await api.getLastMessages({ limit: 10 });
      return messages || [];
    } catch (err) {
      console.warn('[ZaloPersonal] Failed to poll messages:', err.message);
      return [];
    }
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

      console.log(`[ZaloPersonal] Sent reply to uid ${externalId}`);
      return { success: true };
    } catch (err) {
      console.error('[ZaloPersonal] Failed to send reply:', err.message);
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
        accountId: session.channel.credentials.zalo_account_id,
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

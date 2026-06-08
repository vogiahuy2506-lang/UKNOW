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
import zaloPersonalRepository from '../../../repositories/chatbot/zaloPersonal.repository.js';
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
    const zaloSetting = await zaloPersonalRepository.findActiveSessionByUserId(userId);

    if (!zaloSetting) return null;

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

    const zaloSetting = await zaloPersonalRepository.findActiveSessionByAccountId(accountId);

    return zaloSetting ? { api, accountId, zaloSetting } : null;
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
        // Access raw data from UserMessage/GroupMessage object
        const rawData = message?.data || message;

        // IMPORTANT: Check message.type to distinguish personal vs group messages
        // ThreadType.User = 0 (personal), ThreadType.Group = 1 (group), ThreadType.Page = 2
        // Note: message.type is 0 for personal - MUST check with != null, not !== undefined
        const msgTypeValue = message?.type;
        const isGroupByType = msgTypeValue != null && msgTypeValue !== 0;
        
        // If message.type indicates group (ThreadType.Group = 1, ThreadType.Page = 2), treat as group
        // This is the AUTHORITATIVE check - zca-js separates personal vs group messages at the protocol level
        if (isGroupByType) {
          console.log(`[ZaloPersonalAdapter] ⚠️ Group/Page message detected via message.type=${msgTypeValue} - skipping for personal chatbot`);
          
          // Still save to DB for history, but don't call handler for AI routing
          try {
            await this.saveMessageToDatabase(stored.userId, accountId, {
              ...rawData,
              isGroup: true,
              is_group: true,
              msgType: rawData.msgType || rawData.type || 1,
            });
          } catch (dbErr) {
            console.error(`[ZaloPersonalAdapter] DB save error:`, dbErr.message);
          }
          return;
        }
        
        // Additional fallback checks for explicit group indicators in raw data
        // (for edge cases where zca-js might not set message.type correctly)
        const isGroupFromRaw = Boolean(
          rawData?.clientGroupId || 
          rawData?.threadType === 1 ||     // 1 = group in zca-js
          rawData?.threadType === 2 ||     // 2 = community in zca-js
          rawData?.idTo?.startsWith('g_') ||
          rawData?.idTo?.startsWith('group_') ||
          rawData?.idTo?.startsWith('c_') ||
          rawData?.isGroup === true ||
          rawData?.isPublicGroup === true ||
          rawData?.isChatRoom === true ||
          (rawData?.zaloExt && rawData.zaloExt.isGroup === true) ||
          (rawData?.zaloExt && rawData.zaloExt.threadType === 1) ||
          rawData?.gridId ||
          rawData?.groupId
        );
        
        // Extract groupId with explicit indicators only
        let detectedGroupId = null;
        if (rawData?.clientGroupId) {
          detectedGroupId = rawData.clientGroupId;
        } else if (rawData?.groupId) {
          detectedGroupId = rawData.groupId;
        } else if (rawData?.gridId) {
          detectedGroupId = rawData.gridId;
        } else if (rawData?.idTo?.startsWith('g_')) {
          detectedGroupId = rawData.idTo;
        } else if (rawData?.idTo?.startsWith('group_')) {
          detectedGroupId = rawData.idTo;
        } else if (rawData?.zaloExt?.groupId) {
          detectedGroupId = rawData.zaloExt.groupId;
        }
        
        // Use isGroupFromRaw as fallback detection (only block if explicit group indicators found)
        const isGroup = isGroupFromRaw;
        
        if (isGroup) {
          console.log(`[ZaloPersonalAdapter] ⚠️ Group message detected via raw data indicators - skipping for personal chatbot`);
          try {
            await this.saveMessageToDatabase(stored.userId, accountId, {
              ...rawData,
              isGroup: true,
              is_group: true,
              groupId: detectedGroupId,
              msgType: rawData.msgType || rawData.type || 1,
            });
          } catch (dbErr) {
            console.error(`[ZaloPersonalAdapter] DB save error:`, dbErr.message);
          }
          return;
        }
        
        console.log(`[ZaloPersonalAdapter] Message detection: isGroup=${isGroup}, msgTypeValue=${msgTypeValue}, idTo=${rawData?.idTo}, uidFrom=${rawData?.uidFrom}`);
        
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
          type: message?.type,  // ThreadType: 0=personal, 1=group, 2=page
          threadId: rawData.threadId || rawData.idTo,
          // Source context: personal or group
          isGroup: false, // Explicitly false since we already filtered out group messages
          is_group: false,
          groupId: null,
          groupName: null,
          // Full sender info
          senderName: rawData.displayName || rawData.alias || rawData.coinsName || null,
          senderAvatar: rawData.avatarThumb || rawData.avatar || null,
          // Message details
          msgType: rawData.msgType || rawData.type || 1,
          attachmentUrl: rawData.attachmentUrl || rawData.thumb || rawData.photo || null,
          // Original message object for debugging
          _raw: rawData,
        };
        
        console.log(`[ZaloPersonalAdapter] Incoming personal message from ${msgData.fromUid}: ${String(msgData.content || '').substring(0, 50)}`);
        
        // Save to database for unified inbox
        try {
          await this.saveMessageToDatabase(stored.userId, accountId, msgData);
        } catch (dbErr) {
          console.error(`[ZaloPersonalAdapter] DB save error:`, dbErr.message);
        }
        
        // Call custom handler if registered
        if (stored.handler) {
          console.log(`[ZaloPersonalAdapter] Calling handler for account ${accountId}...`);
          stored.handler(msgData).catch((err) => {
            console.error(`[ZaloPersonalAdapter] Handler error for user ${stored.userId}:`, err.stack || err.message);
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

    // Use the isGroup flag from the normalized msgData
    const isGroup = msgData.isGroup === true;
    const groupId = msgData.groupId || null;
    const groupName = msgData.groupName || null;

    // Determine externalId based on source:
    // - Group: use senderId to distinguish each person in the group
    // - Personal: use senderId
    // Format: "group_{groupId}_{senderId}" for group messages
    const externalId = isGroup && groupId
      ? `group_${groupId}_${msgData.fromUid}`
      : String(msgData.fromUid);

    // Determine display name:
    // - Group: show sender name + group name
    // - Personal: show sender name
    let displayName;
    if (isGroup && msgData.groupId) {
      const senderDisplay = msgData.senderName || `User ${msgData.fromUid}`;
      const groupDisplay = msgData.groupName || `Nhóm ${msgData.groupId}`;
      displayName = `${senderDisplay} (${groupDisplay})`;
    } else {
      displayName = msgData.senderName || null;
    }

    // Get or create conversation
    let conversation = await zaloPersonalRepository.findConversation(zaloSettingId, externalId);

    let conversationId;
    if (!conversation) {
      // Create new conversation
      const newConv = await zaloPersonalRepository.insertConversation({
        userId,
        zaloSettingId,
        externalId,
        visitorName: displayName,
        visitorInfo: JSON.stringify({
          sender_name: msgData.senderName,
          sender_avatar: msgData.senderAvatar,
          is_group: isGroup,
          group_id: msgData.groupId || null,
          group_name: msgData.groupName || null,
        }),
        now,
      });
      conversationId = newConv.id;
    } else {
      conversationId = conversation.id;
      // Update last_message_at and visitor info if changed
      const existingInfo = typeof conversation.visitor_info === 'string' 
        ? JSON.parse(conversation.visitor_info) 
        : (conversation.visitor_info || {});
      
      // Update if is_group status changed or group info is new
      const needsUpdate = (
        existingInfo.is_group !== isGroup ||
        (isGroup && existingInfo.group_id !== msgData.groupId) ||
        (isGroup && !existingInfo.group_name && msgData.groupName)
      );

      if (needsUpdate) {
        await zaloPersonalRepository.touchConversation(
          conversationId,
          now,
          displayName,
          {
            sender_name: msgData.senderName,
            sender_avatar: msgData.senderAvatar,
            is_group: isGroup,
            group_id: msgData.groupId || null,
            group_name: msgData.groupName || null,
          }
        );
      } else {
        await zaloPersonalRepository.touchConversation(conversationId, now);
      }
    }

    // Save message
    const msgRow = await zaloPersonalRepository.insertMessage({
      conversationId,
      userId,
      zaloSettingId,
      role: 'visitor',
      content: msgData.content || msgData.message || '',
      externalId: msgData.messageId || msgData.msgId,
      externalTs: msgData.timestamp ? new Date(msgData.timestamp) : now,
      metadata: JSON.stringify({
        _raw: msgData._raw,
        sender_name: msgData.senderName,
        is_group: msgData.isGroup || false,
      }),
      createdAt: msgData.timestamp ? new Date(msgData.timestamp) : now,
    });

    return {
      conversationId,
      messageId: msgRow.id,
    };
  }

  /**
   * Send a reply via Zalo personal account.
   * @param {object} params
   * @param {string} params.externalId - Zalo user ID (uid)
   * @param {string} params.message - text reply
   * @param {number} params.userId
   */
  async sendReply({ externalId, message, userId, conversationInfo }) {
    const session = await this.getActiveSession(userId);
    if (!session?.api) {
      return { success: false, error: 'No active Zalo personal session' };
    }

    try {
      const api = session.api;
      const payload = String(message || '').slice(0, 4000);

      // Check if this is a group conversation
      const isGroup = conversationInfo?.is_group;
      let sendTarget = externalId;

      // IMPORTANT: For group messages, we should NOT reply automatically!
      // Group messages should be handled by the group chatbot, not personal chatbot
      if (isGroup) {
        console.log(`[ZaloPersonalAdapter] ⚠️ Blocked reply to group message - group chatbots should be handled separately`);
        console.log(`[ZaloPersonalAdapter] group_id=${conversationInfo?.group_id}, externalId=${externalId}`);
        return { success: false, error: 'Group messages should not trigger personal chatbot replies' };
      }
      
      // For personal messages, send to the sender directly
      // If externalId is in group format, extract the actual sender ID
      if (externalId?.startsWith('group_')) {
        const parts = externalId.split('_');
        if (parts.length >= 3) {
          sendTarget = parts.slice(2).join('_'); // Get sender ID after "group_{groupId}_{senderId}"
          console.log(`[ZaloPersonalAdapter] Extracted personal sender ID from group format: ${sendTarget}`);
        }
      }

      await api.sendMessage(payload, sendTarget);

      // Also save the sent message to database
      const now = new Date().toISOString();
      const conversation = await zaloPersonalRepository.findConversation(session.accountId, externalId);

      if (conversation) {
        await zaloPersonalRepository.insertAgentMessage({
          conversationId: conversation.id,
          userId,
          zaloSettingId: session.accountId,
          content: message,
          now,
        });
        await zaloPersonalRepository.touchConversation(conversation.id, now);
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

  /**
   * Delete a conversation and its messages.
   * @param {number} userId
   * @param {number|string} conversationId
   * @returns {Promise<boolean>}
   */
  async deleteConversation(userId, conversationId) {
    try {
      const convId = parseInt(conversationId);
      if (isNaN(convId)) {
        throw new Error('Invalid conversation ID');
      }
      return await zaloPersonalRepository.deleteConversation(convId, userId);
    } catch (err) {
      console.error('[ZaloPersonalAdapter] deleteConversation error:', err);
      throw err;
    }
  }
}

export default new ZaloPersonalAdapter();

/**
 * Zalo Personal Sync Service
 * 
 * Sync danh sách bạn bè, nhóm và tin nhắn cũ từ Zalo Web qua zca-js API.
 * 
 * Methods:
 * - syncContacts - đồng bộ danh sách bạn bè
 * - syncGroups - đồng bộ danh sách nhóm + thành viên
 * - syncChatHistory - đồng bộ tin nhắn cũ (nếu có API)
 */
import db from '../../config/database.js';
import zaloAccountSessionService from '../zalo/zaloAccountSession.service.js';

class ZaloPersonalSyncService {
  /**
   * Get active zca-js API for an account
   */
  getApi(accountId) {
    return zaloAccountSessionService.getAccountApi(accountId);
  }

  /**
   * Sync danh sách bạn bè từ Zalo Web
   * @param {number} accountId - zalo_setting.id
   * @param {number} userId
   */
  async syncContacts(accountId, userId) {
    const api = this.getApi(accountId);
    if (!api) {
      console.warn('[ZaloSync] syncContacts: No zca-js API for account', accountId);
      throw new Error('Zalo session not connected');
    }

    try {
      console.log('[ZaloSync] Calling api.getAllFriends()...');
      const friends = await api.getAllFriends();
      console.log(`[ZaloSync] getAllFriends returned ${friends?.length || 0} friends`);

      if (!friends?.length) {
        return { synced: 0, message: 'No friends found or API returned empty' };
      }

      return { synced: friends.length, friends };
    } catch (error) {
      console.error('[ZaloSync] Error syncing contacts:', error.message, error.stack);
      throw error;
    }
  }

  /**
   * Sync danh sách nhóm từ Zalo Web
   * @param {number} accountId - zalo_setting.id
   * @param {number} userId
   */
  async syncGroups(accountId, userId) {
    const api = this.getApi(accountId);
    if (!api) {
      console.warn('[ZaloSync] syncGroups: No zca-js API for account', accountId);
      throw new Error('Zalo session not connected');
    }

    try {
      console.log('[ZaloSync] Calling api.getAllGroups()...');
      const groupsResponse = await api.getAllGroups();
      const groupIds = Object.keys(groupsResponse?.gridVerMap || {});
      console.log(`[ZaloSync] getAllGroups returned ${groupIds.length} groups`);

      if (!groupIds.length) {
        return { synced: 0, groups: [], message: 'No groups found' };
      }

      // Get detailed info for each group (includes member list)
      const groups = [];
      for (const groupId of groupIds.slice(0, 10)) { // Limit to 10 for performance
        try {
          const groupInfo = await api.getGroupInfo(groupId);
          const info = groupInfo?.gridInfoMap?.[groupId];
          if (info) {
            groups.push({
              groupId,
              groupName: info.groupName || `Nhóm ${groupId}`,
              memberCount: info.memVerList?.length || 0,
            });
          }
        } catch (groupErr) {
          console.warn(`[ZaloSync] Failed to get info for group ${groupId}:`, groupErr.message);
        }
      }

      return { synced: groups.length, groups, totalGroups: groupIds.length };
    } catch (error) {
      console.error('[ZaloSync] Error syncing groups:', error.message, error.stack);
      throw error;
    }
  }

  /**
   * Sync tin nhắn cũ từ một conversation cụ thể
   * 
   * @param {number} accountId - zalo_setting.id
   * @param {number} userId
   * @param {string} externalId - userId hoặc groupId của conversation
   * @param {boolean} isGroup
   * @param {object} options - { limit, beforeMsgId }
   */
  async syncChatHistory(accountId, userId, externalId, isGroup = false, options = {}) {
    const api = this.getApi(accountId);
    if (!api) {
      throw new Error('Zalo session not connected');
    }

    const { limit = 50, beforeMsgId } = options;

    try {
      // For group messages, use getGroupChatHistory
      if (isGroup) {
        console.log(`[ZaloSync] Calling api.getGroupChatHistory(${externalId}, ${limit})...`);
        
        // zca-js getGroupChatHistory signature: getGroupChatHistory(groupId, limit, beforeMsgId?)
        const history = await api.getGroupChatHistory(externalId, limit, beforeMsgId);
        
        console.log(`[ZaloSync] getGroupChatHistory returned ${history?.length || 0} messages`);
        
        // Save to database
        const saved = await this.saveGroupChatHistory(accountId, userId, externalId, history || []);
        
        return { 
          synced: saved, 
          total: history?.length || 0,
          type: 'group',
          groupId: externalId 
        };
      }

      // For personal messages - zca-js doesn't have direct personal chat history API
      // Fallback: get context from Zalo Web
      console.log(`[ZaloSync] Personal chat history sync for ${externalId} - zca-js limitation`);
      return { 
        synced: 0, 
        message: 'Personal chat history sync requires zca-js browser interaction',
        type: 'personal'
      };
    } catch (error) {
      console.error('[ZaloSync] Error syncing chat history:', error.message);
      throw error;
    }
  }

  /**
   * Save group chat history to database
   */
  async saveGroupChatHistory(accountId, userId, groupId, messages) {
    const { ZaloPersonalRepository } = await import('../../repositories/chatbot/zaloPersonal.repository.js');
    const zaloPersonalRepo = ZaloPersonalRepository;
    
    let saved = 0;
    const now = new Date().toISOString();

    for (const msg of messages) {
      try {
        // Check if message already exists
        const existing = await zaloPersonalRepo.findMessageByExternalId(msg.msgId, accountId);
        if (existing) continue;

        // Extract sender info
        const senderInfo = this.extractSenderInfo(msg);
        
        // Create externalId format for group: "group_{groupId}_{senderId}"
        const senderId = senderInfo.senderId || msg.uidFrom;
        const externalId = `group_${groupId}_${senderId}`;

        // Get or create conversation
        let conversation = await zaloPersonalRepo.findConversation(accountId, externalId);
        
        if (!conversation) {
          const visitorInfo = {
            source: 'zalo_group',
            is_group: true,
            group_id: groupId,
            group_name: null, // Will be backfilled later
            sender_id: senderId,
            sender_name: senderInfo.name,
          };
          
          conversation = await zaloPersonalRepo.insertConversation({
            userId,
            zaloSettingId: accountId,
            externalId,
            visitorName: senderInfo.name || `User ${senderId}`,
            visitorInfo: JSON.stringify(visitorInfo),
            now,
          });
        }

        // Extract attachments
        const attachments = this.extractAttachments(msg);

        // Save message
        await zaloPersonalRepo.insertMessage({
          conversationId: conversation.id,
          userId,
          zaloSettingId: accountId,
          role: msg.isSelf ? 'agent' : 'visitor',
          content: msg.content || msg.msg || '',
          externalId: msg.msgId,
          externalTs: msg.timestamp ? new Date(msg.timestamp) : now,
          metadata: JSON.stringify({
            sender_name: senderInfo.name,
            sender_id: senderId,
            is_group: true,
            group_id: groupId,
            msg_type: msg.msgType,
            attachments,
          }),
          createdAt: msg.timestamp ? new Date(msg.timestamp) : now,
        });

        saved++;
      } catch (err) {
        console.warn(`[ZaloSync] Failed to save message ${msg.msgId}:`, err.message);
      }
    }

    return saved;
  }

  /**
   * Extract sender info from message
   */
  extractSenderInfo(msg) {
    return {
      senderId: msg.uidFrom || msg.fromUid,
      name: msg.displayName || msg.alias || msg.coinsName || null,
      avatar: msg.avatarThumb || null,
    };
  }

  /**
   * Extract attachments from message
   */
  extractAttachments(msg) {
    const attachments = [];

    // Sticker
    if (msg.msgType === 11 || msg.stickerData) {
      attachments.push({
        type: 'sticker',
        stickerId: msg.stickerData?.id,
        packageId: msg.stickerData?.catId,
        url: msg.stickerData?.thumbUrl,
      });
    }

    // Image
    if (msg.msgType === 2 || msg.thumbUrl) {
      attachments.push({
        type: 'image',
        url: msg.photo || msg.thumbUrl,
        thumbUrl: msg.thumbUrl,
      });
    }

    // Video
    if (msg.msgType === 3 || msg.videoUrl) {
      attachments.push({
        type: 'video',
        url: msg.videoUrl,
        thumbUrl: msg.thumbUrl,
      });
    }

    // Audio
    if (msg.msgType === 4 || msg.audioUrl) {
      attachments.push({
        type: 'audio',
        url: msg.audioUrl,
        duration: msg.duration,
      });
    }

    return attachments;
  }

  /**
   * Find message by external ID
   */
  async findMessageByExternalId(msgId, accountId) {
    const { rows } = await db.query(
      `SELECT * FROM zalo_personal_messages 
       WHERE external_id = $1 AND id_zalo_setting = $2 LIMIT 1`,
      [msgId, accountId]
    );
    return rows[0] || null;
  }

  /**
   * Full sync - đồng bộ tất cả
   */
  async fullSync(accountId, userId) {
    const results = {
      contacts: null,
      groups: null,
      errors: [],
    };

    // Sync contacts
    try {
      results.contacts = await this.syncContacts(accountId, userId);
    } catch (e) {
      results.errors.push({ type: 'contacts', error: e.message });
    }

    // Sync groups
    try {
      results.groups = await this.syncGroups(accountId, userId);
    } catch (e) {
      results.errors.push({ type: 'groups', error: e.message });
    }

    return results;
  }
}

export default new ZaloPersonalSyncService();

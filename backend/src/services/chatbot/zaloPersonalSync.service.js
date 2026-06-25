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
      const maxGroups = Math.max(1, Number(process.env.ZALO_GROUP_SYNC_LIMIT || 200));
      for (const groupId of groupIds.slice(0, maxGroups)) {
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

      const persisted = await this.persistGroups(accountId, groups);
      const conversationsUpdated = await this.backfillGroupConversationNames(accountId, groups);

      return { synced: groups.length, persisted, conversationsUpdated, groups, totalGroups: groupIds.length };
    } catch (error) {
      console.error('[ZaloSync] Error syncing groups:', error.message, error.stack);
      throw error;
    }
  }

  async persistGroups(accountId, groups = []) {
    let persisted = 0;

    for (const group of groups) {
      const groupId = String(group.groupId || '').trim();
      const groupName = String(group.groupName || '').trim();
      if (!groupId || !groupName) continue;

      const updateResult = await db.query(
        `UPDATE zalo_groups
         SET group_name = $3, member_count = $4, updated_at = NOW()
         WHERE id_zalo_setting = $1 AND group_id = $2`,
        [accountId, groupId, groupName, group.memberCount || 0]
      );

      if (updateResult.rowCount === 0) {
        await db.query(
          `INSERT INTO zalo_groups (id_zalo_setting, group_id, group_name, member_count)
           VALUES ($1, $2, $3, $4)`,
          [accountId, groupId, groupName, group.memberCount || 0]
        );
      }

      persisted++;
    }

    return persisted;
  }

  async backfillGroupConversationNames(accountId, groups = []) {
    let updated = 0;

    for (const group of groups) {
      const groupId = String(group.groupId || '').trim();
      const groupName = String(group.groupName || '').trim();
      if (!groupId || !groupName || groupName === 'Nhóm' || groupName.startsWith('Nhóm group_')) continue;

      const result = await db.query(
        `UPDATE zalo_personal_conversations
         SET visitor_name = $3,
             visitor_info = jsonb_set(
               COALESCE(visitor_info::jsonb, '{}'::jsonb),
               '{group_name}',
               to_jsonb($3::text),
               true
             )
         WHERE id_zalo_setting = $1
           AND (
             external_id = $2
             OR external_id = $4
             OR visitor_info::jsonb->>'group_id' = $2
             OR visitor_info::jsonb->>'group_id' = $4
             OR visitor_info::jsonb->>'groupId' = $2
             OR visitor_info::jsonb->>'groupId' = $4
           )
           AND (
             visitor_name IS NULL
             OR visitor_name LIKE 'Nhóm %'
             OR visitor_info::jsonb->>'group_name' IS NULL
             OR visitor_info::jsonb->>'group_name' = ''
           )`,
        [accountId, groupId, groupName, `group_${groupId}`]
      );

      updated += result.rowCount || 0;
    }

    return updated;
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
        
        // Create externalId format for group: "group_{groupId}" — all members share ONE conversation
        const senderId = senderInfo.senderId || msg.uidFrom;
        const externalId = `group_${groupId}`;

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
            // Use group name as visitorName so all members land in the same conversation
            visitorName: `Nhóm ${groupId}`,
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

  /**
   * Get group members info from Zalo API
   * @param {number} accountId - zalo_setting.id
   * @param {string} groupId - Zalo group ID
   */
  async getGroupMembers(accountId, groupId) {
    const api = this.getApi(accountId);
    if (!api) {
      throw new Error('Zalo session not connected');
    }

    try {
      console.log(`[ZaloSync] getGroupMembers: Calling api.getGroupInfo(${groupId})...`);
      const result = await api.getGroupInfo(groupId);
      
      const groupInfo = result?.gridInfoMap?.[groupId] || result;
      
      if (!groupInfo) {
        return {
          groupId,
          groupName: null,
          members: [],
          memberCount: 0,
        };
      }

      const members = (groupInfo.memVerList || []).map(mem => ({
        uid: mem.uid || mem.userId,
        displayName: mem.displayName || mem.zaloName || mem.name || `User ${mem.uid}`,
        avatar: mem.avatarThumb || null,
        isAdmin: mem.isAdmin || false,
        role: mem.role || (mem.isAdmin ? 'admin' : 'member'),
      }));

      return {
        groupId,
        groupName: groupInfo.groupName || groupInfo.name || null,
        members,
        memberCount: members.length,
      };
    } catch (error) {
      console.error('[ZaloSync] getGroupMembers error:', error.message);
      throw error;
    }
  }

  /**
   * Get unique senders from group conversation messages
   * Returns list of sender IDs with their names from DB
   * @param {number} accountId
   * @param {string} groupId
   */
  async getGroupSendersFromDb(accountId, groupId) {
    const { rows } = await db.query(
      `SELECT DISTINCT 
         (metadata->>'sender_id') as sender_id,
         (metadata->>'sender_name') as sender_name
       FROM zalo_personal_messages
       WHERE id_zalo_setting = $1 
         AND metadata->>'is_group' = 'true'
         AND metadata->>'group_id' = $2
         AND metadata->>'sender_id' IS NOT NULL
       ORDER BY sender_name`,
      [accountId, groupId]
    );
    
    return rows.map(row => ({
      senderId: row.sender_id,
      senderName: row.sender_name || `User ${row.sender_id}`,
    }));
  }
}

export default new ZaloPersonalSyncService();

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
   * Note: zca-js không có API getChatHistory trực tiếp
   * Tin nhắn cũ được sync qua event listener khi browse chat history trên Zalo Web
   * 
   * @param {number} accountId - zalo_setting.id
   * @param {number} userId
   * @param {string} externalId - userId hoặc groupId của conversation
   * @param {boolean} isGroup
   */
  async syncChatHistory(accountId, userId, externalId, isGroup = false) {
    const api = this.getApi(accountId);
    if (!api) {
      throw new Error('Zalo session not connected');
    }

    try {
      // zca-js listener sẽ emit tin nhắn khi user browse chat trên Zalo Web
      // Để sync lịch sử, cần trigger Zalo Web load old messages
      
      // Alternative: get context/chats from Zalo Web
      // const chats = await api.getChats?.();
      
      console.log(`[ZaloSync] Chat history sync for ${externalId} (group: ${isGroup}) - requires manual trigger`);
      return { synced: 0, message: 'Chat history sync requires browsing Zalo Web' };
    } catch (error) {
      console.error('[ZaloSync] Error syncing chat history:', error.message);
      throw error;
    }
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

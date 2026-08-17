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
import campaignZaloSenderService from '../campaign/campaignZaloSender.service.js';
import {
  extractGroupNameFromApiResult,
  isPlaceholderGroupName,
  normalizeZaloGroupId,
} from '../../utils/zaloGroupName.util.js';


/** Log từng nhóm chỉ khi bật cờ — cron 10 phút/lần sẽ ngập log nếu để mặc định. */
const SYNC_VERBOSE = String(process.env.ZALO_SYNC_VERBOSE || '').toLowerCase() === 'true';

/** Số lần 404 liên tiếp trước khi ngừng thử lại một nhóm. */
const GROUP_404_STRIKES = 3;
/** Thời gian tạm bỏ qua nhóm đã 404 quá số lần cho phép. */
const GROUP_404_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Nhóm không truy cập được (đã rời, đã giải tán, hoặc id cũ trong DB).
 * Giữ trong RAM: mất khi restart là chấp nhận được — tệ nhất là thử lại một vòng.
 * key = `${accountId}:${groupId}` → { strikes, skipUntil }
 */
const unavailableGroups = new Map();

/** @returns {boolean} true nếu lỗi là 404 từ Zalo (nhóm không còn truy cập được). */
function isGroupNotFoundError(error) {
  if (error?.response?.status === 404) return true;
  return /status code 404/i.test(String(error?.message || ''));
}

/**
 * zca-js bug: một số nhóm trả data thiếu groupMsgs → crash trong SDK
 * ("Cannot read properties of undefined (reading 'length')").
 * @returns {boolean}
 */
function isGroupHistoryMalformedError(error) {
  return /reading 'length'|groupMsgs/i.test(String(error?.message || ''));
}

/**
 * zca-js getGroupChatHistory trả { groupMsgs: GroupMessage[] }, không phải mảng thuần.
 * GroupMessage bọc raw ở `.data` + `isSelf` trên wrapper.
 * @param {unknown} history
 * @returns {object[]}
 */
export function extractGroupHistoryMessages(history) {
  if (!history) return [];
  if (Array.isArray(history)) return history.map(normalizeGroupHistoryItem).filter(Boolean);
  const list = history.groupMsgs || history.messages || history.data?.groupMsgs || [];
  if (!Array.isArray(list)) return [];
  return list.map(normalizeGroupHistoryItem).filter(Boolean);
}

/**
 * @param {unknown} msg
 * @returns {object|null}
 */
export function normalizeGroupHistoryItem(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const data = msg.data && typeof msg.data === 'object' ? msg.data : msg;
  let content = data.content ?? data.msg ?? data.message ?? '';
  if (typeof content === 'object' && content !== null) {
    content = content.title || content.text || content.description || JSON.stringify(content);
  }
  const msgId = data.msgId ?? data.id ?? msg.msgId ?? null;
  if (msgId == null || msgId === '') return null;
  const tsRaw = data.ts ?? data.timestamp ?? data.createdAt ?? msg.timestamp;
  const tsNum = Number(tsRaw);
  return {
    msgId: String(msgId),
    content: String(content || ''),
    uidFrom: data.uidFrom ?? data.fromUid ?? msg.uidFrom,
    displayName: data.dName || data.displayName || data.alias || null,
    avatarThumb: data.avatarThumb || data.avatar || null,
    timestamp: Number.isFinite(tsNum) && tsNum > 0 ? tsNum : Date.now(),
    msgType: data.msgType,
    isSelf: msg.isSelf === true,
    stickerData: data.stickerData,
  };
}


/** @internal test helper — Map sống theo vòng đời tiến trình nên phải dọn giữa các bài test. */
export function _resetGroupAvailabilityForTests() {
  unavailableGroups.clear();
}

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
        return { synced: 0, friends: [], message: 'No friends found or API returned empty' };
      }

      const persisted = await this.persistFriends(accountId, friends);
      return { synced: persisted, friends };
    } catch (error) {
      console.error('[ZaloSync] Error syncing contacts:', error.message, error.stack);
      throw error;
    }
  }

  /**
   * Lưu danh sách bạn bè vào DB (bảng zalo_friends) theo lô
   * @param {number} accountId - zalo_setting.id
   * @param {Array} friends - raw array from api.getAllFriends()
   */
  async persistFriends(accountId, friends = []) {
    const rawList = Array.isArray(friends) ? friends : [];
    if (!rawList.length) return 0;

    const normalizedList = campaignZaloSenderService.normalizeFriends(rawList);
    let skippedCount = 0;
    // Khử trùng theo friendId: Postgres ném "ON CONFLICT DO UPDATE command cannot affect
    // row a second time" nếu một câu INSERT gộp lô chứa hai dòng cùng khoá unique.
    // getAllFriends() phân trang nên có thể trả trùng — bản ghi sau thắng.
    const rowByFriendId = new Map();
    const now = new Date();

    normalizedList.forEach((item, index) => {
      const friendId = String(item.uid || '').trim();
      const raw = item.raw || rawList[index] || {};
      if (!friendId) {
        skippedCount++;
        return;
      }
      const displayName = String(item.display_name || '').trim() || null;
      const phone = String(item.phoneNumber || '').trim() || null;
      const avatarUrl = String(raw.avatar || raw.avatarUrl || raw.avatar_url || raw.avatar_120 || raw.profile?.avatar || raw.data?.avatar || '').trim() || null;
      rowByFriendId.set(friendId, {
        friendId,
        displayName,
        phone,
        avatarUrl,
      });
    });

    const validRows = Array.from(rowByFriendId.values());

    if (skippedCount > 0) {
      const sampleKeys = rawList[0] && typeof rawList[0] === 'object' ? Object.keys(rawList[0]) : [];
      console.warn(`[ZaloSync] persistFriends skipped ${skippedCount}/${rawList.length} items without valid UID. Sample keys from first item:`, sampleKeys);
    }

    if (!validRows.length) return 0;

    // Batch insert theo lô 500
    const BATCH_SIZE = 500;
    let persisted = 0;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const chunk = validRows.slice(i, i + BATCH_SIZE);
      const valueSets = [];
      const params = [accountId, now];
      let paramIdx = 3;

      for (const row of chunk) {
        valueSets.push(`($1, $${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $2, $2)`);
        params.push(row.friendId, row.displayName, row.phone, row.avatarUrl);
        paramIdx += 4;
      }

      await db.query(
        `INSERT INTO zalo_friends (id_zalo_setting, friend_id, display_name, phone, avatar_url, synced_at, updated_at)
         VALUES ${valueSets.join(', ')}
         ON CONFLICT (id_zalo_setting, friend_id)
         DO UPDATE SET
           display_name = EXCLUDED.display_name,
           phone = COALESCE(EXCLUDED.phone, zalo_friends.phone),
           avatar_url = COALESCE(EXCLUDED.avatar_url, zalo_friends.avatar_url),
           synced_at = EXCLUDED.synced_at,
           updated_at = EXCLUDED.updated_at`,
        params
      );
      persisted += chunk.length;
    }

    return persisted;
  }

  /**
   * Lấy danh sách bạn bè đã lưu trong DB (có phân trang + tìm kiếm)
   * @param {Object} params
   * @param {number} params.accountId - zalo_setting.id
   * @param {number} params.userId - user sở hữu tài khoản
   * @param {string} [params.search] - từ khóa tìm kiếm tên / SĐT
   * @param {number} [params.page] - trang (1-based)
   * @param {number} [params.limit] - số lượng mỗi trang
   */
  async listFriends({ accountId, userId, search = '', page = 1, limit = 50 }) {
    const settingRes = await db.query(
      `SELECT id, name, zalo_name, phone_number
       FROM zalo_settings
       WHERE id = $1 AND id_user = $2`,
      [accountId, userId]
    );
    if (!settingRes.rows.length) {
      const error = new Error('Không tìm thấy tài khoản Zalo hoặc không có quyền truy cập');
      error.statusCode = 404;
      throw error;
    }

    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 1000);
    const safePage = Math.max(1, Number(page) || 1);
    const offset = (safePage - 1) * safeLimit;
    const query = String(search || '').trim();

    let countSql = `SELECT COUNT(*)::int AS total FROM zalo_friends WHERE id_zalo_setting = $1`;
    let dataSql = `
      SELECT id, friend_id, display_name, phone, avatar_url, synced_at, created_at
      FROM zalo_friends
      WHERE id_zalo_setting = $1
    `;
    const params = [accountId];

    if (query) {
      params.push(`%${query}%`);
      const searchClause = ` AND (display_name ILIKE $2 OR phone ILIKE $2 OR friend_id ILIKE $2)`;
      countSql += searchClause;
      dataSql += searchClause;
    }

    dataSql += ` ORDER BY display_name ASC NULLS LAST, id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const dataParams = [...params, safeLimit, offset];

    const [countRes, dataRes] = await Promise.all([
      db.query(countSql, params),
      db.query(dataSql, dataParams),
    ]);

    const total = countRes.rows[0]?.total || 0;
    const items = dataRes.rows;

    const syncRes = await db.query(
      `SELECT MAX(synced_at) AS last_synced_at FROM zalo_friends WHERE id_zalo_setting = $1`,
      [accountId]
    );

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 1,
      lastSyncedAt: syncRes.rows[0]?.last_synced_at || null,
    };
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
          const info = groupInfo?.gridInfoMap?.[groupId]
            || groupInfo?.groupInfoMap?.[groupId]
            || groupInfo;
          const groupName = extractGroupNameFromApiResult(groupInfo, groupId);
          if (info || groupName) {
            groups.push({
              groupId,
              groupName,
              memberCount: info?.memVerList?.length || 0,
            });
          }
        } catch (groupErr) {
          console.warn(`[ZaloSync] Failed to get info for group ${groupId}:`, groupErr.message);
        }
      }

      const enrichedGroups = await campaignZaloSenderService.enrichGroupNames(
        api,
        groups.map((group) => ({
          groupId: group.groupId,
          groupName: group.groupName,
          version: '',
        }))
      );

      const resolvedGroups = enrichedGroups.map((group, index) => ({
        groupId: group.groupId,
        groupName: group.groupName,
        memberCount: groups[index]?.memberCount || 0,
      }));

      const persisted = await this.persistGroups(accountId, resolvedGroups);

      // Đặt tên hội thoại là phụ trợ — không được kéo sập syncGroups / syncAllGroupHistory
      let conversationsUpdated = 0;
      try {
        conversationsUpdated = await this.backfillGroupConversationNames(accountId, resolvedGroups);
      } catch (backfillErr) {
        console.warn(
          `[ZaloSync] backfillGroupConversationNames failed (non-fatal) account=${accountId}:`,
          backfillErr?.message || backfillErr
        );
      }

      return {
        synced: resolvedGroups.length,
        persisted,
        conversationsUpdated,
        groups: resolvedGroups,
        totalGroups: groupIds.length,
      };
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
      if (!groupId || !groupName || isPlaceholderGroupName(groupName, groupId)) continue;

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
      if (!groupId || !groupName || isPlaceholderGroupName(groupName, groupId)) continue;

      const result = await db.query(
        `UPDATE zalo_personal_conversations
         -- $3 phải ép kiểu text ở CẢ HAI chỗ: visitor_name là varchar(255) nên
         -- Postgres suy ra varchar, còn to_jsonb($3::text) suy ra text → xung đột
         -- "inconsistent types deduced for parameter $3" và chết cả syncGroups.
         SET visitor_name = $3::text,
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
        const { bare, prefixed } = normalizeZaloGroupId(externalId);
        const grid = bare || String(externalId || '').trim();
        if (!grid) {
          throw new Error('Thiếu group id để đồng bộ lịch sử nhóm');
        }

        if (SYNC_VERBOSE) {
          console.log(`[ZaloSync] Calling api.getGroupChatHistory(${grid}, ${limit})...`);
        }

        // zca-js: getGroupChatHistory(groupId, count) → { groupMsgs: GroupMessage[] }
        // (không nhận beforeMsgId; tham số 3 từng truyền là dead code)
        void beforeMsgId;
        let history;
        try {
          history = await api.getGroupChatHistory(grid, limit);
        } catch (apiErr) {
          // zca-js: data.groupMsgs undefined → throw trước khi trả về
          if (isGroupHistoryMalformedError(apiErr)) {
            console.warn(`[ZaloSync] Bỏ qua nhóm ${grid}: response thiếu groupMsgs (${apiErr.message})`);
            return {
              synced: 0,
              total: 0,
              type: 'group',
              groupId: prefixed || `group_${grid}`,
              skippedMalformed: true,
            };
          }
          throw apiErr;
        }
        const messages = extractGroupHistoryMessages(history);

        if (SYNC_VERBOSE) {
          console.log(`[ZaloSync] getGroupChatHistory returned ${messages.length} messages`);
        }

        const saved = await this.saveGroupChatHistory(accountId, userId, prefixed || `group_${grid}`, messages);

        return {
          synced: saved,
          total: messages.length,
          type: 'group',
          groupId: prefixed || `group_${grid}`,
        };
      }

      // For personal messages — zca-js không có API lịch sử 1-1.
      // Gắn lại listener realtime để tin mới về hộp thư (tin cũ không kéo được).
      console.log(`[ZaloSync] Personal chat: no history API — rebinding inbox listener for ${accountId}`);
      let listenerRebound = false;
      try {
        const { default: zaloPersonalInboxService } = await import('./zaloInbox.service.js');
        listenerRebound = !!(await zaloPersonalInboxService.forceRebindListener(accountId));
      } catch (rebindErr) {
        console.warn(`[ZaloSync] forceRebindListener failed for ${accountId}:`, rebindErr.message);
      }
      return {
        synced: 0,
        message: 'Chat 1-1 không kéo lịch sử được (giới hạn Zalo). Đã làm mới kết nối realtime — nhờ đối phương nhắn tin mới.',
        type: 'personal',
        listenerRebound,
      };
    } catch (error) {
      // 404 = nhóm không còn truy cập được. Chỗ gọi gộp lại thành một dòng tổng kết,
      // không log từng nhóm — trước đây việc này đẩy log container xoay vòng liên tục
      // và làm mất các dòng chẩn đoán khác.
      if (!isGroupNotFoundError(error)) {
        console.error(`[ZaloSync] Lỗi đồng bộ lịch sử nhóm ${externalId}:`, error.message);
      }
      throw error;
    }
  }

  /**
   * Save group chat history to database
   * @param {number} accountId
   * @param {number} userId
   * @param {string} groupIdOrExternalId - bare hoặc group_<id>
   * @param {object[]} messages - đã normalize qua extractGroupHistoryMessages
   */
  async saveGroupChatHistory(accountId, userId, groupIdOrExternalId, messages) {
    const zaloPersonalRepo = (await import('../../repositories/chatbot/zaloPersonal.repository.js')).default;

    let saved = 0;
    const now = new Date().toISOString();
    const { bare, prefixed } = normalizeZaloGroupId(groupIdOrExternalId);
    const conversationExternalId = prefixed || `group_${String(groupIdOrExternalId || '').trim()}`;
    const list = Array.isArray(messages) ? messages : [];

    for (const msg of list) {
      try {
        // Check if message already exists
        const existing = await zaloPersonalRepo.findMessageByExternalId(msg.msgId, accountId);
        if (existing) continue;

        // Extract sender info
        const senderInfo = this.extractSenderInfo(msg);

        // Create externalId format for group: "group_{bare}" — all members share ONE conversation
        const senderId = senderInfo.senderId || msg.uidFrom;
        const externalId = conversationExternalId;

        // Get or create conversation (alias-aware)
        let conversation = await zaloPersonalRepo.findConversation(accountId, externalId);

        if (!conversation) {
          const visitorInfo = {
            source: 'zalo_group',
            is_group: true,
            group_id: bare || groupIdOrExternalId,
            group_name: null, // Will be backfilled later
            sender_id: senderId,
            sender_name: senderInfo.name,
          };

          conversation = await zaloPersonalRepo.insertConversation({
            userId,
            zaloSettingId: accountId,
            externalId,
            // Use group name as visitorName so all members land in the same conversation
            visitorName: `Nhóm ${bare || groupIdOrExternalId}`,
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
            group_id: bare || groupIdOrExternalId,
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
      groupHistory: null,
      errors: [],
      listenerRebound: false,
    };

    // Luôn gắn lại listener trước — tin 1-1 chỉ về qua realtime, không qua history API
    try {
      const { default: zaloPersonalInboxService } = await import('./zaloInbox.service.js');
      results.listenerRebound = !!(await zaloPersonalInboxService.forceRebindListener(accountId));
    } catch (e) {
      results.warnings = results.warnings || [];
      results.warnings.push({ type: 'listener', error: e.message });
    }

    // Sync contacts
    try {
      results.contacts = await this.syncContacts(accountId, userId);
    } catch (e) {
      results.errors.push({ type: 'contacts', error: e.message });
    }

    // Sync groups
    try {
      results.groups = await this.syncGroups(accountId, userId);
      const { default: zaloInboxService } = await import('./zaloInbox.service.js');
      await zaloInboxService.backfillConversationNames(userId, accountId, accountId);
    } catch (e) {
      results.errors.push({ type: 'groups', error: e.message });
    }

    // Pull history chỉ cho nhóm đã có hội thoại trong hộp thư (không quét 200 nhóm).
    // Quét all → nhiều 404 / lỗi zca-js "groupMsgs.length" → toast đỏ dù danh bạ/nhóm OK.
    try {
      results.groupHistory = await this.syncInboxConversationGroupHistory(accountId, userId, { limit: 50 });
    } catch (e) {
      results.warnings = results.warnings || [];
      results.warnings.push({ type: 'groupHistory', error: e.message });
    }

    return results;
  }

  /**
   * Kéo lịch sử chỉ cho các nhóm đã xuất hiện trong hộp thư (external_id group_*).
   * Dùng cho nút Đồng bộ tài khoản — nhanh, ít lỗi hơn syncAllGroupHistory.
   */
  async syncInboxConversationGroupHistory(accountId, userId, { limit = 50 } = {}) {
    const groupIds = await this.listInboxGroupIds(accountId);
    const results = {
      totalGroups: groupIds.length,
      synced: 0,
      errors: [],
      notFound: 0,
      skippedMalformed: 0,
    };

    for (const groupId of groupIds) {
      try {
        const result = await this.syncChatHistory(accountId, userId, groupId, true, { limit });
        results.synced += result.synced || 0;
        if (result.skippedMalformed) results.skippedMalformed += 1;
      } catch (err) {
        if (isGroupNotFoundError(err)) {
          results.notFound += 1;
        } else if (isGroupHistoryMalformedError(err)) {
          results.skippedMalformed += 1;
        } else {
          results.errors.push({ groupId, error: err.message });
        }
      }
    }

    return results;
  }

  /**
   * Group ids from existing inbox conversations only (canonical bare).
   * @param {number} accountId
   * @returns {Promise<string[]>}
   */
  async listInboxGroupIds(accountId) {
    const { rows } = await db.query(
      `SELECT DISTINCT external_id, visitor_info
       FROM zalo_personal_conversations
       WHERE id_zalo_setting = $1
         AND (
           external_id LIKE 'group_%'
           OR external_id LIKE 'g_%'
           OR COALESCE(visitor_info::jsonb->>'is_group', '') IN ('true', 't', '1')
         )`,
      [accountId]
    );
    const ids = new Set();
    for (const row of rows) {
      let info = row.visitor_info;
      if (typeof info === 'string') {
        try { info = JSON.parse(info); } catch { info = {}; }
      }
      const raw = info?.group_id || info?.groupId || row.external_id;
      const { bare } = normalizeZaloGroupId(raw);
      if (bare) ids.add(bare);
    }
    return [...ids];
  }

  /**
   * Sync recent history for all known groups on this account.
   */
  async syncAllGroupHistory(accountId, userId, { limit = 50 } = {}) {
    const groupsResult = await this.syncGroups(accountId, userId);
    const groups = groupsResult.groups || [];
    const results = {
      totalGroups: groups.length,
      synced: 0,
      errors: [],
      notFound: 0,
      skippedMalformed: 0,
    };

    for (const group of groups) {
      try {
        const result = await this.syncChatHistory(
          accountId,
          userId,
          group.groupId,
          true,
          { limit }
        );
        results.synced += result.synced || 0;
        if (result.skippedMalformed) results.skippedMalformed += 1;
      } catch (err) {
        if (isGroupNotFoundError(err)) {
          results.notFound += 1;
        } else if (isGroupHistoryMalformedError(err)) {
          results.skippedMalformed += 1;
        } else {
          results.errors.push({ groupId: group.groupId, error: err.message });
        }
      }
    }
    return results;
  }

  /**
   * Background sync: pull history only for groups already known in DB.
   * Avoids calling getAllGroups() every 10 minutes (Zalo rate-limit risk).
   */
  async syncKnownGroupHistory(accountId, userId, { limit = 50 } = {}) {
    const api = this.getApi(accountId);
    if (!api) {
      return { skipped: true, reason: 'no_session', totalGroups: 0, synced: 0, errors: [] };
    }

    const groupIds = await this.listKnownGroupIds(accountId);
    const results = {
      totalGroups: groupIds.length,
      synced: 0,
      errors: [],
      skipped: false,
      notFound: 0,
      cooledDown: 0,
    };
    const now = Date.now();

    for (const groupId of groupIds) {
      const key = `${accountId}:${groupId}`;
      const state = unavailableGroups.get(key);
      if (state?.skipUntil && state.skipUntil > now) {
        results.cooledDown += 1;
        continue;
      }

      try {
        const result = await this.syncChatHistory(accountId, userId, groupId, true, { limit });
        results.synced += result.synced || 0;
        unavailableGroups.delete(key); // gọi được → xoá lịch sử 404
      } catch (err) {
        if (isGroupNotFoundError(err)) {
          const strikes = (state?.strikes || 0) + 1;
          unavailableGroups.set(key, {
            strikes,
            skipUntil: strikes >= GROUP_404_STRIKES ? now + GROUP_404_COOLDOWN_MS : 0,
          });
          results.notFound += 1;
          continue;
        }
        results.errors.push({ groupId, error: err.message });
      }
    }

    // Một dòng tổng kết cho cả tài khoản, thay vì một dòng cho mỗi nhóm.
    if (results.notFound || results.errors.length || results.synced) {
      console.log(
        `[ZaloSync] account=${accountId}: synced=${results.synced} ` +
          `nhóm=${results.totalGroups} khôngTồnTại=${results.notFound} ` +
          `tạmBỏQua=${results.cooledDown} lỗiKhác=${results.errors.length}`
      );
    }
    return results;
  }

  /**
   * Groups known via zalo_groups and/or existing group conversations.
   * @param {number} accountId
   * @returns {Promise<string[]>}
   */
  async listKnownGroupIds(accountId) {
    const ids = new Set();

    try {
      const { rows } = await db.query(
        `SELECT regexp_replace(group_id, '^group_', '') AS group_id
         FROM zalo_groups
         WHERE id_zalo_setting = $1 AND group_id IS NOT NULL AND btrim(group_id) <> ''`,
        [accountId]
      );
      for (const row of rows) {
        if (row.group_id) {
          const { bare } = normalizeZaloGroupId(row.group_id);
          if (bare) ids.add(bare);
          else ids.add(String(row.group_id));
        }
      }
    } catch (err) {
      // zalo_groups may be absent in slim test schemas
      console.warn('[ZaloSync] listKnownGroupIds zalo_groups:', err.message);
    }

    const { rows: convRows } = await db.query(
      `SELECT DISTINCT regexp_replace(
         COALESCE(
           NULLIF(visitor_info::jsonb->>'group_id', ''),
           NULLIF(visitor_info::jsonb->>'groupId', ''),
           external_id
         ),
         '^group_',
         ''
       ) AS group_id
       FROM zalo_personal_conversations
       WHERE id_zalo_setting = $1
         AND (
           external_id LIKE 'group_%'
           OR COALESCE(visitor_info::jsonb->>'is_group', '') IN ('true', 't', '1')
         )`,
      [accountId]
    );
    for (const row of convRows) {
      if (row.group_id) {
        const { bare } = normalizeZaloGroupId(row.group_id);
        if (bare) ids.add(bare);
        else ids.add(String(row.group_id).replace(/^g_/, ''));
      }
    }

    return [...ids].filter((id) => id && id !== 'null');
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
        groupName: extractGroupNameFromApiResult(result, groupId) || null,
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

/**
 * Server-Sent Events (SSE) Service
 *
 * Broadcasting real-time events to connected clients.
 */
import { SCOPED_CHANNELS } from '../utils/channelAccessScope.util.js';

const MAX_CLIENTS_PER_USER = 5;

/**
 * Sự kiện thuộc hội thoại Zalo cá nhân? Ba chỗ phát ở `zaloInbox.service.js` đều mang `channel: 'zalo_personal'`
 * (sự kiện AI trả lời không có `type`, chỉ có `channel`), nên nhận diện theo cả ba trường.
 *
 * @param {object|null|undefined} data
 * @returns {boolean}
 */
export function isZaloPersonalSseEvent(data) {
  return data?.channel === 'zalo_personal'
    || data?.type === 'zalo_personal'
    || data?.conversationType === 'zalo_personal';
}

/**
 * Sự kiện Telegram / WhatsApp: `scope.accessibleChannelRefs[channel] === null` → chủ / super admin nhận; mảng → nhân viên chỉ nhận khi
 * `data.channelAccountRef` nằm trong mảng. HỎNG THÌ CHẶN: kết nối không có scope / thiếu khoá kênh / payload thiếu ref → KHÔNG nhận.
 */
function mayReceiveChannelEvent(res, data) {
  const scope = res?.__sseScope;
  if (!scope) return false;
  const refs = scope.accessibleChannelRefs?.[data.channel];
  if (refs === null) return true;
  if (!Array.isArray(refs)) return false;
  const ref = data?.channelAccountRef;
  if (ref === null || ref === undefined || ref === '') return false;
  return refs.map(String).includes(String(ref));
}

/**
 * Kết nối này có được nhận sự kiện này không? Sự kiện Zalo cá nhân (G2) và Telegram / WhatsApp Baileys (H3) bị lọc theo việc giao
 * tài khoản; Zalo OA / web giữ nguyên.
 *
 *  - `scope.accessibleZaloAccountIds === null` → chủ / super admin: nhận mọi sự kiện;
 *  - mảng → nhân viên: chỉ nhận khi `data.zaloAccountId` nằm trong mảng;
 *  - HỎNG THÌ CHẶN: kết nối không có scope, scope không phải null/mảng, hoặc payload Zalo thiếu id tài khoản → KHÔNG nhận.
 *
 * @param {{ __sseScope?: { accessibleZaloAccountIds?: number[]|null } }} res
 * @param {object} data
 * @returns {boolean}
 */
export function clientMayReceive(res, data) {
  // PLAN_GIAO_TK_TG_WA H3: sự kiện Telegram / WhatsApp (Baileys) lọc theo `data.channelAccountRef` (khoá tài khoản).
  if (SCOPED_CHANNELS.includes(data?.channel)) return mayReceiveChannelEvent(res, data);
  if (!isZaloPersonalSseEvent(data)) return true;
  const scope = res?.__sseScope;
  if (!scope) return false;
  const ids = scope.accessibleZaloAccountIds;
  if (ids === null) return true;
  if (!Array.isArray(ids)) return false;
  const accountId = Number(data?.zaloAccountId);
  return Number.isSafeInteger(accountId) && ids.includes(accountId);
}

class SSEService {
  constructor() {
    // Map of userId (string) -> Set of response objects (insertion order)
    this.clients = new Map();
  }

  _normalizeUserId(userId) {
    return String(userId);
  }

  /**
   * Add a client connection for a user. Evicts oldest if over max.
   *
   * `scope` = `{ actorUserId, accessibleZaloAccountIds, accessibleChannelRefs }` tính LÚC NỐI (route `/inbox/stream`): `null` = chủ / super admin
   * thấy mọi tài khoản Zalo, mảng = nhân viên chỉ thấy các tài khoản được giao. Đổi việc giao SAU lúc nối không tự áp
   * vào kết nối đang mở — chỗ đổi việc giao gọi `disconnectActor` để nhân viên nối lại với danh sách mới.
   * Thiếu `scope` → kết nối KHÔNG nhận sự kiện Zalo cá nhân (hỏng thì chặn).
   *
   * NOTE: If MAX_CLIENTS_PER_USER is ever set to 1, do not delete the Map key
   * inside the eviction loop before `userClients.add(res)` — otherwise `add`
   * mutates an orphaned Set and the new client never receives broadcasts.
   * Safe at MAX=5 today; revisit if the cap drops to 1.
   */
  addClient(userId, res, scope = null) {
    const key = this._normalizeUserId(userId);
    res.__sseScope = scope || null;
    if (!this.clients.has(key)) {
      this.clients.set(key, new Set());
    }
    const userClients = this.clients.get(key);

    while (userClients.size >= MAX_CLIENTS_PER_USER) {
      const oldest = userClients.values().next().value;
      if (!oldest) break;
      try {
        if (oldest.__sseHeartbeat) {
          clearInterval(oldest.__sseHeartbeat);
          oldest.__sseHeartbeat = null;
        }
        oldest.end();
      } catch {
        // ignore close errors
      }
      userClients.delete(oldest);
    }

    userClients.add(res);
    console.log(`[SSE] Client connected: userId=${key}. Total clients: ${this.getTotalClients()}`);
  }

  /**
   * Remove a client connection
   */
  removeClient(userId, res) {
    const key = this._normalizeUserId(userId);
    const userClients = this.clients.get(key);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) {
        this.clients.delete(key);
      }
    }
    console.log(`[SSE] Client disconnected: userId=${key}. Total clients: ${this.getTotalClients()}`);
  }

  /**
   * Đóng mọi kết nối SSE của MỘT người thao tác trong không gian của chủ — gọi khi việc giao tài khoản của nhân viên đổi.
   * Scope được tính lúc nối nên kết nối đang mở còn giữ danh sách cũ (nhân viên vừa bị gỡ tài khoản vẫn nhận tin của
   * tài khoản đó); đóng để EventSource nối lại bằng vé mới và tính lại danh sách (FE đã có sẵn nhánh nối lại + tải lại
   * danh sách hội thoại). Production chạy một replica nên bảng client trong RAM là đủ.
   *
   * @param {number|string} ownerUserId
   * @param {number|string} actorUserId
   * @returns {number} số kết nối đã đóng
   */
  disconnectActor(ownerUserId, actorUserId) {
    const key = this._normalizeUserId(ownerUserId);
    const userClients = this.clients.get(key);
    if (!userClients) return 0;
    let closed = 0;
    for (const res of [...userClients]) {
      if (String(res.__sseScope?.actorUserId) !== String(actorUserId)) continue;
      try {
        if (res.__sseHeartbeat) {
          clearInterval(res.__sseHeartbeat);
          res.__sseHeartbeat = null;
        }
        res.end();
      } catch {
        // ignore close errors
      }
      userClients.delete(res);
      closed += 1;
    }
    if (userClients.size === 0) {
      this.clients.delete(key);
    }
    return closed;
  }

  /**
   * Get total number of connected clients
   */
  getTotalClients() {
    let total = 0;
    for (const clients of this.clients.values()) {
      total += clients.size;
    }
    return total;
  }

  /**
   * Clients for one user (test helper)
   */
  getClientCountForUser(userId) {
    const userClients = this.clients.get(this._normalizeUserId(userId));
    return userClients ? userClients.size : 0;
  }

  /**
   * Broadcast event to specific user
   */
  broadcast(userId, eventType, data) {
    const key = this._normalizeUserId(userId);
    const userClients = this.clients.get(key);
    if (!userClients || userClients.size === 0) {
      return;
    }

    const message = this.formatEvent(eventType, data);

    for (const res of [...userClients]) {
      if (!clientMayReceive(res, data)) continue;
      try {
        res.write(message);
      } catch (err) {
        console.error(`[SSE] Failed to send to client:`, err.message);
        this.removeClient(key, res);
      }
    }
  }

  /**
   * Broadcast to multiple users
   */
  broadcastToUsers(userIds, eventType, data) {
    userIds.forEach((id) => this.broadcast(id, eventType, data));
  }

  /**
   * Format SSE event
   */
  formatEvent(eventType, data) {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  /** Test helper — wipe all clients and clear any leftover heartbeats */
  _resetForTests() {
    for (const clients of this.clients.values()) {
      for (const res of clients) {
        if (res.__sseHeartbeat) {
          clearInterval(res.__sseHeartbeat);
          res.__sseHeartbeat = null;
        }
      }
    }
    this.clients.clear();
  }
}

export default new SSEService();

/**
 * WhatsApp Baileys Session Keep-Alive Service
 *
 * Cơ chế giữ session WhatsApp LUÔN hoạt động — mirror của
 * `zaloSessionKeepAlive.service.js` cho Baileys:
 * 1. Kiểm tra session định kỳ mỗi 5 phút
 * 2. Nếu socket chết (Baileys ws.readyState !== OPEN) nhưng creds
 *    trong DB còn dùng được → reconnect bằng `connectSession()`
 * 3. Không touch DB nếu reconnect thất bại (giống Zalo: ghi fail
 *    count, không vội mark disconnected)
 *
 * Khác Zalo ở chỗ: Zalo cần `restoreZaloSessionFromCookie(cookie)`
 * mới có api; Baileys auth state lưu thẳng creds blob → chỉ cần
 * rebuild socket qua `connectSession()` (cùng entry-point như
 * `restorePersistedSessions()`).
 */

import * as whatsappBaileysService from './whatsappBaileys.service.js';

const KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — same as Zalo

// Mirror Zalo's `refreshingAccounts` Set — keep-alive is a 5-min
// cron so concurrent refresh of the SAME sessionKey shouldn't
// happen in practice, but a slow connectSession() from one tick
// overlapping the next can. Serialize per-key to avoid building
// two sockets for the same account (Baileys server will kick the
// old one with code 440).
const refreshingKeys = new Set();

let keepAliveInterval = null;

/**
 * Check whether a session is "really" alive — not just in-memory
 * with a stale socket reference. The Baileys WebSocket's
 * `readyState` is the ground truth: 1 = OPEN. Status `connecting`
 * with a non-null socket can still be a dead WS after a network
 * blip that didn't emit `connection.update: close`.
 */
function isSocketAlive(socket) {
  if (!socket) return false;
  const ws = socket.ws;
  if (!ws) return false;
  // `ws` is a Node `WebSocket` from the `ws` package — same
  // readyState semantics as the browser API (0=CONNECTING, 1=OPEN,
  // 2=CLOSING, 3=CLOSED).
  return ws.readyState === 1;
}

/**
 * Refresh a single sessionKey.
 *
 * Decision tree (parallel to `zaloSessionKeepAlive.refreshAccountSession`):
 *   1. No in-memory record → call `connectSession()` to (re)create it.
 *   2. Record exists, socket alive → ensure inbox handler attached, done.
 *   3. Record exists, socket dead → call `connectSession()` to rebuild.
 *
 * @param {string} sessionKey
 * @returns {Promise<{sessionKey: string, status: string, reason?: string}>}
 */
async function refreshSession(sessionKey) {
  if (refreshingKeys.has(sessionKey)) {
    return { sessionKey, status: 'skipped', reason: 'already_refreshing' };
  }
  refreshingKeys.add(sessionKey);
  try {
    const record = whatsappBaileysService.getSession(sessionKey);
    if (record && record.status === 'open' && isSocketAlive(record.socket)) {
      return { sessionKey, status: 'alive', reason: 'socket_open' };
    }
    // Either no record (lost after restart + restore failed) or
    // dead socket (network blip, server kicked, etc.). Rebuild via
    // the same entry-point that `restorePersistedSessions()` uses.
    try {
      await whatsappBaileysService.connectSession(sessionKey);
      return { sessionKey, status: 'restored' };
    } catch (err) {
      return {
        sessionKey,
        status: 'failed',
        reason: err.message || 'connectSession_threw',
      };
    }
  } finally {
    refreshingKeys.delete(sessionKey);
  }
}

/**
 * Run a single keep-alive sweep across every persisted session.
 */
async function performKeepAlive() {
  let keys;
  try {
    keys = await whatsappBaileysService.listPersistedSessions();
  } catch (err) {
    console.warn('[WhatsAppKeepAlive] listPersistedSessions failed:', err.message);
    return { total: 0, alive: 0, restored: 0, failed: 0 };
  }
  if (!keys || keys.length === 0) {
    return { total: 0, alive: 0, restored: 0, failed: 0 };
  }
  const settled = await Promise.allSettled(keys.map(refreshSession));
  const summary = { total: keys.length, alive: 0, restored: 0, failed: 0 };
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      const s = r.value.status;
      if (s === 'alive' || s === 'skipped') summary.alive += 1;
      else if (s === 'restored') summary.restored += 1;
      else summary.failed += 1;
    } else {
      summary.failed += 1;
    }
  }
  console.log(
    `[WhatsAppKeepAlive] ${summary.alive} alive, ${summary.restored} restored, ${summary.failed} failed (of ${summary.total})`
  );
  return summary;
}

/**
 * Start the keep-alive scheduler. Idempotent — calling twice is a
 * no-op so the boot path can safely invoke from multiple entry
 * points (e.g. `index.js` + `scheduler.js`).
 */
export function startKeepAliveScheduler() {
  if (keepAliveInterval) return;
  // First sweep immediately so a deploy/restart doesn't leave a
  // 5-minute blind spot while waiting for the first interval tick.
  performKeepAlive();
  keepAliveInterval = setInterval(performKeepAlive, KEEP_ALIVE_INTERVAL_MS);
  console.log(
    `[WhatsAppKeepAlive] scheduler started (every ${KEEP_ALIVE_INTERVAL_MS / 1000}s)`
  );
}

export function stopKeepAliveScheduler() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

export async function forceRefreshAllSessions() {
  return performKeepAlive();
}

// Exposed for tests — most paths should go through the scheduler.
export const __test__ = { isSocketAlive, refreshSession, performKeepAlive };

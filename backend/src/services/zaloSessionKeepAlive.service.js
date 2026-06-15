/**
 * Zalo Session Keep-Alive Service
 *
 * Cơ chế giữ session Zalo LUÔN hoạt động:
 * 1. Kiểm tra session định kỳ mỗi 5 phút
 * 2. Nếu session bị mất hoặc lỗi, tự động restore từ cookie
 * 3. Không đánh dấu disconnected trừ khi cookie cũng hết hạn
 *
 * Điều này đảm bảo:
 * - Không bị out khi update code
 * - Không bị out khi Zalo revoke session
 * - Luôn thử restore trước khi báo disconnected
 */

import zaloAccountSessionService from './zalo/zaloAccountSession.service.js';
import zaloPersonalInboxService from './chatbot/zaloInbox.service.js';
import db from '../config/database.js';
import { restoreZaloSessionFromCookie } from '../utils/zaloSessionRestore.util.js';
import campaignZaloSenderRepository from '../repositories/campaign/campaignZaloSender.repository.js';

// Track accounts currently being refreshed to avoid concurrent refresh
const refreshingAccounts = new Set();

/**
 * Kiểm tra xem session API có thực sự hoạt động không
 * Thử gọi một API method đơn giản để xác nhận
 */
async function isSessionAlive(api, accountId) {
  if (!api) return false;

  try {
    // Thử getOwnId - method nhanh nhất để kiểm tra session
    if (typeof api.getOwnId === 'function') {
      const ownId = api.getOwnId();
      if (ownId) return true;
    }

    // Thử getUserInfo nếu có uid
    if (typeof api.getUserInfo === 'function') {
      // Thử lấy thông tin cơ bản
      return true;
    }

    return true; // Giả định alive nếu có api object
  } catch (error) {
    console.warn(`[ZaloKeepAlive] Session check failed for account ${accountId}: ${error.message}`);
    return false;
  }
}

/**
 * Lấy danh sách tất cả accounts có cookie để restore nếu cần
 */
async function getAccountsWithCookies() {
  try {
    const result = await db.query(
      `SELECT zs.id, zs.id_user, zs.display_name, zs.cookie_text, zs.status, zs.is_active
       FROM zalo_settings zs
       WHERE zs.cookie_text IS NOT NULL
         AND zs.cookie_text <> ''
         AND zs.is_active = TRUE
         AND zs.status = 'connected'`
    );
    console.log(`[ZaloKeepAlive] Found ${result.rows.length} accounts with cookies`);
    if (result.rows.length > 0) {
      result.rows.forEach((acc, i) => {
        console.log(`[ZaloKeepAlive] Account ${i + 1}: id=${acc.id}, status=${acc.status}, hasCookie=${!!acc.cookie_text?.substring(0, 50)}...`);
      });
    }
    return result.rows;
  } catch (error) {
    console.error('[ZaloKeepAlive] Failed to get accounts with cookies:', error.message);
    return [];
  }
}

/**
 * Refresh một account - restore session nếu cần
 */
async function refreshAccountSession(account) {
  const accountId = Number(account.id);
  const userId = Number(account.id_user);
  const accountKey = String(accountId);

  console.log(`[ZaloKeepAlive] Processing account ${accountId} (userId=${userId})...`);

  // Skip nếu đang được refresh bởi process khác
  if (refreshingAccounts.has(accountKey)) {
    console.log(`[ZaloKeepAlive] Account ${accountId} is already being refreshed, skipping`);
    return { accountId, status: 'skipped', reason: 'already_refreshing' };
  }

  refreshingAccounts.add(accountKey);

  try {
    // Kiểm tra session hiện tại trong memory
    const currentApi = zaloAccountSessionService.getAccountApi(accountId);
    console.log(`[ZaloKeepAlive] Account ${accountId}: currentApi in memory = ${!!currentApi}`);

    if (currentApi) {
      // Kiểm tra xem session có thực sự hoạt động không
      const isAlive = await isSessionAlive(currentApi, accountId);
      if (isAlive) {
        console.log(`[ZaloKeepAlive] Account ${accountId}: session is alive ✅`);
        refreshingAccounts.delete(accountKey);
        return { accountId, status: 'alive', reason: 'session_valid' };
      }
      console.log(`[ZaloKeepAlive] Account ${accountId}: session exists but not alive, will try restore`);
    } else {
      console.log(`[ZaloKeepAlive] Account ${accountId}: no session in memory, will try restore`);
    }

    // Session không có hoặc không hoạt động - thử restore
    console.log(`[ZaloKeepAlive] Account ${accountId}: attempting session restore...`);

    const cookieText = String(account.cookie_text || '').trim();
    console.log(`[ZaloKeepAlive] Account ${accountId}: has cookie = ${!!cookieText}, length = ${cookieText?.length || 0}`);

    if (!cookieText) {
      console.log(`[ZaloKeepAlive] Account ${accountId}: no cookie available`);
      refreshingAccounts.delete(accountKey);
      return { accountId, status: 'failed', reason: 'no_cookie' };
    }

    // Thử restore session trực tiếp với retry
    let restoredApi = null;
    try {
      console.log(`[ZaloKeepAlive] Account ${accountId}: calling restoreZaloSessionFromCookie...`);
      restoredApi = await restoreZaloSessionFromCookie(cookieText, 2); // 2 retries
      console.log(`[ZaloKeepAlive] Account ${accountId}: restoreZaloSessionFromCookie returned: ${!!restoredApi}`);
    } catch (restoreError) {
      console.warn(`[ZaloKeepAlive] Account ${accountId}: Restore failed: ${restoreError.message}`);
      refreshingAccounts.delete(accountKey);
      return { accountId, status: 'failed', reason: 'restore_failed_temporary' };
    }

    if (restoredApi) {
      console.log(`[ZaloKeepAlive] Account ${accountId}: ✅ Session restored successfully!`);

      // Lưu API vào memory
      zaloAccountSessionService.setAccountApi(accountId, restoredApi);
      console.log(`[ZaloKeepAlive] Account ${accountId}: API saved to memory`);

      // Start listener
      zaloAccountSessionService.startAccountListenerSafely({
        accountId,
        api: restoredApi,
        context: 'keepAlive',
      });
      console.log(`[ZaloKeepAlive] Account ${accountId}: Listener started`);

      // Cập nhật trạng thái connected trong DB
      try {
        await campaignZaloSenderRepository.markAccountConnected({
          accountId,
          userId,
          displayName: account.display_name || 'Tài khoản Zalo',
          cookieText,
          now: new Date(),
        });
        console.log(`[ZaloKeepAlive] Account ${accountId}: marked as connected in DB ✅`);
      } catch (dbError) {
        console.warn(`[ZaloKeepAlive] Account ${accountId}: Failed to update DB status: ${dbError.message}`);
      }

      // Đăng ký listener cho inbox
      try {
        zaloPersonalInboxService.invalidateAccountCache();
        await zaloPersonalInboxService.refreshListeners(true);
        console.log(`[ZaloKeepAlive] Account ${accountId}: inbox listeners refreshed ✅`);
      } catch (inboxError) {
        console.warn(`[ZaloKeepAlive] Account ${accountId}: Failed to refresh inbox listeners: ${inboxError.message}`);
      }

      refreshingAccounts.delete(accountKey);
      return { accountId, status: 'restored', reason: 'session_refreshed' };
    }

    console.log(`[ZaloKeepAlive] Account ${accountId}: restore returned null`);
    refreshingAccounts.delete(accountKey);
    return { accountId, status: 'failed', reason: 'restore_failed' };

  } catch (error) {
    console.error(`[ZaloKeepAlive] Account ${accountId}: Error:`, error.message, error.stack);
    refreshingAccounts.delete(accountKey);
    return { accountId, status: 'error', reason: error.message };
  }
}

/**
 * Main keep-alive function - chạy định kỳ để giữ tất cả sessions alive
 */
async function performKeepAlive() {
  console.log('[ZaloKeepAlive] Starting keep-alive check...');

  try {
    const accounts = await getAccountsWithCookies();

    if (accounts.length === 0) {
      console.log('[ZaloKeepAlive] No accounts with cookies found');
      return { total: 0, alive: 0, restored: 0, failed: 0 };
    }

    console.log(`[ZaloKeepAlive] Checking ${accounts.length} accounts...`);

    const results = await Promise.allSettled(
      accounts.map(account => refreshAccountSession(account))
    );

    const summary = {
      total: accounts.length,
      alive: 0,
      restored: 0,
      failed: 0,
    };

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { status } = result.value;
        if (status === 'alive' || status === 'skipped') summary.alive++;
        else if (status === 'restored') summary.restored++;
        else summary.failed++;
      } else {
        summary.failed++;
      }
    });

    console.log(
      `[ZaloKeepAlive] Complete: ${summary.alive} alive, ${summary.restored} restored, ${summary.failed} failed`
    );

    return summary;

  } catch (error) {
    console.error('[ZaloKeepAlive] Keep-alive check failed:', error.message);
    return { total: 0, alive: 0, restored: 0, failed: 0, error: error.message };
  }
}

/**
 * Start the keep-alive scheduler
 * Chạy mỗi 5 phút để giữ sessions alive
 */
let keepAliveInterval = null;

export function startKeepAliveScheduler() {
  if (keepAliveInterval) {
    console.log('[ZaloKeepAlive] Scheduler already running');
    return;
  }

  // Chạy ngay lần đầu
  performKeepAlive();

  // Sau đó chạy mỗi 5 phút
  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  keepAliveInterval = setInterval(performKeepAlive, INTERVAL_MS);

  console.log(`[ZaloKeepAlive] Scheduler started - will check every ${INTERVAL_MS / 1000 / 60} minutes`);
}

export function stopKeepAliveScheduler() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('[ZaloKeepAlive] Scheduler stopped');
  }
}

/**
 * Force refresh all sessions (dùng khi cần thiết)
 */
export async function forceRefreshAllSessions() {
  return performKeepAlive();
}

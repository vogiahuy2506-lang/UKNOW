/**
 * Zalo Session Keep-Alive Service
 *
 * C╞í chß║┐ giß╗» session Zalo LU├öN hoß║ít ─æß╗Öng:
 * 1. Kiß╗âm tra session ─æß╗ïnh kß╗│ mß╗ùi 5 ph├║t
 * 2. Nß║┐u session bß╗ï mß║Ñt hoß║╖c lß╗ùi, tß╗▒ ─æß╗Öng restore tß╗½ cookie
 * 3. Kh├┤ng ─æ├ính dß║Ñu disconnected trß╗½ khi cookie c┼⌐ng hß║┐t hß║ín
 *
 * ─Éiß╗üu n├áy ─æß║úm bß║úo:
 * - Kh├┤ng bß╗ï out khi update code
 * - Kh├┤ng bß╗ï out khi Zalo revoke session
 * - Lu├┤n thß╗¡ restore tr╞░ß╗¢c khi b├ío disconnected
 */

import zaloAccountSessionService from './zalo/zaloAccountSession.service.js';
import zaloPersonalInboxService from './chatbot/zaloInbox.service.js';
import zaloPersonalAdapter from './chatbot/channelAdapters/zaloPersonal.adapter.js';
import { getListenerSocketState } from '../utils/zaloListenerHealth.util.js';
import db from '../config/database.js';
import { restoreZaloSessionFromCookie } from '../utils/zaloSessionRestore.util.js';
import campaignZaloSenderRepository from '../repositories/campaign/campaignZaloSender.repository.js';
import { decryptZaloCookieRows } from '../utils/zaloCookieCrypto.util.js';
import zaloOneWorkspaceService from './zalo/zaloOneWorkspace.service.js';
import zaloSettingRepository from '../repositories/zalo/zaloSetting.repository.js';
import { ZALO_LIVE_ELSEWHERE_CODE } from '../utils/zaloOneWorkspace.util.js';

// Track accounts currently being refreshed to avoid concurrent refresh
const refreshingAccounts = new Set();

/**
 * Kiß╗âm tra session c├│ THß╗░C Sß╗░ c├▓n nhß║¡n ─æ╞░ß╗úc tin ─æß║┐n kh├┤ng.
 *
 * Tr╞░ß╗¢c ─æ├óy h├ám n├áy lu├┤n trß║ú true khi c├│ object api trong memory ΓåÆ websocket chß║┐t
 * ├óm thß║ºm (kh├┤ng ph├ít sß╗▒ kiß╗çn `closed`) kh├┤ng bao giß╗¥ ─æ╞░ß╗úc ph├ít hiß╗çn, hß╗Öp th╞░ ─æiß║┐c
 * cho tß╗¢i khi restart backend. Nay soi thß║│ng readyState cß╗ºa websocket zca-js.
 *
 * @param {any} api
 * @param {number|string} accountId
 * @returns {boolean}
 */
function isSessionAlive(api, accountId) {
  const health = getListenerSocketState(api);
  if (!health.healthy) {
    console.warn(
      `[ZaloKeepAlive] Account ${accountId}: listener KH├öNG sß╗æng `
      + `(reason=${health.reason}, readyState=${health.readyState ?? 'null'}) ΓåÆ sß║╜ restore`
    );
  }
  return health.healthy;
}

/**
 * Socket c├▓n sß╗æng nh╞░ng handler hß╗Öp th╞░ c├│ thß╗â ─æ├ú rß╗¢t khß╗Åi listener
 * (rebind lß╗ùi, ─æß╗ông bß╗Ö thß╗º c├┤ng, listener bß╗ï thay). Khi ─æ├│ vß║½n gß╗¡i ─æ╞░ß╗úc tin ra
 * nh╞░ng bß║ín b├¿ nhß║»n v├áo KH├öNG v├áo hß╗Öp th╞░ v├á AI kh├┤ng trß║ú lß╗¥i.
 *
 * @param {number|string} accountId
 * @param {any} api
 * @returns {Promise<boolean>}
 */
async function ensureInboxHandlerAttached(accountId, api) {
  try {
    if (zaloPersonalAdapter.isHandlerAttachedTo(accountId, api?.listener)) {
      return true;
    }
    console.warn(
      `[ZaloKeepAlive] Account ${accountId}: socket sß╗æng nh╞░ng inbox handler ch╞░a gß║»n ΓåÆ ─æ─âng k├╜ lß║íi`
    );
    return await zaloPersonalInboxService.registerAccountListener(accountId);
  } catch (error) {
    console.warn(
      `[ZaloKeepAlive] Account ${accountId}: rebind inbox handler thß║Ñt bß║íi: ${error.message}`
    );
    return false;
  }
}

/**
 * Dß╗ìn session chß║┐t tr╞░ß╗¢c khi restore: bß╗Å api khß╗Åi memory (k├¿m unmark registered)
 * rß╗ôi ─æ├│ng socket zombie, tr├ính chß║íy song song 2 socket cho c├╣ng t├ái khoß║ún
 * (Zalo sß║╜ ─æ├í kß║┐t nß╗æi tr├╣ng bß║▒ng m├ú 3000).
 *
 * @param {number|string} accountId
 * @param {any} api
 * @returns {void}
 */
function discardDeadSession(accountId, api) {
  try {
    zaloAccountSessionService.clearAccountApi(accountId, api);
  } catch (error) {
    console.warn(`[ZaloKeepAlive] Account ${accountId}: clearAccountApi lß╗ùi: ${error.message}`);
  }
  try {
    api?.listener?.stop?.();
  } catch (error) {
    console.warn(`[ZaloKeepAlive] Account ${accountId}: stop listener c┼⌐ lß╗ùi: ${error.message}`);
  }
}

/**
 * Lß║Ñy danh s├ích tß║Ñt cß║ú accounts c├│ cookie ─æß╗â restore nß║┐u cß║ºn
 */
async function getAccountsWithCookies() {
  try {
    const result = await db.query(
      `SELECT zs.id, zs.id_user, zs.display_name, zs.cookie_text, zs.status, zs.is_active, zs.zalo_user_id
       FROM zalo_settings zs
       WHERE zs.cookie_text IS NOT NULL
         AND zs.cookie_text <> ''
         AND zs.is_active = TRUE
         AND zs.status = 'connected'`
    );
    decryptZaloCookieRows(result.rows);
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
 * Refresh mß╗Öt account - restore session nß║┐u cß║ºn
 */
async function refreshAccountSession(account) {
  const accountId = Number(account.id);
  const userId = Number(account.id_user);
  const accountKey = String(accountId);

  console.log(`[ZaloKeepAlive] Processing account ${accountId} (userId=${userId})...`);

  // Skip nß║┐u ─æang ─æ╞░ß╗úc refresh bß╗ƒi process kh├íc
  if (refreshingAccounts.has(accountKey)) {
    console.log(`[ZaloKeepAlive] Account ${accountId} is already being refreshed, skipping`);
    return { accountId, status: 'skipped', reason: 'already_refreshing' };
  }

  refreshingAccounts.add(accountKey);

  try {
    // Kiß╗âm tra session hiß╗çn tß║íi trong memory
    const currentApi = zaloAccountSessionService.getAccountApi(accountId);
    console.log(`[ZaloKeepAlive] Account ${accountId}: currentApi in memory = ${!!currentApi}`);

    if (currentApi) {
      // Kiß╗âm tra xem session c├│ thß╗▒c sß╗▒ hoß║ít ─æß╗Öng kh├┤ng
      const isAlive = isSessionAlive(currentApi, accountId);
      if (isAlive) {
        console.log(`[ZaloKeepAlive] Account ${accountId}: session is alive Γ£à`);
        await ensureInboxHandlerAttached(accountId, currentApi);
        refreshingAccounts.delete(accountKey);
        return { accountId, status: 'alive', reason: 'session_valid' };
      }
      console.log(`[ZaloKeepAlive] Account ${accountId}: session exists but not alive, will try restore`);
      discardDeadSession(accountId, currentApi);
    } else {
      console.log(`[ZaloKeepAlive] Account ${accountId}: no session in memory, will try restore`);
    }

    // Session kh├┤ng c├│ hoß║╖c kh├┤ng hoß║ít ─æß╗Öng - thß╗¡ restore
    console.log(`[ZaloKeepAlive] Account ${accountId}: attempting session restore...`);

    const cookieText = String(account.cookie_text || '').trim();
    console.log(`[ZaloKeepAlive] Account ${accountId}: has cookie = ${!!cookieText}, length = ${cookieText?.length || 0}`);

    if (!cookieText) {
      console.log(`[ZaloKeepAlive] Account ${accountId}: no cookie available`);
      refreshingAccounts.delete(accountKey);
      return { accountId, status: 'failed', reason: 'no_cookie' };
    }

    // Thß╗¡ restore session trß╗▒c tiß║┐p vß╗¢i retry
    let restoredApi = null;
    try {
      console.log(`[ZaloKeepAlive] Account ${accountId}: calling restoreZaloSessionFromCookie...`);
      restoredApi = await restoreZaloSessionFromCookie(cookieText, 2); // 2 retries
      console.log(`[ZaloKeepAlive] Account ${accountId}: restoreZaloSessionFromCookie returned: ${!!restoredApi}`);
    } catch (restoreError) {
      console.warn(`[ZaloKeepAlive] Account ${accountId}: Restore failed: ${restoreError.message}`);
      try {
        await campaignZaloSenderRepository.recordRestoreFailure(accountId);
      } catch (recordErr) {
        console.warn(`[ZaloKeepAlive] recordRestoreFailure failed for ${accountId}: ${recordErr.message}`);
      }
      refreshingAccounts.delete(accountKey);
      return { accountId, status: 'failed', reason: 'restore_failed_temporary' };
    }

    if (restoredApi) {
      console.log(`[ZaloKeepAlive] Account ${accountId}: Γ£à Session restored successfully!`);

      // L╞░u API v├áo memory
      zaloAccountSessionService.setAccountApi(accountId, restoredApi);
      console.log(`[ZaloKeepAlive] Account ${accountId}: API saved to memory`);

      // Start listener
      zaloAccountSessionService.startAccountListenerSafely({
        accountId,
        api: restoredApi,
        context: 'keepAlive',
      });
      console.log(`[ZaloKeepAlive] Account ${accountId}: Listener started`);

      // Cß║¡p nhß║¡t trß║íng th├íi connected trong DB + backfill zalo_user_id nß║┐u thiß║┐u
      try {
        let zaloUserId = String(account.zalo_user_id || '').trim();
        if (!zaloUserId && typeof restoredApi?.getOwnId === 'function') {
          try {
            zaloUserId = String(restoredApi.getOwnId() || '').trim();
          } catch {
            zaloUserId = '';
          }
        }

        if (zaloUserId) {
          await zaloOneWorkspaceService.assertZaloNotLiveElsewhere(userId, zaloUserId);
          await zaloOneWorkspaceService.withUniqueMapped(() =>
            zaloSettingRepository.backfillZaloUserIdIfEmpty(accountId, userId, zaloUserId)
          );
        }

        await zaloOneWorkspaceService.withUniqueMapped(() =>
          campaignZaloSenderRepository.markAccountConnected({
            accountId,
            userId,
            displayName: account.display_name || 'T├ái khoß║ún Zalo',
            cookieText,
            now: new Date(),
          })
        );
        console.log(`[ZaloKeepAlive] Account ${accountId}: marked as connected in DB Γ£à`);
      } catch (dbError) {
        if (dbError?.statusCode === 409 || dbError?.code === ZALO_LIVE_ELSEWHERE_CODE) {
          console.warn(
            `[ZaloKeepAlive] Account ${accountId}: Zalo user already live elsewhere ΓÇö disconnecting this row`
          );
          try {
            await campaignZaloSenderRepository.markAccountDisconnected(accountId, userId);
            zaloAccountSessionService.clearAccountApi(accountId);
          } catch (discErr) {
            console.warn(`[ZaloKeepAlive] Account ${accountId}: disconnect after conflict failed: ${discErr.message}`);
          }
          refreshingAccounts.delete(accountKey);
          return { accountId, status: 'failed', reason: 'zalo_live_elsewhere' };
        }
        console.warn(`[ZaloKeepAlive] Account ${accountId}: Failed to update DB status: ${dbError.message}`);
      }

      // ─É─âng k├╜ listener cho inbox
      try {
        zaloPersonalInboxService.invalidateAccountCache();
        await zaloPersonalInboxService.refreshListeners(true);
        console.log(`[ZaloKeepAlive] Account ${accountId}: inbox listeners refreshed Γ£à`);
      } catch (inboxError) {
        console.warn(`[ZaloKeepAlive] Account ${accountId}: Failed to refresh inbox listeners: ${inboxError.message}`);
      }

      refreshingAccounts.delete(accountKey);
      return { accountId, status: 'restored', reason: 'session_refreshed' };
    }

    console.log(`[ZaloKeepAlive] Account ${accountId}: restore returned null`);
    try {
      await campaignZaloSenderRepository.recordRestoreFailure(accountId);
    } catch (recordErr) {
      console.warn(`[ZaloKeepAlive] recordRestoreFailure failed for ${accountId}: ${recordErr.message}`);
    }
    refreshingAccounts.delete(accountKey);
    return { accountId, status: 'failed', reason: 'restore_failed' };

  } catch (error) {
    console.error(`[ZaloKeepAlive] Account ${accountId}: Error:`, error.message, error.stack);
    refreshingAccounts.delete(accountKey);
    return { accountId, status: 'error', reason: error.message };
  }
}

/**
 * Main keep-alive function - chß║íy ─æß╗ïnh kß╗│ ─æß╗â giß╗» tß║Ñt cß║ú sessions alive
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
 * Chß║íy mß╗ùi 5 ph├║t ─æß╗â giß╗» sessions alive
 */
let keepAliveInterval = null;

export function startKeepAliveScheduler() {
  if (keepAliveInterval) {
    console.log('[ZaloKeepAlive] Scheduler already running');
    return;
  }

  // Chß║íy ngay lß║ºn ─æß║ºu
  performKeepAlive();

  // Sau ─æ├│ chß║íy mß╗ùi 5 ph├║t
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
 * Force refresh all sessions (d├╣ng khi cß║ºn thiß║┐t)
 */
export async function forceRefreshAllSessions() {
  return performKeepAlive();
}


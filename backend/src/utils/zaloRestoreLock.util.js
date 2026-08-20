/**
 * Shared mutex for Zalo restore operations across all modules.
 *
 * Previously, `ZaloKeepAlive`, `CampaignZaloSender.restoreApiFromCookieText`,
 * and `ZaloInbox.restoreSessionsFromDb` each ran their own restore path
 * independently — three concurrent zca-js logins on the same accountId led
 * Zalo's server to close duplicates with "Another connection is opened,
 * closing this one" (code=1000). The cache guards inside each module were
 * not coordinated, so logs were noisy even when no real work happened.
 *
 * Centralising the lock here lets every caller short-circuit cheaply.
 */

const restoreLocks = new Map();

function acquire(accountId, holder) {
  const key = String(accountId);
  if (restoreLocks.has(key)) {
    return { acquired: false, currentHolder: restoreLocks.get(key) };
  }
  restoreLocks.set(key, { holder, acquiredAt: Date.now() });
  return { acquired: true };
}

function release(accountId, holder) {
  const key = String(accountId);
  const entry = restoreLocks.get(key);
  if (!entry) return;
  if (entry.holder !== holder) return;
  restoreLocks.delete(key);
}

/**
 * Run `fn` only if no other module is currently restoring the same account.
 * Returns `{ skipped: true, holder }` if locked, otherwise the fn result.
 */
async function runExclusive(accountId, holder, fn) {
  const lock = acquire(accountId, holder);
  if (!lock.acquired) {
    return { skipped: true, holder: lock.currentHolder?.holder };
  }
  try {
    return await fn();
  } finally {
    release(accountId, holder);
  }
}

function isLocked(accountId) {
  return restoreLocks.has(String(accountId));
}

export default { acquire, release, runExclusive, isLocked };
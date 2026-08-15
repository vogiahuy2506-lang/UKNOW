import { useState, useEffect, useCallback } from 'react';
import { getStorageUsage } from './storage.service';
import { getStorageAlertLevel } from './storageUtils';
import { subscribeStorageQuotaRefresh, subscribeStorageQuotaClear } from './storageEvents';

let cachedUsage = null;
let fetchPromise = null;
const listeners = new Set();

subscribeStorageQuotaRefresh(() => {
  fetchStorageQuota(true);
});

subscribeStorageQuotaClear(() => {
  clearStorageQuotaCache();
});

const notifyListeners = (usage, error, loading) => {
  for (const listener of listeners) {
    listener({ usage, error, loading });
  }
};

/**
 * Fetch storage quota from server with module-level deduplication.
 * @param {boolean} force - Force re-fetch even if cache exists.
 */
export const fetchStorageQuota = async (force = false) => {
  if (cachedUsage && !force) {
    return cachedUsage;
  }
  if (fetchPromise) {
    return fetchPromise;
  }
  notifyListeners(cachedUsage, null, true);
  fetchPromise = (async () => {
    try {
      const data = await getStorageUsage();
      cachedUsage = data;
      notifyListeners(cachedUsage, null, false);
      return data;
    } catch (err) {
      // Fail-open: do not block frontend on network errors
      notifyListeners(cachedUsage, err, false);
      return cachedUsage;
    } finally {
      fetchPromise = null;
    }
  })();
  return fetchPromise;
};

/**
 * Trigger immediate refresh of storage quota for all subscribers.
 */
export const refreshStorageQuota = () => fetchStorageQuota(true);

/**
 * Clear cached quota data (e.g. on logout/account switch).
 */
export const clearStorageQuotaCache = () => {
  cachedUsage = null;
  fetchPromise = null;
};

/**
 * Hook to read and subscribe to workspace storage quota.
 */
export const useStorageQuota = () => {
  const [state, setState] = useState(() => ({
    usage: cachedUsage,
    loading: !cachedUsage,
    error: null,
  }));

  useEffect(() => {
    const listener = (nextState) => {
      setState(nextState);
    };
    listeners.add(listener);
    fetchStorageQuota(false);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refresh = useCallback(() => refreshStorageQuota(), []);
  const alertLevel = getStorageAlertLevel(state.usage);

  return {
    usage: state.usage,
    loading: state.loading,
    error: state.error,
    refresh,
    alertLevel,
    isCritical: alertLevel === 'critical',
    isWarning: alertLevel === 'warning',
  };
};

export default useStorageQuota;

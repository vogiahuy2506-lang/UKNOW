/**
 * Event listener bus to break circular dependencies between api.js, authStore.js, and useStorageQuota.js
 */
const refreshListeners = new Set();
const clearListeners = new Set();

export const subscribeStorageQuotaRefresh = (callback) => {
  refreshListeners.add(callback);
  return () => {
    refreshListeners.delete(callback);
  };
};

export const notifyStorageQuotaRefresh = () => {
  for (const cb of refreshListeners) {
    try {
      cb();
    } catch {
      // ignore callback error
    }
  }
};

export const subscribeStorageQuotaClear = (callback) => {
  clearListeners.add(callback);
  return () => {
    clearListeners.delete(callback);
  };
};

export const notifyStorageQuotaClear = () => {
  for (const cb of clearListeners) {
    try {
      cb();
    } catch {
      // ignore callback error
    }
  }
};

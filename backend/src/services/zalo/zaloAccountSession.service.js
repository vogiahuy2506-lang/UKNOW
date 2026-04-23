const LISTENER_ERROR_GUARD_FLAG = Symbol('uknow.zalo.listener.errorGuard');

class ZaloAccountSessionService {
  constructor() {
    this.apiByAccountId = new Map();
  }

  /**
   * Save a connected zca-js api instance for one account.
   *
   * @param {string|number} accountId
   * @param {any} api
   * @returns {void}
   */
  setAccountApi(accountId, api) {
    const key = String(accountId || '').trim();
    if (!key || !api) return;
    this.apiByAccountId.set(key, api);
  }

  /**
   * Attach guard handlers to zca-js listener to avoid process crash
   * when websocket emits an unhandled error event.
   *
   * @param {string|number} accountId
   * @param {any} api
   * @param {string} context
   * @returns {void}
   */
  attachListenerErrorGuard(accountId, api, context = 'unknown') {
    const listener = api?.listener;
    if (!listener || typeof listener.on !== 'function') return;
    if (listener[LISTENER_ERROR_GUARD_FLAG] === true) return;

    const accountKey = String(accountId || '').trim() || 'unknown';
    listener.on('error', (event) => {
      const rawError = event?.error || event?.cause || event;
      const message = rawError?.message || event?.message || 'Unknown listener error';
      console.warn(
        `[zalo-listener] WebSocket error at ${context} (accountId=${accountKey}): ${message}`
      );
    });
    listener[LISTENER_ERROR_GUARD_FLAG] = true;
  }

  /**
   * Start zca-js listener with defensive error guard.
   *
   * @param {object} input
   * @param {string|number} input.accountId
   * @param {any} input.api
   * @param {string} input.context
   * @returns {boolean}
   */
  startAccountListenerSafely({ accountId, api, context = 'unknown' } = {}) {
    if (!api?.listener?.start || typeof api.listener.start !== 'function') {
      return false;
    }

    try {
      this.attachListenerErrorGuard(accountId, api, context);
      api.listener.start();
      return true;
    } catch (error) {
      const accountKey = String(accountId || '').trim() || 'unknown';
      console.warn(
        `[zalo-listener] Failed to start listener at ${context} (accountId=${accountKey}): ${error?.message || 'Unknown start error'}`
      );
      return false;
    }
  }

  /**
   * Get connected zca-js api instance by account id.
   *
   * @param {string|number} accountId
   * @returns {any|null}
   */
  getAccountApi(accountId) {
    const key = String(accountId || '').trim();
    if (!key) return null;
    return this.apiByAccountId.get(key) || null;
  }

  /**
   * Remove connected api instance for account.
   *
   * @param {string|number} accountId
   * @returns {void}
   */
  clearAccountApi(accountId) {
    const key = String(accountId || '').trim();
    if (!key) return;
    this.apiByAccountId.delete(key);
  }
}

export default new ZaloAccountSessionService();

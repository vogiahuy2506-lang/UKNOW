import campaignZaloSenderRepository from '../../repositories/campaign/campaignZaloSender.repository.js';

const LISTENER_ERROR_GUARD_FLAG = Symbol('Founder AI.zalo.listener.errorGuard');
const LISTENER_CLOSE_HANDLED_FLAG = Symbol('Founder AI.zalo.listener.closeHandled');
const ZALO_TAKEOVER_CLOSE_CODES = new Set([3000, 3003]);

function normalizeListenerCloseEvent(codeOrEvent, reasonArg) {
  if (codeOrEvent && typeof codeOrEvent === 'object') {
    const rawCode = codeOrEvent.code ?? codeOrEvent.closeCode ?? codeOrEvent.statusCode;
    const code = Number.parseInt(rawCode, 10);
    return {
      code: Number.isFinite(code) ? code : null,
      reason: String(
        reasonArg
        ?? codeOrEvent.reason
        ?? codeOrEvent.message
        ?? ''
      ).trim(),
    };
  }

  const code = Number.parseInt(codeOrEvent, 10);
  return {
    code: Number.isFinite(code) ? code : null,
    reason: String(reasonArg ?? '').trim(),
  };
}

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
    const handleSessionClose = async (eventName, codeOrEvent, reasonArg) => {
      if (listener[LISTENER_CLOSE_HANDLED_FLAG] === true) return;
      listener[LISTENER_CLOSE_HANDLED_FLAG] = true;

      const { code, reason } = normalizeListenerCloseEvent(codeOrEvent, reasonArg);
      const currentApi = this.getAccountApi(accountKey);
      if (currentApi && currentApi !== api) {
        console.warn(
          `[zalo-listener] Ignoring ${eventName} from stale listener at ${context} `
          + `(accountId=${accountKey}, code=${code ?? 'unknown'})`
        );
        return;
      }

      const isTakeoverClose = ZALO_TAKEOVER_CLOSE_CODES.has(code);
      if (isTakeoverClose) {
        try {
          await campaignZaloSenderRepository.markAccountDisconnectedById(accountKey);
        } catch (error) {
          console.warn(
            `[zalo-listener] Failed to mark account disconnected after ${eventName} `
            + `(accountId=${accountKey}, code=${code}): ${error?.message || 'Unknown DB error'}`
          );
        } finally {
          this.clearAccountApi(accountKey, api);
        }

        console.warn(
          `[zalo-listener] Session closed by Zalo takeover at ${context} `
          + `(accountId=${accountKey}, code=${code}, reason=${reason || 'none'}). `
          + 'Marked account as disconnected.'
        );
        return;
      }

      this.clearAccountApi(accountKey, api);
      console.warn(
        `[zalo-listener] Session ${eventName} at ${context} `
        + `(accountId=${accountKey}, code=${code ?? 'unknown'}, reason=${reason || 'none'}). `
        + 'Cleared in-memory API; account status is preserved for auto-restore.'
      );
    };

    listener.on('error', (event) => {
      const rawError = event?.error || event?.cause || event;
      const message = rawError?.message || event?.message || 'Unknown listener error';
      console.warn(
        `[zalo-listener] WebSocket error at ${context} (accountId=${accountKey}): ${message}`
      );
    });
    listener.on('connected', () => {
      listener[LISTENER_CLOSE_HANDLED_FLAG] = false;
    });
    listener.on('closed', (...args) => {
      handleSessionClose('closed', ...args);
    });
    listener.on('disconnected', (...args) => {
      handleSessionClose('disconnected', ...args);
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
   * @param {any} expectedApi
   * @returns {void}
   */
  clearAccountApi(accountId, expectedApi = null) {
    const key = String(accountId || '').trim();
    if (!key) return;
    if (expectedApi && this.apiByAccountId.get(key) !== expectedApi) return;
    this.apiByAccountId.delete(key);
  }
}

export default new ZaloAccountSessionService();

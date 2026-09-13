/**
 * inboxForwarder.js
 *
 * In-process replacement for `telegram-gateway/app/handlers.py`.
 * Forwards inbound messages from the channel transport to the Node.js
 * `/api/internal/telegram-webhook` route via an in-memory HTTP loopback.
 *
 * Why a loopback HTTP call instead of importing the route handler
 * directly?
 *   - The webhook route is the documented public boundary for sibling
 *     services. Keeping the loopback means we can later split the
 *     gateway into its own Node process (or another language) without
 *     touching the webhook handler.
 *   - The route handler already does authentication, debounce,
 *     persistence, AI routing, and reply orchestration. Re-implementing
 *     it here would duplicate code.
 *
 * The shared secret is the same one `telegramGatewayProcess.manager`
 * generates for embedded mode. We do NOT add any extra HMAC — the
 * loopback URL is `127.0.0.1`, only the local Node process can reach it.
 */

import http from 'node:http';

const logInfo = (msg, meta) =>
  meta !== undefined ? console.log(msg, meta) : console.log(msg);
const logWarn = (msg) => console.warn(msg);

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * One shared forwarder, configurable per channel.
 */
export class InboxForwarder {
  /**
   * @param {Object} deps
   * @param {string} deps.channel - 'telegram'
   * @param {() => string} deps.secretResolver - returns the current
   *   shared secret. Pulled lazily because the secret may be generated
   *   AFTER bootstrap by the gateway manager.
   * @param {() => {host: string, port: number}} deps.targetResolver -
   *   returns the loopback target (defaults to `127.0.0.1:<PORT>`).
   * @param {number} [deps.timeoutMs]
   */
  constructor({ channel, secretResolver, targetResolver, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!channel) throw new Error('[InboxForwarder] channel is required');
    if (typeof secretResolver !== 'function') {
      throw new Error('[InboxForwarder] secretResolver must be a function');
    }
    this._channel = channel;
    this._secretResolver = secretResolver;
    this._targetResolver =
      targetResolver ||
      (() => ({
        host: '127.0.0.1',
        port: Number(process.env.PORT || 5001),
      }));
    this._timeoutMs = timeoutMs;
  }

  /**
   * Forward an inbound message to the Node webhook.
   *
   * @param {Object} payload - Channel-specific normalised event.
   *   Required keys depend on the channel adapter's
   *   `parseWebhookEvent` shape. For Telegram, the payload is
   *   exactly what the Python gateway used to POST.
   * @returns {Promise<{ status: number }>}
   */
  async forward(payload) {
    const { host, port } = this._targetResolver();
    const secret = this._secretResolver();
    if (!secret) {
      logWarn(
        `[InboxForwarder:${this._channel}] no shared secret yet — dropping message`
      );
      return { status: 0, skipped: true };
    }

    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host,
          port,
          path: `/api/internal/${this._channel}-webhook`,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            'x-gateway-secret': secret,
          },
          timeout: this._timeoutMs,
        },
        (res) => {
          // Drain so the socket can be reused / closed cleanly.
          res.on('data', () => {});
          res.on('end', () => resolve({ status: res.statusCode || 0 }));
        }
      );
      req.on('timeout', () => {
        req.destroy(new Error(`InboxForwarder timeout after ${this._timeoutMs}ms`));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    }).catch((err) => {
      logWarn(
        `[InboxForwarder:${this._channel}] forward failed (${err.message}); payload dropped`
      );
      // Non-fatal: chat history is best-effort. Swallow so the
      // transport's own message loop does not crash.
      return { status: 0, error: err.message };
    });
  }
}

let _telegramSingleton = null;

export function getTelegramInboxForwarder(gatewayState) {
  if (!_telegramSingleton) {
    _telegramSingleton = new InboxForwarder({
      channel: 'telegram',
      secretResolver: () => gatewayState.getSecret?.() || process.env.TELEGRAM_GATEWAY_SECRET || '',
      targetResolver: () => {
        const url = gatewayState.getNodeJsCallbackUrl?.();
        return parseLoopbackUrl(url) || defaultTarget();
      },
    });
  }
  return _telegramSingleton;
}

function defaultTarget() {
  return {
    host: '127.0.0.1',
    port: Number(process.env.PORT || 5001),
  };
}

function parseLoopbackUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return { host: u.hostname || '127.0.0.1', port: Number(u.port || 5001) };
  } catch {
    return null;
  }
}

/**
 * Test-only: drop singletons.
 */
export function _resetInboxForwarders() {
  _telegramSingleton = null;
}

export default { InboxForwarder, getTelegramInboxForwarder };

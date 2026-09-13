/**
 * warnOnce.js
 *
 * Tiny helper that suppresses duplicate `console.warn` calls. The
 * in-process channel gateway logs a warning when the stub transport
 * is loaded so operators know `TelegramClient` still needs a real
 * implementation. Without deduplication the message floods logs
 * every time the session manager hydrates a client.
 */

const _warnedKeys = new Set();

/**
 * Log `message` exactly once per `key`. Subsequent calls with the
 * same key are silently dropped. Pass `meta` for structured context
 * (e.g. an error stack).
 *
 * @param {string} key - Stable identifier for the warning.
 * @param {string} message
 * @param {unknown} [meta]
 */
export function warnOnce(key, message, meta) {
  if (_warnedKeys.has(key)) return;
  _warnedKeys.add(key);
  if (meta !== undefined) {
    console.warn(message, meta);
  } else {
    console.warn(message);
  }
}

/**
 * Test-only: forget every warned key so the next call logs again.
 */
export function _resetWarnOnce() {
  _warnedKeys.clear();
}

export default { warnOnce, _resetWarnOnce };

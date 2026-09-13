/**
 * Pure env-read helpers for the in-process channel gateway.
 *
 * Kept in its own module (no imports from auth/facade code) so the
 * auth modules can import these helpers without creating circular
 * imports back through the gateway bootstrap.
 */

/**
 * Returns `true` when no real transport class was loaded for the
 * channel — i.e. `TELEGRAM_GATEWAY_TRANSPORT` is unset, equals
 * "stub", or the load failed. Used by:
 *   - the boot hook to print a startup warning
 *   - `getState()` so /health endpoints can surface it
 *   - the auth `start()` methods (defense-in-depth, so direct callers
 *     and tests can short-circuit before they touch a real client)
 *   - the controller, which returns 503 with a tagged `code`
 */
export function isStubOnly({ channel }) {
  const envVar = channel === 'telegram' ? 'TELEGRAM_GATEWAY_TRANSPORT' : null;
  if (!envVar) return true;
  const v = process.env[envVar];
  return !v || v === 'stub' || v === 'default';
}

/** Channel-keyed code-tag returned in 503 JSON responses. */
export function stubTransportCode({ channel }) {
  return channel === 'telegram'
    ? 'TELEGRAM_STUB_TRANSPORT'
    : `${String(channel).toUpperCase()}_STUB_TRANSPORT`;
}

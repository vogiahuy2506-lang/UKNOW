export const SSE_BASE_DELAY_MS = 3000;
export const SSE_MAX_DELAY_MS = 60000;
export const SSE_MAX_FAILURES = 10;
export const SSE_HEARTBEAT_TIMEOUT = 60000;

/** Exponential backoff with ±20% jitter. failureCount starts at 1. */
export function nextSseBackoffMs(failureCount) {
  const exp = Math.min(
    SSE_MAX_DELAY_MS,
    SSE_BASE_DELAY_MS * 2 ** Math.max(0, failureCount - 1)
  );
  return Math.round(exp * (0.8 + Math.random() * 0.4));
}

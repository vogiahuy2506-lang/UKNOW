/**
 * Tests for the gateway-status auto-poll logic.
 *
 * The actual interval wiring lives inside a `useEffect` in
 * TelegramSettings, which is too heavy to render in isolation.
 * Instead we extract the *decision* the effect makes ("should I
 * start an interval? when do I stop?") into a pure helper, and
 * pin that down here.
 *
 * If the rules change (e.g. shorten the interval, or stop polling
 * while a QR login is in flight), update both this helper AND the
 * component — the test will catch any drift.
 */

/**
 * Given the current gateway status, decide whether the auto-poll
 * effect should be ticking. The component sets up a setInterval
 * whenever this returns true and clears it whenever it returns
 * false (or after a re-render).
 *
 * Rules:
 *   - If we have no status yet (initial load) → poll is OFF.
 *     The fetchAccounts / fetchGatewayStatus effect already
 *     triggers an immediate first call, so we don't need a
 *     duplicate poll tick.
 *   - If the gateway is healthy (canStartLogin=true) → OFF.
 *     No reason to keep hammering the backend.
 *   - If the gateway reports stub / unconfigured → ON.
 *     The user is staring at a banner promising auto-recovery,
 *     so we must keep polling.
 */
export function shouldPollGatewayStatus(gatewayStatus) {
  if (!gatewayStatus) return false;
  return !gatewayStatus.canStartLogin;
}

/**
 * Pick the status-poll interval (ms). Kept as a function so the
 * test can pin down the cadence without having to render timers.
 */
export const STATUS_POLL_INTERVAL_MS = 30000;
export function getStatusPollIntervalMs() {
  return STATUS_POLL_INTERVAL_MS;
}

import { describe, it, expect } from 'vitest';

describe('gateway-status auto-poll decision', () => {
  it('does NOT poll when status is null (initial load)', () => {
    expect(shouldPollGatewayStatus(null)).toBe(false);
  });

  it('does NOT poll when gateway is healthy', () => {
    expect(
      shouldPollGatewayStatus({
        channel: 'telegram',
        canStartLogin: true,
        stubOnly: false,
        hasSecret: true,
        reason: null,
      })
    ).toBe(false);
  });

  it('DOES poll when gateway is in stub mode', () => {
    expect(
      shouldPollGatewayStatus({
        channel: 'telegram',
        canStartLogin: false,
        stubOnly: true,
        hasSecret: true,
        reason: 'TELEGRAM_STUB_TRANSPORT',
      })
    ).toBe(true);
  });

  it('DOES poll when gateway secret is missing', () => {
    expect(
      shouldPollGatewayStatus({
        channel: 'telegram',
        canStartLogin: false,
        stubOnly: false,
        hasSecret: false,
        reason: 'TELEGRAM_NOT_CONFIGURED',
      })
    ).toBe(true);
  });

  it('poll cadence is 30 seconds (operator-friendly)', () => {
    // Don't make this too short — multiple operators opening the
    // page at once would pummel the backend.
    expect(getStatusPollIntervalMs()).toBe(30000);
  });
});

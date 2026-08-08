/**
 * Unit tests for zalo restore failure window → needs_reauth.
 * Uses real SQL against the unit project's mocked/in-memory? Prefer integration.
 * Here we test the CASE expression semantics via repository with a light mock —
 * actually campaignZaloSender.repository needs db. Put logic assertions in integration.
 *
 * This file documents the threshold helper for clarity if extracted later.
 */
import { describe, expect, it } from '@jest/globals';

const FAIL_THRESHOLD = 5;
const WINDOW_MS = 60 * 60 * 1000;

function shouldBecomeNeedsReauth({ nextCount, firstFailAt, now }) {
  if (nextCount < FAIL_THRESHOLD) return false;
  if (!firstFailAt) return false;
  return firstFailAt.getTime() <= now.getTime() - WINDOW_MS;
}

describe('needs_reauth threshold (time + count)', () => {
  const now = new Date('2026-08-05T12:00:00.000Z');

  it('fails 1–4 keep status', () => {
    for (let n = 1; n <= 4; n++) {
      expect(
        shouldBecomeNeedsReauth({
          nextCount: n,
          firstFailAt: new Date(now.getTime() - 2 * WINDOW_MS),
          now,
        })
      ).toBe(false);
    }
  });

  it('fail 5 but only 10 minutes old → still connected', () => {
    expect(
      shouldBecomeNeedsReauth({
        nextCount: 5,
        firstFailAt: new Date(now.getTime() - 10 * 60 * 1000),
        now,
      })
    ).toBe(false);
  });

  it('fail 5 and first fail 61 minutes ago → needs_reauth', () => {
    expect(
      shouldBecomeNeedsReauth({
        nextCount: 5,
        firstFailAt: new Date(now.getTime() - 61 * 60 * 1000),
        now,
      })
    ).toBe(true);
  });
});

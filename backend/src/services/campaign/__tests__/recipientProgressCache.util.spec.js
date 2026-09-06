import { describe, expect, it } from '@jest/globals';
import { shouldReplaceRecipientProgressCache } from '../recipientProgressCache.util.js';

describe('shouldReplaceRecipientProgressCache', () => {
  it('never replaces a terminal progress entry with an incomplete callback', () => {
    expect(shouldReplaceRecipientProgressCache(
      { lastCompletedStep: 3, isFullyCompleted: true, updatedAt: '2026-09-06T00:00:02.000Z' },
      { lastCompletedStep: 4, isFullyCompleted: false, updatedAt: '2026-09-06T00:00:03.000Z' }
    )).toBe(false);
  });

  it('keeps the higher step when an older callback completes later in Node', () => {
    expect(shouldReplaceRecipientProgressCache(
      { lastCompletedStep: 4, isFullyCompleted: false, updatedAt: '2026-09-06T00:00:04.000Z' },
      { lastCompletedStep: 3, isFullyCompleted: false, updatedAt: '2026-09-06T00:00:05.000Z' }
    )).toBe(false);
  });

  it('uses PostgreSQL updated_at to order equal-step callbacks', () => {
    const current = { lastCompletedStep: 2, isFullyCompleted: false, updatedAt: '2026-09-06T00:00:05.000Z' };

    expect(shouldReplaceRecipientProgressCache(current, {
      lastCompletedStep: 2,
      isFullyCompleted: false,
      updatedAt: '2026-09-06T00:00:04.000Z',
    })).toBe(false);
    expect(shouldReplaceRecipientProgressCache(current, {
      lastCompletedStep: 2,
      isFullyCompleted: false,
      updatedAt: '2026-09-06T00:00:06.000Z',
    })).toBe(true);
  });

  it('does not let an out-of-order callback win a same-millisecond tie once microsecond precision is available', () => {
    // Both commits round-trip to the same JS Date millisecond (a real risk since
    // node-postgres/Date only keep millisecond precision), but PostgreSQL's raw
    // EXTRACT(EPOCH ...) reading still orders them correctly at microsecond
    // resolution. The chronologically later write (higher updatedAtEpochUs) must
    // win regardless of which callback's Promise resolves first in Node.
    const committedSecond = {
      lastCompletedStep: 2,
      isFullyCompleted: false,
      updatedAt: '2026-09-06T00:00:05.000Z',
      updatedAtEpochUs: 1_757_120_405_000_900,
    };
    const committedFirst = {
      lastCompletedStep: 2,
      isFullyCompleted: false,
      updatedAt: '2026-09-06T00:00:05.000Z',
      updatedAtEpochUs: 1_757_120_405_000_100,
    };

    // committedSecond is cached first (its callback resolved first in the event
    // loop); committedFirst then arrives late and must be rejected even though
    // Date.parse(updatedAt) alone would see an exact tie.
    expect(shouldReplaceRecipientProgressCache(committedSecond, committedFirst)).toBe(false);
    expect(shouldReplaceRecipientProgressCache(committedFirst, committedSecond)).toBe(true);
  });

  it('keeps the current entry on a genuine exact-microsecond tie instead of always accepting the candidate', () => {
    const current = {
      lastCompletedStep: 2,
      isFullyCompleted: false,
      updatedAt: '2026-09-06T00:00:05.000Z',
      updatedAtEpochUs: 1_757_120_405_000_500,
    };
    const candidate = {
      lastCompletedStep: 2,
      isFullyCompleted: false,
      updatedAt: '2026-09-06T00:00:05.000Z',
      updatedAtEpochUs: 1_757_120_405_000_500,
    };

    expect(shouldReplaceRecipientProgressCache(current, candidate)).toBe(false);
  });
});

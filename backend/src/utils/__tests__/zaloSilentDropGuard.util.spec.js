/**
 * Cơ chế tự dừng khi Zalo nuốt tin (silent drop) — sự cố production 23/10/2026.
 */

import { describe, expect, it } from '@jest/globals';

import {
  evaluateZaloSilentDropGuard,
  resolveZaloSilentDropGuardThresholds,
} from '../zaloSilentDropGuard.util.js';

describe('resolveZaloSilentDropGuardThresholds', () => {
  it('mặc định: ≥5 lượt xử lý, ≥3 lần drop, ≥30% tỉ lệ', () => {
    expect(resolveZaloSilentDropGuardThresholds({})).toEqual({
      minAttempts: 5,
      minRate: 0.3,
      minDrops: 3,
    });
  });

  it('env ghi đè được; rate dạng phần trăm cũng nhận', () => {
    expect(resolveZaloSilentDropGuardThresholds({
      ZALO_SILENT_DROP_GUARD_MIN_ATTEMPTS: '10',
      ZALO_SILENT_DROP_GUARD_MIN_RATE: '50',
      ZALO_SILENT_DROP_GUARD_MIN_DROPS: '7',
    })).toEqual({ minAttempts: 10, minRate: 0.5, minDrops: 7 });
  });

  it('env rác không làm hỏng ngưỡng', () => {
    expect(resolveZaloSilentDropGuardThresholds({
      ZALO_SILENT_DROP_GUARD_MIN_ATTEMPTS: 'abc',
      ZALO_SILENT_DROP_GUARD_MIN_RATE: '-1',
    })).toEqual({ minAttempts: 5, minRate: 0.3, minDrops: 3 });
  });
});

describe('evaluateZaloSilentDropGuard', () => {
  it('KHÔNG dừng khi số lượt xử lý còn ít (tránh dừng vì 1 lỗi đầu tiên)', () => {
    const result = evaluateZaloSilentDropGuard(
      { attempts: 2, silentDrops: 2 },
      {},
    );
    expect(result.shouldStop).toBe(false);
  });

  it('KHÔNG dừng khi tỉ lệ drop thấp', () => {
    const result = evaluateZaloSilentDropGuard(
      { attempts: 20, silentDrops: 2 },
      {},
    );
    expect(result.shouldStop).toBe(false);
  });

  it('DỪNG khi đủ lượt + đủ số lần drop + tỉ lệ vượt ngưỡng', () => {
    const result = evaluateZaloSilentDropGuard(
      { attempts: 10, silentDrops: 6 },
      {},
    );
    expect(result.shouldStop).toBe(true);
    expect(result.rate).toBeCloseTo(0.6);
    expect(result.reason).toContain('silent-drop');
  });

  it('không có lượt nào thì không dừng (tránh 0/0 = NaN)', () => {
    const result = evaluateZaloSilentDropGuard({}, {});
    expect(result.shouldStop).toBe(false);
    expect(result.rate).toBe(0);
  });
});

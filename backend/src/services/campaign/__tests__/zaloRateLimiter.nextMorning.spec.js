import { afterEach, describe, expect, it, jest } from '@jest/globals';
import ZaloRateLimiter from '../zaloRateLimiter.js';

/**
 * PR-4 Việc 4.4 — `computeNextMorningSendAtMs`: mốc "sáng kế tiếp" (giờ hết khung yên lặng, mặc định 06:00 giờ VN)
 * sớm nhất còn ở tương lai, tính bằng offset +7 cố định — không phụ thuộc múi giờ của OS/VPS.
 */
const vnTimeMs = (y, m, d, h, min = 0, s = 0, ms = 0) => Date.UTC(y, m - 1, d, h, min, s, ms) - 7 * 60 * 60 * 1000;

describe('ZaloRateLimiter.computeNextMorningSendAtMs', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['09:00 → 06:00 hôm sau', vnTimeMs(2026, 10, 19, 9, 0), vnTimeMs(2026, 10, 20, 6, 0)],
    ['23:30 → 06:00 hôm sau', vnTimeMs(2026, 10, 19, 23, 30), vnTimeMs(2026, 10, 20, 6, 0)],
    ['00:05 → 06:00 cùng ngày', vnTimeMs(2026, 10, 20, 0, 5), vnTimeMs(2026, 10, 20, 6, 0)],
    ['05:59:59.999 → 06:00 cùng ngày', vnTimeMs(2026, 10, 20, 5, 59, 59, 999), vnTimeMs(2026, 10, 20, 6, 0)],
    ['đúng 06:00:00.000 → 06:00 hôm sau (luôn ở tương lai)', vnTimeMs(2026, 10, 20, 6, 0), vnTimeMs(2026, 10, 21, 6, 0)],
    ['qua ranh giới tháng: 31/10 10:00 → 06:00 01/11', vnTimeMs(2026, 10, 31, 10, 0), vnTimeMs(2026, 11, 1, 6, 0)],
  ])('%s', (_label, nowMs, expectedMs) => {
    const limiter = new ZaloRateLimiter();
    expect(limiter.computeNextMorningSendAtMs(nowMs)).toBe(expectedMs);
    expect(limiter.computeNextMorningSendAtMs(nowMs)).toBeGreaterThan(nowMs);
  });

  it('theo giờ hết yên lặng cấu hình (quietEnd=7) chứ không cứng 06:00', () => {
    const limiter = new ZaloRateLimiter({ ZALO_OUTBOUND_QUIET_HOURS_END_SAFE: 7 });
    expect(limiter.computeNextMorningSendAtMs(vnTimeMs(2026, 10, 19, 9, 0))).toBe(vnTimeMs(2026, 10, 20, 7, 0));
  });
});

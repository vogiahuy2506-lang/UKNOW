import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import ZaloRateLimiter from '../zaloRateLimiter.js';

/**
 * PR-2: hạn mức tra số điện thoại của Zalo tính THEO NGÀY, reset lúc 00:00 giờ VN — không phải
 * "chặn N giờ kể từ lúc gặp lỗi" (run 374 production: lỗi Zalo nguyên văn "thử lại vào 00:00").
 *
 * Ba việc cần chốt bằng test:
 * 1. scheduleZaloPersonalPhoneLookupCooldown phải trả mốc 00:00 giờ VN kế tiếp, đúng ở mọi giờ.
 * 2. enforceOutboundPolicyBeforeSend phải áp cooldown này cho MỌI kênh (không chỉ zalo_personal).
 * 3. Gọi lại schedule không được rút ngắn một cooldown đang có.
 */

const vnTimeMs = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h, min, 0, 0) - 7 * 60 * 60 * 1000;

describe('ZaloRateLimiter — cooldown tra số điện thoại reset theo 00:00 giờ VN', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('scheduleZaloPersonalPhoneLookupCooldown / getPhoneLookupCooldownUntil', () => {
    it.each([
      ['09:00', vnTimeMs(2026, 9, 11, 9, 0), vnTimeMs(2026, 9, 12, 0, 0)],
      ['23:30', vnTimeMs(2026, 9, 11, 23, 30), vnTimeMs(2026, 9, 12, 0, 0)],
      ['00:05', vnTimeMs(2026, 9, 11, 0, 5), vnTimeMs(2026, 9, 12, 0, 0)],
    ])('bị chặn lúc %s giờ VN → cooldown tới 00:00 giờ VN kế tiếp', (_label, nowMs, expectedUntilMs) => {
      jest.useFakeTimers().setSystemTime(new Date(nowMs));
      const limiter = new ZaloRateLimiter();
      const untilMs = limiter.scheduleZaloPersonalPhoneLookupCooldown('acc1');
      expect(untilMs).toBe(expectedUntilMs);
      expect(limiter.getPhoneLookupCooldownUntil('acc1')).toBe(expectedUntilMs);
    });
  });

  describe('enforceOutboundPolicyBeforeSend — cooldown áp cho mọi kênh, không chỉ zalo_personal', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date(vnTimeMs(2026, 9, 11, 9, 0)));
    });

    it('channel=zalo_friend_request và tài khoản đang cooldown → phải chờ (trước PR này thì đi thẳng)', async () => {
      const limiter = new ZaloRateLimiter();
      limiter.scheduleZaloPersonalPhoneLookupCooldown('acc1');

      const yieldOrSleep = jest.fn().mockImplementation(() => {
        // Mô phỏng đúng hợp đồng thật (persistZaloDeferYieldSlot): thoát khỏi vòng lặp bằng
        // cách ném lỗi điều khiển, không thực sự chờ trong unit test.
        const err = new Error('yielded');
        err.code = 'TEST_YIELD_SLOT';
        throw err;
      });
      const ensureRunStillRunning = jest.fn().mockResolvedValue(undefined);
      const sleepWithRunCheck = jest.fn().mockResolvedValue(undefined);

      await expect(
        limiter.enforceOutboundPolicyBeforeSend({
          accountId: 'acc1',
          channel: 'zalo_friend_request',
          yieldOrSleep,
          sleepWithRunCheck,
          ensureRunStillRunning,
          runId: 1,
        })
      ).rejects.toMatchObject({ code: 'TEST_YIELD_SLOT' });

      expect(yieldOrSleep).toHaveBeenCalledTimes(1);
      expect(yieldOrSleep).toHaveBeenCalledWith(expect.any(Number), 'phone_lookup_cooldown');
      expect(sleepWithRunCheck).not.toHaveBeenCalled();
    });

    it('channel=zalo_group và tài khoản đang cooldown → cũng phải chờ', async () => {
      const limiter = new ZaloRateLimiter();
      limiter.scheduleZaloPersonalPhoneLookupCooldown('acc1');

      const yieldOrSleep = jest.fn().mockImplementation(() => {
        const err = new Error('yielded');
        err.code = 'TEST_YIELD_SLOT';
        throw err;
      });

      await expect(
        limiter.enforceOutboundPolicyBeforeSend({
          accountId: 'acc1',
          channel: 'zalo_group',
          yieldOrSleep,
          sleepWithRunCheck: jest.fn(),
          ensureRunStillRunning: jest.fn().mockResolvedValue(undefined),
          runId: 1,
        })
      ).rejects.toMatchObject({ code: 'TEST_YIELD_SLOT' });

      expect(yieldOrSleep).toHaveBeenCalledWith(expect.any(Number), 'phone_lookup_cooldown');
    });

    it('không có cooldown nào đang treo → đi thẳng qua, không chờ', async () => {
      const limiter = new ZaloRateLimiter();
      const yieldOrSleep = jest.fn();
      const sleepWithRunCheck = jest.fn().mockResolvedValue(undefined);

      await limiter.enforceOutboundPolicyBeforeSend({
        accountId: 'acc1',
        channel: 'zalo_friend_request',
        yieldOrSleep,
        sleepWithRunCheck,
        ensureRunStillRunning: jest.fn().mockResolvedValue(undefined),
        runId: 1,
      });

      expect(yieldOrSleep).not.toHaveBeenCalled();
    });
  });

  describe('Math.max(prevUntil, candidateUntil) — không cho lùi cooldown đang có', () => {
    it('cooldown đang có xa hơn mốc mới tính ra → gọi lại vẫn giữ mốc xa hơn, không bị rút ngắn', () => {
      jest.useFakeTimers().setSystemTime(new Date(vnTimeMs(2026, 9, 11, 9, 0)));
      const limiter = new ZaloRateLimiter();
      // Giả lập một cooldown đang có xa hơn 00:00 giờ VN kế tiếp — bất kể lý do (lỗi trước đó,
      // hay công thức tính mốc bị đổi khác về sau) — lần gọi mới không được phép kéo nó lùi lại.
      const fartherFutureMs = vnTimeMs(2026, 9, 15, 0, 0);
      limiter.zaloPersonalPhoneLookupCooldownUntil.set('acc1', fartherFutureMs);

      const untilMs = limiter.scheduleZaloPersonalPhoneLookupCooldown('acc1');

      expect(untilMs).toBe(fartherFutureMs);
      expect(limiter.getPhoneLookupCooldownUntil('acc1')).toBe(fartherFutureMs);
    });

    it('gọi hai lần liên tiếp trong cùng ngày → mốc không đổi (idempotent)', () => {
      jest.useFakeTimers().setSystemTime(new Date(vnTimeMs(2026, 9, 11, 9, 0)));
      const limiter = new ZaloRateLimiter();
      const firstUntilMs = limiter.scheduleZaloPersonalPhoneLookupCooldown('acc1');

      jest.setSystemTime(new Date(vnTimeMs(2026, 9, 11, 14, 0)));
      const secondUntilMs = limiter.scheduleZaloPersonalPhoneLookupCooldown('acc1');

      expect(secondUntilMs).toBe(firstUntilMs);
    });
  });
});

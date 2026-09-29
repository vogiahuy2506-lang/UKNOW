import { afterEach, describe, expect, it, jest } from '@jest/globals';
import ZaloRateLimiter from '../zaloRateLimiter.js';

/**
 * PLAN_GUI_NHANH_ZALO_GIAN_CACH_2026-09-28 PR-2 Việc 4 — cổng KHÔNG-NGỦ `tryAcquireOutboundSlot`,
 * dùng chung state (`zaloOutboundRateLimitState`) với `enforceOutboundPolicyBeforeSend` (chiến
 * dịch). Bảng dưới khớp đúng mục "Nghiệm thu PR-2" trong plan.
 */
const vnTimeMs = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h, min, 0, 0) - 7 * 60 * 60 * 1000;

describe('ZaloRateLimiter — tryAcquireOutboundSlot (PR-2 Việc 4, cổng không-ngủ)', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('Limiter: lần 1 -> ok', () => {
    const limiter = new ZaloRateLimiter();
    const res = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: 1_000_000 });
    expect(res).toEqual({ ok: true });
  });

  it('Lần 2 gọi ngay sau (cùng nowMs) -> inter_message_delay, waitMs ∈ [minDelayMs, maxDelayMs]', () => {
    const limiter = new ZaloRateLimiter();
    const t0 = 1_000_000;
    limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 });
    const res = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('inter_message_delay');
    // Mặc định ZALO_OUTBOUND_INTER_MESSAGE_MIN/MAX_MS_DEFAULT = 20000/50000.
    expect(res.waitMs).toBeGreaterThanOrEqual(20_000);
    expect(res.waitMs).toBeLessThanOrEqual(50_000);
  });

  it('Tiến đúng tới nextAllowedAtMs -> ok', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // -> luôn đúng minDelayMs (20000ms mặc định)
    const limiter = new ZaloRateLimiter();
    const t0 = 1_000_000;
    limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 });

    const tooEarly = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 + 19_999 });
    expect(tooEarly.ok).toBe(false);

    const res = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 + 20_000 });
    expect(res).toEqual({ ok: true });
  });

  it('23:30 giờ VN -> quiet_hours, waitMs = 6h30 = 23.400.000ms', () => {
    const limiter = new ZaloRateLimiter();
    const nowMs = vnTimeMs(2026, 9, 11, 23, 30);
    const res = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs });
    expect(res).toEqual({ ok: false, reason: 'quiet_hours', waitMs: 6.5 * 60 * 60 * 1000 });
  });

  it('limitPerWindow=2, lần 3 -> rate_limited, waitMs = windowStart + 1h - now', () => {
    const limiter = new ZaloRateLimiter({ ZALO_PERSONAL_PER_HOUR_LIMIT: 2 });
    const t0 = 1_000_000;
    limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 });
    const t1 = t0 + 60_000; // đủ xa để không dính inter_message_delay
    limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t1 });
    const t2 = t1 + 60_000;
    const res = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t2 });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('rate_limited');
    expect(res.waitMs).toBe(t0 + 60 * 60 * 1000 - t2);
  });

  it('Khoá tra số: cá nhân theo SĐT -> phone_lookup_cooldown; nhóm CÙNG tài khoản -> ok', () => {
    jest.useFakeTimers().setSystemTime(new Date(vnTimeMs(2026, 9, 11, 9, 0)));
    const limiter = new ZaloRateLimiter();
    limiter.scheduleZaloPersonalPhoneLookupCooldown('acc1');
    const now = Date.now();

    const personalRes = limiter.tryAcquireOutboundSlot({
      accountId: 'acc1', channel: 'zalo_personal', requiresPhoneLookup: true, nowMs: now,
    });
    expect(personalRes.ok).toBe(false);
    expect(personalRes.reason).toBe('phone_lookup_cooldown');

    const groupRes = limiter.tryAcquireOutboundSlot({
      accountId: 'acc1', channel: 'zalo_group', requiresPhoneLookup: false, nowMs: now,
    });
    expect(groupRes).toEqual({ ok: true });
  });

  it('Request 2 người, không nghỉ giữa 2 lần gọi -> người 1 ok, người 2 deferred (inter_message_delay)', () => {
    const limiter = new ZaloRateLimiter();
    const t0 = 1_000_000;
    const first = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 });
    const second = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 });
    expect(first).toEqual({ ok: true });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('inter_message_delay');
  });

  it('Chiến dịch đang ngủ giãn cách, gửi nhanh chen vào ghi lần thử MỚI -> chiến dịch ngủ TIẾP (sleepWithRunCheck gọi đúng 2 lần)', async () => {
    jest.useFakeTimers().setSystemTime(new Date(vnTimeMs(2026, 9, 11, 9, 0)));
    jest.spyOn(Math, 'random').mockReturnValue(0); // mọi lần rút ngẫu nhiên đều ra đúng minDelayMs.
    const limiter = new ZaloRateLimiter();
    const t0 = Date.now();

    // Chiến dịch đã gửi 1 tin trước đó (giữ nguyên độ dài ngủ hiện tại — plan cấm đổi).
    const grant1 = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal' });
    expect(grant1).toEqual({ ok: true });

    let sleepCallCount = 0;
    const sleepWithRunCheck = jest.fn().mockImplementation(async () => {
      sleepCallCount += 1;
      if (sleepCallCount === 1) {
        // Đúng lúc chiến dịch đang ở bước ngủ LẦN 1 — thời gian đã trôi tới nextAllowedAtMs,
        // gửi nhanh chen vào giành đúng slot này (ghi lastAttemptAtMs MỚI).
        jest.setSystemTime(new Date(t0 + 20_000));
        const interjected = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal' });
        expect(interjected).toEqual({ ok: true });
      }
    });
    const ensureRunStillRunning = jest.fn().mockResolvedValue(undefined);
    const yieldOrSleep = jest.fn();

    await limiter.enforceOutboundPolicyBeforeSend({
      accountId: 'acc1',
      channel: 'zalo_personal',
      yieldOrSleep,
      sleepWithRunCheck,
      ensureRunStillRunning,
      runId: 1,
    });

    expect(sleepWithRunCheck).toHaveBeenCalledTimes(2);
    expect(yieldOrSleep).not.toHaveBeenCalled();
  });
});

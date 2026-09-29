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

  it('Lần 2 gọi ngay sau (cùng nowMs) -> inter_message_delay, waitMs = minDelayMs', () => {
    const limiter = new ZaloRateLimiter();
    const t0 = 1_000_000;
    limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 });
    const res = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('inter_message_delay');
    // Mặc định ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT = 20000 — backend chỉ giữ khoảng TỐI THIỂU.
    expect(res.waitMs).toBe(20_000);
  });

  // Review 28/09 — bản đầu bốc thêm một mốc ngẫu nhiên riêng ở backend: bên gọi (trình duyệt) đã chờ
  // đủ ngẫu nhiên ≥ minDelayMs vẫn bị hoãn ~50% lần, "Chạy thử" trình dựng dừng hẳn. Ghim: đúng mốc
  // tối thiểu thì LUÔN được, bất kể Math.random ra gì.
  it.each([0, 0.5, 0.999])('Bên gọi chờ đúng minDelayMs -> ok, không phụ thuộc Math.random (=%s)', (randomValue) => {
    jest.spyOn(Math, 'random').mockReturnValue(randomValue);
    const limiter = new ZaloRateLimiter();
    const t0 = 1_000_000;
    limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 });
    const res = limiter.tryAcquireOutboundSlot({ accountId: 'acc1', channel: 'zalo_personal', nowMs: t0 + 20_000 });
    expect(res).toEqual({ ok: true });
  });

  it('Tiến đúng tới lần thử trước + minDelayMs -> ok; sớm 1ms -> hoãn', () => {
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
        // Đúng lúc chiến dịch đang ở bước ngủ LẦN 1 — thời gian đã trôi tới lần thử trước + minDelayMs,
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

describe('zaloOutboundRateLimiterSingleton — reset cho test', () => {
  // Review 28/09 — campaignRunService giữ tham chiếu instance từ lúc khởi tạo; reset mà tạo instance MỚI
  // thì controller gửi nhanh và chiến dịch tách thành 2 instance trong integration test.
  it('reset giữ NGUYÊN instance (cùng tham chiếu) và xoá trạng thái nhịp + cooldown tra số', async () => {
    const { getSharedZaloRateLimiter, _resetSharedZaloRateLimiterForTests } = await import('../zaloOutboundRateLimiterSingleton.js');
    const before = getSharedZaloRateLimiter();
    before.tryAcquireOutboundSlot({ accountId: 'acc-reset', channel: 'zalo_personal', nowMs: 1_000_000 });
    before.scheduleZaloPersonalPhoneLookupCooldown('acc-reset');

    _resetSharedZaloRateLimiterForTests();

    const after = getSharedZaloRateLimiter();
    expect(after).toBe(before);
    expect(after.zaloOutboundRateLimitState.size).toBe(0);
    expect(after.zaloPersonalPhoneLookupCooldownUntil.size).toBe(0);
  });
});

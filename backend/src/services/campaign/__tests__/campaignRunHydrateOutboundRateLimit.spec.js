import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-S2: `hydrateOutboundRateLimitState` nạp bộ đếm tin/giờ của bộ giới hạn gửi Zalo từ
 * `zalo_messages` lúc khởi động. Test trên hàm này với repository giả.
 */

const mockListRecent = jest.fn().mockResolvedValue([]);

jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({
  default: { listRecentOutboundAttemptsByAccount: mockListRecent },
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('CampaignRunService.hydrateOutboundRateLimitState (PR-S2)', () => {
  const NOW = new Date('2026-09-29T10:00:00.000Z').getTime();
  let limiter;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW });
    mockListRecent.mockResolvedValue([]);
    limiter = campaignRunService.zaloRateLimiter;
    limiter.zaloOutboundRateLimitState.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    limiter.zaloOutboundRateLimitState.clear();
  });

  it('hỏi repository cho từng kênh với windowMs của policy kênh đó (không bind Date JS)', async () => {
    await campaignRunService.hydrateOutboundRateLimitState();

    const channels = mockListRecent.mock.calls.map(([channel]) => channel);
    expect(channels).toEqual(['zalo_personal', 'zalo_group', 'zalo_friend_request']);
    for (const [channel, windowMs] of mockListRecent.mock.calls) {
      expect(windowMs).toBe(limiter.resolveOutboundPolicy(channel).windowMs);
    }
  });

  it('đổ attemptCount / windowStart / lastAttempt vào Map, policyFingerprint null', async () => {
    const first = new Date(NOW - 10 * 60 * 1000);
    const last = new Date(NOW - 60 * 1000);
    mockListRecent.mockImplementation(async (channel) => (channel === 'zalo_personal'
      ? [{ accountId: '501', attemptCount: 3, firstAttemptAt: first, lastAttemptAt: last }]
      : []));

    const loaded = await campaignRunService.hydrateOutboundRateLimitState();

    expect(loaded).toBe(1);
    expect(limiter.zaloOutboundRateLimitState.get('501:zalo_personal')).toEqual({
      windowStartMs: first.getTime(),
      attemptCount: 3,
      lastAttemptAtMs: last.getTime(),
      policyFingerprint: null,
    });
    expect(limiter.zaloOutboundRateLimitState.size).toBe(1);
  });

  it('không ghi đè trạng thái đang có bằng số liệu cũ hơn: lastAttemptAtMs giữ mốc mới (Math.max), attemptCount giữ nguyên', async () => {
    const liveLast = NOW - 1000;
    limiter.zaloOutboundRateLimitState.set('501:zalo_personal', {
      windowStartMs: NOW - 2000,
      attemptCount: 1,
      lastAttemptAtMs: liveLast,
      policyFingerprint: 'x',
    });
    mockListRecent.mockImplementation(async (channel) => (channel === 'zalo_personal'
      ? [{
        accountId: '501',
        attemptCount: 3,
        firstAttemptAt: new Date(NOW - 600000),
        lastAttemptAt: new Date(NOW - 60000),
      }]
      : []));

    const loaded = await campaignRunService.hydrateOutboundRateLimitState();

    expect(loaded).toBe(0);
    const state = limiter.zaloOutboundRateLimitState.get('501:zalo_personal');
    expect(state.lastAttemptAtMs).toBe(liveLast);
    expect(state.attemptCount).toBe(1);
    expect(state.policyFingerprint).toBe('x');
  });
});

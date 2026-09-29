import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-S2: initScheduler phải gọi hydrateOutboundRateLimitState lúc khởi động (cạnh
 * hydratePhoneLookupCooldowns), kể cả khi SCHEDULER_ENABLED=false — đây là khôi phục trạng thái,
 * không phải scheduled job.
 */

const hydrateOutboundMock = jest.fn().mockResolvedValue(0);
const hydrateCooldownMock = jest.fn().mockResolvedValue(0);

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: jest.fn() },
  isConnectionError: () => false,
}));

jest.unstable_mockModule('../../controllers/campaign.controller.js', () => ({
  default: { createCampaignRunRecord: jest.fn(), executeCampaign: jest.fn() },
}));

jest.unstable_mockModule('../../services/campaign/campaignRun.service.js', () => ({
  default: {
    hydratePhoneLookupCooldowns: hydrateCooldownMock,
    hydrateOutboundRateLimitState: hydrateOutboundMock,
  },
}));

const { initScheduler } = await import('../scheduler.js');

describe('initScheduler — nạp lại bộ đếm gửi Zalo (PR-S2)', () => {
  const prevEnabled = process.env.SCHEDULER_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SCHEDULER_ENABLED = 'false';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.SCHEDULER_ENABLED;
    else process.env.SCHEDULER_ENABLED = prevEnabled;
    jest.restoreAllMocks();
  });

  it('gọi hydrateOutboundRateLimitState đúng một lần', async () => {
    initScheduler();
    await new Promise((r) => setImmediate(r));

    expect(hydrateOutboundMock).toHaveBeenCalledTimes(1);
    expect(hydrateCooldownMock).toHaveBeenCalledTimes(1);
  });

  it('hydrate ném lỗi → không làm initScheduler ném ra ngoài', async () => {
    hydrateOutboundMock.mockRejectedValueOnce(new Error('db down'));

    expect(() => initScheduler()).not.toThrow();
    await new Promise((r) => setImmediate(r));

    expect(console.error).toHaveBeenCalled();
  });
});

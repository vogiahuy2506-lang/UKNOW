import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-2b: `_persistPhoneLookupCooldown` (ghi xuống DB) và `hydratePhoneLookupCooldowns`
 * (nạp lại lúc khởi động) tách riêng khỏi luồng gửi — test trực tiếp trên hai hàm này,
 * không cần dựng toàn bộ executeCampaign().
 */

const mockSetPhoneLookupCooldown = jest.fn().mockResolvedValue(undefined);
const mockListActivePhoneLookupCooldowns = jest.fn().mockResolvedValue([]);

jest.unstable_mockModule('../../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: {
    setPhoneLookupCooldown: mockSetPhoneLookupCooldown,
    listActivePhoneLookupCooldowns: mockListActivePhoneLookupCooldowns,
  },
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('CampaignRunService — persist/hydrate cooldown tra số (PR-2b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('_persistPhoneLookupCooldown', () => {
    it('gọi setPhoneLookupCooldown đúng một lần với accountId và Date khớp untilMs', async () => {
      const untilMs = new Date('2026-09-12T00:00:00.000Z').getTime();

      await campaignRunService._persistPhoneLookupCooldown(501, untilMs);

      expect(mockSetPhoneLookupCooldown).toHaveBeenCalledTimes(1);
      const [accountId, untilDate] = mockSetPhoneLookupCooldown.mock.calls[0];
      expect(accountId).toBe(501);
      expect(untilDate).toBeInstanceOf(Date);
      expect(untilDate.getTime()).toBe(untilMs);
    });

    it('repository ném lỗi → không throw ra ngoài, chỉ log console.warn', async () => {
      mockSetPhoneLookupCooldown.mockRejectedValueOnce(new Error('kết nối DB timeout'));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(
        campaignRunService._persistPhoneLookupCooldown(501, Date.now() + 1000)
      ).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ZaloCooldown]'),
        expect.anything()
      );
      warnSpy.mockRestore();
    });
  });

  describe('hydratePhoneLookupCooldowns', () => {
    it('đổ đúng cặp id → epoch ms vào Map trong bộ nhớ', async () => {
      mockListActivePhoneLookupCooldowns.mockResolvedValueOnce([
        { id: 501, phone_lookup_cooldown_until: new Date('2026-09-12T00:00:00.000Z') },
        { id: 502, phone_lookup_cooldown_until: new Date('2026-09-12T05:00:00.000Z') },
      ]);

      const count = await campaignRunService.hydratePhoneLookupCooldowns();

      expect(count).toBe(2);
      expect(campaignRunService.zaloRateLimiter.getPhoneLookupCooldownUntil('501'))
        .toBe(new Date('2026-09-12T00:00:00.000Z').getTime());
      expect(campaignRunService.zaloRateLimiter.getPhoneLookupCooldownUntil('502'))
        .toBe(new Date('2026-09-12T05:00:00.000Z').getTime());
    });

    it('repository chỉ trả hàng còn hiệu lực (WHERE > NOW()) — hydrate không tự lọc lại, tin tưởng repo', async () => {
      // listActivePhoneLookupCooldowns() ĐÃ lọc `WHERE phone_lookup_cooldown_until > NOW()` ở
      // tầng SQL (xem zaloSettingRepository.spec.js) — hàng hết hạn không bao giờ có trong kết
      // quả trả về, nên hydrate không cần lọc lại lần hai.
      mockListActivePhoneLookupCooldowns.mockResolvedValueOnce([]);

      const count = await campaignRunService.hydratePhoneLookupCooldowns();

      expect(count).toBe(0);
      expect(campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.size).toBe(0);
    });

    it('không rút ngắn một cooldown đang có sẵn trong Map (Math.max như scheduleZaloPersonalPhoneLookupCooldown)', async () => {
      const fartherFutureMs = new Date('2026-09-20T00:00:00.000Z').getTime();
      campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.set('501', fartherFutureMs);
      mockListActivePhoneLookupCooldowns.mockResolvedValueOnce([
        { id: 501, phone_lookup_cooldown_until: new Date('2026-09-12T00:00:00.000Z') },
      ]);

      await campaignRunService.hydratePhoneLookupCooldowns();

      expect(campaignRunService.zaloRateLimiter.getPhoneLookupCooldownUntil('501')).toBe(fartherFutureMs);
    });
  });
});

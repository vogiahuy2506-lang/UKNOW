import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetRunMetadata = jest.fn();
const mockPatchRunMetadata = jest.fn();
const mockFindCampaignById = jest.fn();
const mockSendSystemEmail = jest.fn();
const mockBuildPaused = jest.fn(({ campaignName }) => ({
  subject: `paused:${campaignName}`,
  html: '<p>paused</p>',
}));
const mockBuildStopped = jest.fn(({ campaignName }) => ({
  subject: `stopped:${campaignName}`,
  html: '<p>stopped</p>',
}));

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

jest.unstable_mockModule('../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: mockGetRunMetadata,
    patchRunMetadata: mockPatchRunMetadata,
  },
}));

jest.unstable_mockModule('../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: mockFindCampaignById,
  },
}));

jest.unstable_mockModule('../systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
  buildCampaignPausedEmail: mockBuildPaused,
  buildCampaignStoppedQuotaEmail: mockBuildStopped,
}));

const {
  isPlanQuotaReason,
  isAccountDailyQuotaReason,
  channelLabelFromQuotaReason,
  notifyCampaignQuotaPaused,
  notifyCampaignQuotaStopped,
  QUOTA_DEFER_CLEAR_KEYS,
} = await import('../campaignQuotaPauseNotify.util.js');

describe('campaignQuotaPauseNotify.util', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetRunMetadata.mockReset();
    mockPatchRunMetadata.mockReset();
    mockFindCampaignById.mockReset();
    mockSendSystemEmail.mockReset();
    mockBuildPaused.mockClear();
    mockBuildStopped.mockClear();
    mockGetRunMetadata.mockResolvedValue({});
    mockPatchRunMetadata.mockResolvedValue(undefined);
    mockFindCampaignById.mockResolvedValue({
      id_user: 42,
      campaign_name: 'Promo X',
    });
    mockQuery.mockResolvedValue({
      rows: [{ email: 'owner@example.com', full_name: 'Owner' }],
    });
    mockSendSystemEmail.mockResolvedValue({ messageId: 'm1' });
  });

  describe('helpers', () => {
    it('isPlanQuotaReason chỉ khớp prefix plan_quota', () => {
      expect(isPlanQuotaReason('plan_quota_daily')).toBe(true);
      expect(isPlanQuotaReason('plan_quota')).toBe(true);
      expect(isPlanQuotaReason('quiet_hours')).toBe(false);
      expect(isPlanQuotaReason('zalo_outbound_wait')).toBe(false);
    });

    it('channelLabelFromQuotaReason map email/zalo', () => {
      expect(channelLabelFromQuotaReason('plan_quota_email_daily')).toBe('email');
      expect(channelLabelFromQuotaReason('plan_quota_zalo_monthly')).toBe('Zalo');
      expect(channelLabelFromQuotaReason('plan_quota')).toBe('gửi');
    });

    // PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22 Việc 3/4 — giới hạn tự đặt cho TÀI KHOẢN GỬI, khác hạn
    // mức GÓI. reason PHẢI mang tiền tố `plan_quota_` (isPlanQuotaReason) để không bị
    // notifyCampaignQuotaPaused() bỏ qua âm thầm — isAccountDailyQuotaReason chỉ QUYẾT ĐỊNH CÂU CHỮ,
    // không quyết định có gửi mail hay không.
    it('isAccountDailyQuotaReason nhận diện đúng reason chứa "account_daily"', () => {
      expect(isAccountDailyQuotaReason('plan_quota_account_daily')).toBe(true);
      expect(isAccountDailyQuotaReason('plan_quota_daily')).toBe(false);
      expect(isAccountDailyQuotaReason('plan_quota_monthly')).toBe(false);
      expect(isAccountDailyQuotaReason('quiet_hours')).toBe(false);
      expect(isAccountDailyQuotaReason(null)).toBe(false);
      expect(isAccountDailyQuotaReason(undefined)).toBe(false);
    });

    it('reason "account_daily" KHÔNG tiền tố plan_quota_ vẫn bị isPlanQuotaReason coi là không phải plan quota — lưới bảo vệ khỏi bug đã gặp lúc code', () => {
      // Đây chính là chuỗi lệnh giao gốc ghi cho persistQuotaDeferYieldSlot({reason: 'account_daily'}).
      // Nếu dùng nguyên văn, notifyCampaignQuotaPaused() sẽ bỏ qua, khách không nhận được mail nào.
      expect(isPlanQuotaReason('account_daily')).toBe(false);
    });

    it('QUOTA_DEFER_CLEAR_KEYS gồm cờ notify', () => {
      expect(QUOTA_DEFER_CLEAR_KEYS).toEqual(expect.arrayContaining([
        'quotaDeferredUntil',
        'quotaDeferredReason',
        'quotaDeferredAt',
        'quotaPauseNotifiedAt',
      ]));
    });
  });

  describe('notifyCampaignQuotaPaused', () => {
    it('defer lần 1 (plan_quota) → 1 email + set cờ', async () => {
      const resetAt = new Date('2026-08-11T00:00:00.000Z');
      const result = await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'plan_quota_email_daily',
        resetAt,
      });

      expect(result).toEqual({ sent: true });
      expect(mockPatchRunMetadata).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ quotaPauseNotifiedAt: expect.any(String) })
      );
      expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
      expect(mockSendSystemEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'owner@example.com', subject: 'paused:Promo X' })
      );
      expect(mockBuildPaused).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignName: 'Promo X',
          channelLabel: 'email',
          resetAt,
          topupUrl: expect.stringContaining('/app/topup'),
        })
      );
    });

    it('defer lần 2 cùng đợt (đã có cờ) → không gửi lại', async () => {
      mockGetRunMetadata.mockResolvedValue({
        quotaPauseNotifiedAt: '2026-08-10T01:00:00.000Z',
      });

      const result = await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'plan_quota_email_daily',
        resetAt: new Date(),
      });

      expect(result).toEqual({ skipped: true, reason: 'already_notified' });
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
      expect(mockPatchRunMetadata).not.toHaveBeenCalled();
    });

    it('reason khác plan_quota → không gửi', async () => {
      const result = await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'quiet_hours',
        resetAt: new Date(),
      });

      expect(result).toEqual({ skipped: true, reason: 'not_plan_quota' });
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
      expect(mockGetRunMetadata).not.toHaveBeenCalled();
    });

    it('reason plan_quota_account_daily → buildCampaignPausedEmail nhận isAccountLimit:true + settingsUrl (Cài đặt kênh, không phải topup)', async () => {
      const resetAt = new Date('2026-09-23T17:00:00.000Z');
      const result = await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'plan_quota_account_daily',
        resetAt,
      });

      expect(result).toEqual({ sent: true });
      expect(mockBuildPaused).toHaveBeenCalledWith(
        expect.objectContaining({
          isAccountLimit: true,
          settingsUrl: expect.stringContaining('/app/settings/channels'),
          resetAt,
        })
      );
    });

    it('reason plan_quota_daily (hạn mức GÓI) → isAccountLimit:false', async () => {
      await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'plan_quota_daily',
        resetAt: new Date(),
      });

      expect(mockBuildPaused).toHaveBeenCalledWith(expect.objectContaining({ isAccountLimit: false }));
    });

    it('thiếu owner email → skip sau khi claim cờ', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'plan_quota_zalo_daily',
        resetAt: new Date(),
      });

      expect(result).toEqual({ skipped: true, reason: 'no_owner_email' });
      expect(mockPatchRunMetadata).toHaveBeenCalled();
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
    });
  });

  describe('notifyCampaignQuotaStopped', () => {
    it('hard-fail no-resetAt → email dừng + CTA billing', async () => {
      const result = await notifyCampaignQuotaStopped({
        campaignId: 5,
        reason: 'Gói đã hết hạn.',
      });

      expect(result).toEqual({ sent: true });
      expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
      expect(mockBuildStopped).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignName: 'Promo X',
          reason: 'Gói đã hết hạn.',
          billingUrl: expect.stringContaining('/app/billing'),
        })
      );
    });
  });
});

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn();
const mockGetRunMetadata = jest.fn();
const mockPatchRunMetadata = jest.fn();
const mockClaimRunFailureNotification = jest.fn();
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
const mockBuildRunFailed = jest.fn(({ campaignName, reason }) => ({
  subject: `run-failed:${campaignName}`,
  html: `<p>${reason}</p>`,
}));
const mockBuildApprovalRequired = jest.fn(({ campaignName, totalCustomers, threshold }) => ({
  subject: `approval-required:${campaignName}`,
  html: `<p>${totalCustomers}/${threshold}</p>`,
}));

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

jest.unstable_mockModule('../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: mockGetRunMetadata,
    patchRunMetadata: mockPatchRunMetadata,
    claimRunFailureNotification: mockClaimRunFailureNotification,
  },
}));

jest.unstable_mockModule('../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: mockFindCampaignById,
  },
}));

// PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-1 — chạy lỗi / chờ duyệt đi qua dispatcher (chuông + email), không gọi sendSystemEmail trực tiếp.
// Spec này mock dispatcher; hành vi gửi/lọc của dispatcher có spec riêng (notificationDispatch.service.spec.js).
const mockNotifyUsers = jest.fn();
jest.unstable_mockModule('../../services/notification/notificationDispatch.service.js', () => ({
  notifyUsers: mockNotifyUsers,
}));

jest.unstable_mockModule('../systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
  buildCampaignPausedEmail: mockBuildPaused,
  buildCampaignStoppedQuotaEmail: mockBuildStopped,
  buildCampaignRunFailedEmail: mockBuildRunFailed,
  // PR-3 (PLAN_VA_NHAN_VIEN_PHAN_QUYEN) — notifyCampaignApprovalRequired dùng builder này.
  buildCampaignApprovalRequiredEmail: mockBuildApprovalRequired,
}));

const {
  isPlanQuotaReason,
  isAccountDailyQuotaReason,
  channelLabelFromQuotaReason,
  notifyCampaignQuotaPaused,
  notifyCampaignQuotaStopped,
  notifyCampaignRunFailed,
  notifyCampaignApprovalRequired,
  QUOTA_DEFER_CLEAR_KEYS,
} = await import('../campaignQuotaPauseNotify.util.js');

describe('campaignQuotaPauseNotify.util', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetRunMetadata.mockReset();
    mockPatchRunMetadata.mockReset();
    mockClaimRunFailureNotification.mockReset();
    mockFindCampaignById.mockReset();
    mockSendSystemEmail.mockReset();
    mockNotifyUsers.mockReset();
    mockNotifyUsers.mockResolvedValue({ inApp: 1, emailSent: 1, emailSkipped: 0, emailFailed: 0 });
    mockBuildPaused.mockClear();
    mockBuildStopped.mockClear();
    mockBuildRunFailed.mockClear();
    mockBuildApprovalRequired.mockClear();
    mockGetRunMetadata.mockResolvedValue({});
    mockPatchRunMetadata.mockResolvedValue(undefined);
    mockClaimRunFailureNotification.mockResolvedValue(true);
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

  // PR-6 (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO) — hết hạn mức đi qua dispatcher (sự kiện campaign_quota_exhausted).
  describe('notifyCampaignQuotaPaused', () => {
    it('defer lần 1 (plan_quota) → set cờ + notifyUsers đúng 1 lần: sự kiện campaign_quota_exhausted, userIds = [campaign.id_user], dedupe theo run + mốc claim', async () => {
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
      expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
      const call = mockNotifyUsers.mock.calls[0][0];
      expect(call.eventType).toBe('campaign_quota_exhausted');
      expect(call.userIds).toEqual([42]);
      const claimedAt = mockPatchRunMetadata.mock.calls[0][1].quotaPauseNotifiedAt;
      expect(call.dedupeKey).toBe(`run:10:quota_paused:${claimedAt}`);
      expect(call.severity).toBe('warning');
      expect(call.link).toBe('/app/campaigns');
      expect(call.title).toContain('Promo X');
      expect(call.message).toContain('email');
      expect(call.metadata).toEqual({ runId: 10, campaignId: 5, reason: 'plan_quota_email_daily' });
      // Không còn gửi email trực tiếp — email đi qua dispatcher.
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
    });

    it('mẫu email riêng truyền cho dispatcher là buildCampaignPausedEmail với tên người nhận do dispatcher cấp', async () => {
      const resetAt = new Date('2026-08-11T00:00:00.000Z');
      await notifyCampaignQuotaPaused({ runId: 10, campaignId: 5, reason: 'plan_quota_email_daily', resetAt });

      const { email } = mockNotifyUsers.mock.calls[0][0];
      expect(email({ id: 42, email: 'owner@example.com', fullName: 'Chủ Shop' })).toEqual({
        subject: 'paused:Promo X',
        html: '<p>paused</p>',
      });
      expect(mockBuildPaused).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Chủ Shop',
          campaignName: 'Promo X',
          channelLabel: 'email',
          resetAt,
          topupUrl: expect.stringContaining('/app/topup'),
        })
      );
    });

    it('hai đợt hoãn của CÙNG run (cờ bị xoá khi resume, claim lại mốc khác) → hai khoá chống trùng khác nhau', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2026-08-10T01:00:00.000Z'));
        await notifyCampaignQuotaPaused({ runId: 10, campaignId: 5, reason: 'plan_quota_daily', resetAt: new Date() });
        jest.setSystemTime(new Date('2026-08-11T01:00:00.000Z'));
        await notifyCampaignQuotaPaused({ runId: 10, campaignId: 5, reason: 'plan_quota_daily', resetAt: new Date() });
      } finally {
        jest.useRealTimers();
      }
      const keys = mockNotifyUsers.mock.calls.map(([call]) => call.dedupeKey);
      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toBe(keys[1]);
    });

    it('defer lần 2 cùng đợt (đã có cờ) → không báo lại', async () => {
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
      expect(mockNotifyUsers).not.toHaveBeenCalled();
      expect(mockPatchRunMetadata).not.toHaveBeenCalled();
    });

    it('reason khác plan_quota → không báo', async () => {
      const result = await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'quiet_hours',
        resetAt: new Date(),
      });

      expect(result).toEqual({ skipped: true, reason: 'not_plan_quota' });
      expect(mockNotifyUsers).not.toHaveBeenCalled();
      expect(mockGetRunMetadata).not.toHaveBeenCalled();
    });

    it('reason plan_quota_account_daily → email nhận isAccountLimit:true + settingsUrl (Cài đặt kênh, không phải topup); câu chuông nói đúng giới hạn tự đặt', async () => {
      const resetAt = new Date('2026-09-23T17:00:00.000Z');
      const result = await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'plan_quota_account_daily',
        resetAt,
      });

      expect(result).toEqual({ sent: true });
      const call = mockNotifyUsers.mock.calls[0][0];
      expect(call.message).toContain('bạn đặt cho tài khoản gửi');
      call.email({ fullName: 'X' });
      expect(mockBuildPaused).toHaveBeenCalledWith(
        expect.objectContaining({
          isAccountLimit: true,
          settingsUrl: expect.stringContaining('/app/settings/channels'),
          resetAt,
        })
      );
    });

    it('reason plan_quota_daily (hạn mức GÓI) → isAccountLimit:false, câu chuông nói hạn mức của gói', async () => {
      await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'plan_quota_daily',
        resetAt: new Date(),
      });

      const call = mockNotifyUsers.mock.calls[0][0];
      expect(call.message).toContain('hạn mức gửi');
      expect(call.message).toContain('của gói');
      call.email({ fullName: 'X' });
      expect(mockBuildPaused).toHaveBeenCalledWith(expect.objectContaining({ isAccountLimit: false }));
    });

    it('chủ chiến dịch KHÔNG có email vẫn được báo trong app (không còn skip no_owner_email)', async () => {
      mockQuery.mockResolvedValue({ rows: [{ email: null, full_name: 'Owner' }] });

      const result = await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'plan_quota_zalo_daily',
        resetAt: new Date(),
      });

      expect(result).toEqual({ sent: true });
      expect(mockPatchRunMetadata).toHaveBeenCalled();
      expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
    });

    it('không tìm thấy người dùng của chiến dịch → skip no_owner (cờ đã claim), không báo ai', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'plan_quota_zalo_daily',
        resetAt: new Date(),
      });

      expect(result).toEqual({ skipped: true, reason: 'no_owner' });
      expect(mockPatchRunMetadata).toHaveBeenCalled();
      expect(mockNotifyUsers).not.toHaveBeenCalled();
    });

    it('dispatcher không giao được cho ai (trùng / tắt kênh) → skipped no_delivery', async () => {
      mockNotifyUsers.mockResolvedValue({ inApp: 0, emailSent: 0, emailSkipped: 0, emailFailed: 0 });

      const result = await notifyCampaignQuotaPaused({
        runId: 10,
        campaignId: 5,
        reason: 'plan_quota_email_daily',
        resetAt: new Date(),
      });

      expect(result).toEqual({ skipped: true, reason: 'no_delivery' });
    });
  });

  describe('notifyCampaignQuotaStopped', () => {
    it('hard-fail no-resetAt → notifyUsers sự kiện campaign_quota_exhausted tới chủ, link billing, khoá theo (chiến dịch, ngày VN)', async () => {
      const result = await notifyCampaignQuotaStopped({
        campaignId: 5,
        reason: 'Gói đã hết hạn.',
      });

      expect(result).toEqual({ sent: true });
      expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
      const call = mockNotifyUsers.mock.calls[0][0];
      expect(call.eventType).toBe('campaign_quota_exhausted');
      expect(call.userIds).toEqual([42]);
      expect(call.severity).toBe('error');
      expect(call.link).toBe('/app/billing');
      expect(call.title).toContain('Promo X');
      expect(call.message).toContain('Gói đã hết hạn.');
      expect(call.dedupeKey).toMatch(/^campaign:5:quota_stopped:\d{8}$/);
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
    });

    it('mẫu email riêng là buildCampaignStoppedQuotaEmail với CTA billing', async () => {
      await notifyCampaignQuotaStopped({ campaignId: 5, reason: 'Gói đã hết hạn.' });

      const { email } = mockNotifyUsers.mock.calls[0][0];
      expect(email({ fullName: 'Chủ' }).subject).toBe('stopped:Promo X');
      expect(mockBuildStopped).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Chủ',
          campaignName: 'Promo X',
          reason: 'Gói đã hết hạn.',
          billingUrl: expect.stringContaining('/app/billing'),
        })
      );
    });

    it('không có reason → dùng câu mặc định; chủ không có email vẫn được báo', async () => {
      mockQuery.mockResolvedValue({ rows: [{ email: null, full_name: 'Owner' }] });

      const result = await notifyCampaignQuotaStopped({ campaignId: 5 });

      expect(result).toEqual({ sent: true });
      expect(mockNotifyUsers.mock.calls[0][0].message).toContain('Gói hết hạn hoặc hết hạn mức kỳ.');
    });

    it('không tìm thấy chiến dịch / chủ → skip no_owner', async () => {
      mockFindCampaignById.mockResolvedValue(null);

      const result = await notifyCampaignQuotaStopped({ campaignId: 5, reason: 'x' });

      expect(result).toEqual({ skipped: true, reason: 'no_owner' });
      expect(mockNotifyUsers).not.toHaveBeenCalled();
    });
  });

  // PR-3 — chống gửi trùng phải qua UPDATE giành cờ nguyên tử (claimRunFailureNotification), không
  // đọc-rồi-ghi như notifyCampaignQuotaPaused ở trên.
  describe('notifyCampaignRunFailed', () => {
    it('claim trả false (đã báo trước đó) → không gửi mail', async () => {
      mockClaimRunFailureNotification.mockResolvedValue(false);

      const result = await notifyCampaignRunFailed({
        runId: 200,
        campaignId: 5,
        reason: 'Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng',
        source: 'catch_all',
      });

      expect(result).toEqual({ skipped: true, reason: 'already_notified' });
      expect(mockClaimRunFailureNotification).toHaveBeenCalledWith(200);
      expect(mockFindCampaignById).not.toHaveBeenCalled();
      expect(mockNotifyUsers).not.toHaveBeenCalled();
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
    });

    it('claim trả true → notifyUsers đúng 1 lần: sự kiện campaign_run_failed, userIds = [campaign.id_user], dedupe theo run, câu đã Việt hoá', async () => {
      mockClaimRunFailureNotification.mockResolvedValue(true);

      const result = await notifyCampaignRunFailed({
        runId: 200,
        campaignId: 5,
        reason: 'Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng',
        source: 'catch_all',
      });

      expect(result).toEqual({ sent: true });
      expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
      const call = mockNotifyUsers.mock.calls[0][0];
      expect(call.eventType).toBe('campaign_run_failed');
      expect(call.userIds).toEqual([42]);
      expect(call.dedupeKey).toBe('run:200:failed');
      expect(call.severity).toBe('error');
      expect(call.link).toBe('/app/campaigns');
      expect(call.title).toContain('Promo X');
      expect(call.message).toContain('Tài khoản Zalo dùng để gửi chưa sẵn sàng (có thể đang mất kết nối).');
      expect(call.metadata).toEqual({ runId: 200, campaignId: 5, source: 'catch_all' });
      // Không còn gửi email trực tiếp — email đi qua dispatcher.
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
    });

    it('mẫu email riêng truyền cho dispatcher vẫn là buildCampaignRunFailedEmail với tên người nhận do dispatcher cấp', async () => {
      mockClaimRunFailureNotification.mockResolvedValue(true);

      await notifyCampaignRunFailed({
        runId: 200,
        campaignId: 5,
        reason: 'Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng',
        source: 'catch_all',
      });

      const { email } = mockNotifyUsers.mock.calls[0][0];
      const built = email({ id: 42, email: 'owner@example.com', fullName: 'Chủ Shop' });
      expect(built).toEqual({ subject: 'run-failed:Promo X', html: expect.stringContaining('<p>') });
      expect(mockBuildRunFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Chủ Shop',
          campaignName: 'Promo X',
          reason: 'Tài khoản Zalo dùng để gửi chưa sẵn sàng (có thể đang mất kết nối).',
          actionHint: expect.stringContaining('Cài đặt Zalo'),
          appUrl: expect.stringContaining('/app/campaigns'),
        })
      );
    });

    it('chủ chiến dịch KHÔNG có email vẫn được báo trong app (không còn skip no_owner_email)', async () => {
      mockClaimRunFailureNotification.mockResolvedValue(true);
      mockQuery.mockResolvedValue({ rows: [{ email: null, full_name: 'Owner' }] });

      const result = await notifyCampaignRunFailed({
        runId: 200,
        campaignId: 5,
        reason: 'Lỗi lạ chưa từng thấy',
        source: 'catch_all',
      });

      expect(result).toEqual({ sent: true });
      expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
    });

    it('không tìm thấy người dùng của chiến dịch → skip no_owner, không báo ai', async () => {
      mockClaimRunFailureNotification.mockResolvedValue(true);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await notifyCampaignRunFailed({
        runId: 200,
        campaignId: 5,
        reason: 'Lỗi lạ chưa từng thấy',
        source: 'catch_all',
      });

      expect(result).toEqual({ skipped: true, reason: 'no_owner' });
      expect(mockNotifyUsers).not.toHaveBeenCalled();
    });

    it('dispatcher không giao được cho ai (trùng / tắt kênh) → skipped no_delivery', async () => {
      mockClaimRunFailureNotification.mockResolvedValue(true);
      mockNotifyUsers.mockResolvedValue({ inApp: 0, emailSent: 0, emailSkipped: 1, emailFailed: 0 });

      const result = await notifyCampaignRunFailed({ runId: 200, campaignId: 5, reason: 'x', source: 'catch_all' });

      expect(result).toEqual({ skipped: true, reason: 'no_delivery' });
    });
  });

  // PR-3 (PLAN_VA_NHAN_VIEN_PHAN_QUYEN_2026-09-28) — lịch hẹn vượt ngưỡng duyệt không tạo run
  // (không có runId để claimRunFailureNotification), nên hàm này KHÔNG chống gửi trùng qua run —
  // chỉ dựa vào việc scheduler tắt lịch (enabled=false) ngay sau đó để không bắn lại.
  describe('notifyCampaignApprovalRequired', () => {
    it('báo đúng CHỦ theo ownerId truyền vào (không qua campaign.id_user), sự kiện campaign_approval_required', async () => {
      const result = await notifyCampaignApprovalRequired({
        campaignId: 5,
        ownerId: 99,
        threshold: 1,
        totalCustomers: 2,
      });

      expect(result).toEqual({ sent: true });
      expect(mockClaimRunFailureNotification).not.toHaveBeenCalled();
      expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
      const call = mockNotifyUsers.mock.calls[0][0];
      expect(call.eventType).toBe('campaign_approval_required');
      expect(call.userIds).toEqual([99]);
      expect(call.severity).toBe('warning');
      expect(call.link).toBe('/app/campaigns');
      expect(call.title).toContain('Promo X');
      expect(call.message).toContain('2 người nhận');
      expect(call.message).toContain('(1)');
      expect(call.metadata).toEqual({ campaignId: 5, threshold: 1, totalCustomers: 2 });
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
    });

    it('mẫu email riêng truyền cho dispatcher là buildCampaignApprovalRequiredEmail với tên người nhận do dispatcher cấp', async () => {
      await notifyCampaignApprovalRequired({
        campaignId: 5,
        ownerId: 99,
        threshold: 1,
        totalCustomers: 2,
      });

      const { email } = mockNotifyUsers.mock.calls[0][0];
      expect(email({ id: 99, email: 'owner@example.com', fullName: 'Owner' }).subject).toBe('approval-required:Promo X');
      expect(mockBuildApprovalRequired).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Owner',
          campaignName: 'Promo X',
          totalCustomers: 2,
          threshold: 1,
          appUrl: expect.stringContaining('/app/campaigns'),
        })
      );
    });

    it('dispatcher không giao được cho ai → skipped no_delivery', async () => {
      mockNotifyUsers.mockResolvedValue({ inApp: 0, emailSent: 0, emailSkipped: 0, emailFailed: 0 });

      const result = await notifyCampaignApprovalRequired({
        campaignId: 5,
        ownerId: 99,
        threshold: 1,
        totalCustomers: 2,
      });

      expect(result).toEqual({ skipped: true, reason: 'no_delivery' });
    });

    it('campaign không tìm thấy tên → dùng "Chiến dịch #<id>" mặc định', async () => {
      mockFindCampaignById.mockResolvedValue(null);

      await notifyCampaignApprovalRequired({
        campaignId: 7,
        ownerId: 99,
        threshold: 1,
        totalCustomers: 2,
      });

      expect(mockNotifyUsers.mock.calls[0][0].title).toContain('Chiến dịch #7');
      const { email } = mockNotifyUsers.mock.calls[0][0];
      email({ fullName: 'X' });
      expect(mockBuildApprovalRequired).toHaveBeenCalledWith(
        expect.objectContaining({ campaignName: 'Chiến dịch #7' })
      );
    });
  });
});

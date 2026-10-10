import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Dispatcher thông báo (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 PR-1, mục 2.3).
 * Mock ở ranh giới: 3 repository + sendSystemEmail (builder email dùng bản THẬT để kiểm nội dung) + alert.repository.
 */
const mockInsertMany = jest.fn();
const mockFindEmailContacts = jest.fn();
const mockListActiveAdminIds = jest.fn();
const mockListEmailDisabledUserIds = jest.fn();
const mockListSettings = jest.fn();
const mockSendSystemEmail = jest.fn();
const mockListAdminAlertEmails = jest.fn();

jest.unstable_mockModule('../../../repositories/notification/userNotification.repository.js', () => ({
  default: {
    insertMany: mockInsertMany,
    findEmailContacts: mockFindEmailContacts,
    listActiveAdminIds: mockListActiveAdminIds,
  },
}));
jest.unstable_mockModule('../../../repositories/notification/notificationPreference.repository.js', () => ({
  default: { listEmailDisabledUserIds: mockListEmailDisabledUserIds },
}));
jest.unstable_mockModule('../../../repositories/notification/notificationEventSetting.repository.js', () => ({
  default: { listAll: mockListSettings },
}));
jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  listAdminAlertEmails: mockListAdminAlertEmails,
}));
const realSystemEmail = await import('../../../utils/systemEmail.util.js');
jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  ...realSystemEmail,
  sendSystemEmail: mockSendSystemEmail,
}));

const {
  notifyUsers,
  notifyAdmins,
  filterEmailRecipientsByPreference,
  getEffectiveEventSettings,
  clearEventSettingsCache,
} = await import('../notificationDispatch.service.js');

const contact = (id, over = {}) => ({ id, email: `u${id}@shop.vn`, fullName: `Người ${id}`, ...over });
const settingRow = (eventType, over = {}) => ({
  eventType,
  inAppEnabled: true,
  emailEnabled: true,
  userCanDisableEmail: true,
  updatedBy: null,
  updatedAt: null,
  ...over,
});
const base = (over = {}) => ({
  eventType: 'campaign_run_failed',
  userIds: [1, 2],
  title: 'Tiêu đề',
  message: 'Nội dung',
  ...over,
});

describe('notificationDispatch', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    clearEventSettingsCache();
    mockListSettings.mockResolvedValue([]);
    mockInsertMany.mockImplementation(async ({ userIds }) => userIds);
    mockFindEmailContacts.mockImplementation(async (ids) => ids.map((id) => contact(id)));
    mockListEmailDisabledUserIds.mockResolvedValue(new Set());
    mockSendSystemEmail.mockResolvedValue({});
    mockListActiveAdminIds.mockResolvedValue([1, 2]);
    mockListAdminAlertEmails.mockResolvedValue(['ops@digiso.vn']);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('in-app', () => {
    it('bật (mặc định) → đúng MỘT lần insertMany cho cả nhóm, đủ trường, trả inApp = số dòng chèn', async () => {
      const result = await notifyUsers(base({
        eventType: 'campaign_run_completed',
        userIds: [3, 4, 5],
        titleEn: 'Title',
        messageEn: 'Body',
        link: '/app/delivery-monitor',
        severity: 'success',
        metadata: { runId: 9 },
        dedupeKey: 'run:9:completed',
      }));

      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockInsertMany).toHaveBeenCalledWith({
        userIds: [3, 4, 5],
        eventType: 'campaign_run_completed',
        title: 'Tiêu đề',
        titleEn: 'Title',
        message: 'Nội dung',
        messageEn: 'Body',
        link: '/app/delivery-monitor',
        severity: 'success',
        metadata: { runId: 9 },
        notificationId: null,
        dedupeKey: 'run:9:completed',
      });
      expect(result).toEqual({ inApp: 3, emailSent: 0, emailSkipped: 0, emailFailed: 0 });
    });

    it('super admin tắt chuông của sự kiện → KHÔNG chèn dòng nào nhưng email (nếu bật) vẫn đi', async () => {
      mockListSettings.mockResolvedValue([settingRow('campaign_run_failed', { inAppEnabled: false })]);

      const result = await notifyUsers(base());

      expect(mockInsertMany).not.toHaveBeenCalled();
      expect(result.inApp).toBe(0);
      expect(result.emailSent).toBe(2);
    });

    it('userIds rỗng / rác → không chèn, không gửi', async () => {
      const result = await notifyUsers(base({ userIds: [null, 'abc', 0, -3] }));
      expect(mockInsertMany).not.toHaveBeenCalled();
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ inApp: 0, emailSent: 0, emailSkipped: 0, emailFailed: 0 });
    });

    it('userIds trùng / dạng chuỗi được chuẩn hoá về số duy nhất', async () => {
      await notifyUsers(base({ userIds: ['7', 7, 8, '8', 9] }));
      expect(mockInsertMany.mock.calls[0][0].userIds).toEqual([7, 8, 9]);
    });

    it('lỗi ghi in-app KHÔNG ném và KHÔNG chặn email (email là hành vi sẵn có của sự kiện chiến dịch)', async () => {
      mockInsertMany.mockRejectedValue(new Error('db down'));

      const result = await notifyUsers(base());

      expect(result.inApp).toBe(0);
      expect(result.emailSent).toBe(2);
    });

    it('link lạ (javascript:) bị bỏ, đường dẫn nội bộ / https được giữ, tiêu đề dài bị cắt 255', async () => {
      await notifyUsers(base({ link: 'javascript:alert(1)', title: 'x'.repeat(400) }));
      expect(mockInsertMany.mock.calls[0][0].link).toBeNull();
      expect(mockInsertMany.mock.calls[0][0].title).toHaveLength(255);

      await notifyUsers(base({ link: 'https://founderai.biz/app' }));
      expect(mockInsertMany.mock.calls[1][0].link).toBe('https://founderai.biz/app');

      await notifyUsers(base({ link: '/app/campaigns' }));
      expect(mockInsertMany.mock.calls[2][0].link).toBe('/app/campaigns');
    });

    it('severity lạ → info; metadata không phải object → {}', async () => {
      await notifyUsers(base({ severity: 'critical', metadata: 'oops' }));
      expect(mockInsertMany.mock.calls[0][0].severity).toBe('info');
      expect(mockInsertMany.mock.calls[0][0].metadata).toEqual({});
    });

    it('sự kiện không có trong catalog → ném (lỗi lập trình, caller .catch log)', async () => {
      await expect(notifyUsers(base({ eventType: 'khong_co' }))).rejects.toThrow('catalog');
      expect(mockInsertMany).not.toHaveBeenCalled();
    });
  });

  describe('email theo tuỳ chọn người dùng', () => {
    it('người đã TẮT email loại này (user_can_disable_email bật) bị bỏ, người còn lại nhận', async () => {
      mockListEmailDisabledUserIds.mockResolvedValue(new Set([2]));

      const result = await notifyUsers(base());

      expect(mockListEmailDisabledUserIds).toHaveBeenCalledWith('campaign_run_failed', [1, 2]);
      expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
      expect(mockSendSystemEmail.mock.calls[0][0].to).toBe('u1@shop.vn');
      expect(result.emailSent).toBe(1);
      expect(result.emailSkipped).toBe(1);
    });

    it('loại KHÔNG cho tắt (campaign_approval_required): bỏ qua tuỳ chọn, gửi cho cả hai dù có người đã "tắt"', async () => {
      mockListEmailDisabledUserIds.mockResolvedValue(new Set([1, 2]));

      const result = await notifyUsers(base({ eventType: 'campaign_approval_required' }));

      expect(mockListEmailDisabledUserIds).not.toHaveBeenCalled();
      expect(result.emailSent).toBe(2);
      expect(result.emailSkipped).toBe(0);
    });

    it('super admin khoá/mở user_can_disable_email thắng catalog: loại mặc định tắt được nhưng admin khoá → gửi hết', async () => {
      mockListSettings.mockResolvedValue([settingRow('campaign_run_failed', { userCanDisableEmail: false })]);
      mockListEmailDisabledUserIds.mockResolvedValue(new Set([1]));

      const result = await notifyUsers(base());

      expect(mockListEmailDisabledUserIds).not.toHaveBeenCalled();
      expect(result.emailSent).toBe(2);
    });

    it('email_enabled hệ thống tắt (mặc định campaign_run_completed) → không tra liên hệ, không gửi', async () => {
      const result = await notifyUsers(base({ eventType: 'campaign_run_completed' }));

      expect(mockFindEmailContacts).not.toHaveBeenCalled();
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
      expect(result.emailSent).toBe(0);
      expect(result.inApp).toBe(2);
    });

    it('admin bật email campaign_run_completed → gửi (người dùng chưa tắt)', async () => {
      mockListSettings.mockResolvedValue([settingRow('campaign_run_completed', { emailEnabled: true })]);

      const result = await notifyUsers(base({ eventType: 'campaign_run_completed' }));

      expect(result.emailSent).toBe(2);
    });

    it('người không có email / không hoạt động (findEmailContacts không trả) tính vào emailSkipped', async () => {
      mockFindEmailContacts.mockResolvedValue([contact(1)]);

      const result = await notifyUsers(base());

      expect(result.emailSent).toBe(1);
      expect(result.emailSkipped).toBe(1);
    });
  });

  describe('dedupe', () => {
    it('có dedupeKey: chỉ người MỚI được chèn dòng mới nhận email (gọi lại cùng sự kiện không gửi lần hai)', async () => {
      mockInsertMany.mockResolvedValue([1]); // user 2 đã có dòng cùng khoá

      const result = await notifyUsers(base({ dedupeKey: 'run:5:failed' }));

      expect(mockInsertMany.mock.calls[0][0].dedupeKey).toBe('run:5:failed');
      expect(mockFindEmailContacts).toHaveBeenCalledWith([1]);
      expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
      expect(mockSendSystemEmail.mock.calls[0][0].to).toBe('u1@shop.vn');
      expect(result).toEqual({ inApp: 1, emailSent: 1, emailSkipped: 1, emailFailed: 0 });
    });

    it('tất cả đã có dòng (gọi lại hoàn toàn) → không chèn thêm và không gửi email nào', async () => {
      mockInsertMany.mockResolvedValue([]);

      const result = await notifyUsers(base({ dedupeKey: 'run:5:failed' }));

      expect(mockSendSystemEmail).not.toHaveBeenCalled();
      expect(result.inApp).toBe(0);
      expect(result.emailSent).toBe(0);
    });

    it('KHÔNG dedupeKey: mọi người nhận email dù insertMany trả ít hơn', async () => {
      mockInsertMany.mockResolvedValue([1]);

      const result = await notifyUsers(base());

      expect(result.emailSent).toBe(2);
    });
  });

  describe('gửi email', () => {
    it('lỗi gửi cho MỘT người chỉ log, không ném, người khác vẫn nhận', async () => {
      mockSendSystemEmail.mockImplementation(async ({ to }) => {
        if (to === 'u1@shop.vn') throw new Error('smtp 421');
        return {};
      });

      const result = await notifyUsers(base());

      expect(result.emailSent).toBe(1);
      expect(result.emailFailed).toBe(1);
      expect(result.inApp).toBe(2);
    });

    it('lỗi tra liên hệ email (DB) cũng không ném', async () => {
      mockFindEmailContacts.mockRejectedValue(new Error('db down'));

      const result = await notifyUsers(base());

      expect(result.inApp).toBe(2);
      expect(result.emailFailed).toBe(2);
    });

    it('mẫu riêng dạng hàm theo người nhận: subject/html của caller được dùng, tên từng người được truyền vào', async () => {
      const email = jest.fn(({ fullName }) => ({ subject: `Chào ${fullName}`, html: `<p>${fullName}</p>` }));

      await notifyUsers(base({ email }));

      expect(email).toHaveBeenCalledWith(expect.objectContaining({ id: 1, fullName: 'Người 1' }));
      expect(mockSendSystemEmail).toHaveBeenCalledWith({ to: 'u1@shop.vn', subject: 'Chào Người 1', html: '<p>Người 1</p>' });
      expect(mockSendSystemEmail).toHaveBeenCalledWith({ to: 'u2@shop.vn', subject: 'Chào Người 2', html: '<p>Người 2</p>' });
    });

    it('mẫu riêng dạng đối tượng dùng chung cho mọi người nhận', async () => {
      await notifyUsers(base({ email: { subject: 'S', html: '<p>H</p>' } }));
      expect(mockSendSystemEmail.mock.calls.map(([arg]) => [arg.subject, arg.html])).toEqual([
        ['S', '<p>H</p>'],
        ['S', '<p>H</p>'],
      ]);
    });

    it('không truyền mẫu → buildNotificationEmail: tiêu đề/nội dung bị escape, link thành URL tuyệt đối', async () => {
      process.env.FRONTEND_URL = 'https://app.test';
      await notifyUsers(base({ userIds: [1], title: 'Lỗi <script>x</script>', message: 'a & b', link: '/app/campaigns' }));

      const { subject, html } = mockSendSystemEmail.mock.calls[0][0];
      expect(subject).toContain('Lỗi <script>x</script>');
      expect(html).not.toContain('<script>');
      expect(html).toContain('Lỗi &lt;script&gt;x&lt;/script&gt;');
      expect(html).toContain('a &amp; b');
      expect(html).toContain('href="https://app.test/app/campaigns"');
      delete process.env.FRONTEND_URL;
    });

    it('mẫu riêng ném lỗi → tính vào emailFailed, không ném ra ngoài', async () => {
      const result = await notifyUsers(base({ email: () => { throw new Error('boom'); } }));
      expect(result.emailFailed).toBe(2);
      expect(result.emailSent).toBe(0);
    });

    it('đồng thời tối đa 5 email một lúc (12 người nhận)', async () => {
      const ids = Array.from({ length: 12 }, (_, i) => i + 1);
      let running = 0;
      let peak = 0;
      mockSendSystemEmail.mockImplementation(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return {};
      });

      const result = await notifyUsers(base({ userIds: ids }));

      expect(result.emailSent).toBe(12);
      expect(peak).toBe(5);
    });
  });

  describe('channels', () => {
    it("['in_app'] → không đụng email (đường email cũ của bản tin admin tự lo)", async () => {
      const result = await notifyUsers(base({ eventType: 'admin_broadcast', channels: ['in_app'] }));
      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockFindEmailContacts).not.toHaveBeenCalled();
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
      expect(result.inApp).toBe(2);
    });

    it("['email'] → không chèn in-app", async () => {
      const result = await notifyUsers(base({ channels: ['email'] }));
      expect(mockInsertMany).not.toHaveBeenCalled();
      expect(result.emailSent).toBe(2);
    });
  });

  describe('cấu hình sự kiện', () => {
    it('cache 60 giây: đọc DB một lần cho nhiều lần phát; clearEventSettingsCache → đọc lại', async () => {
      const now = jest.spyOn(Date, 'now');
      now.mockReturnValue(1_000_000);
      await notifyUsers(base());
      await notifyUsers(base());
      expect(mockListSettings).toHaveBeenCalledTimes(1);

      now.mockReturnValue(1_000_000 + 59_000);
      await notifyUsers(base());
      expect(mockListSettings).toHaveBeenCalledTimes(1);

      now.mockReturnValue(1_000_000 + 61_000);
      await notifyUsers(base());
      expect(mockListSettings).toHaveBeenCalledTimes(2);

      clearEventSettingsCache();
      await notifyUsers(base());
      expect(mockListSettings).toHaveBeenCalledTimes(3);
    });

    it('đọc cấu hình lỗi → dùng mặc định catalog (chuông bật, email theo mặc định) và KHÔNG cache lỗi', async () => {
      mockListSettings.mockRejectedValueOnce(new Error('db down'));
      expect(await getEffectiveEventSettings('campaign_run_completed')).toEqual({
        inAppEnabled: true, emailEnabled: false, userCanDisableEmail: true,
      });
      mockListSettings.mockResolvedValueOnce([settingRow('campaign_run_completed', { emailEnabled: true })]);
      expect((await getEffectiveEventSettings('campaign_run_completed')).emailEnabled).toBe(true);
    });

    it('khoá không có trong catalog → null', async () => {
      expect(await getEffectiveEventSettings('khong_co')).toBeNull();
    });
  });

  describe('filterEmailRecipientsByPreference', () => {
    it('tách allowed/skipped theo tuỳ chọn; loại khoá thì giữ nguyên tất cả', async () => {
      mockListEmailDisabledUserIds.mockResolvedValue(new Set([2]));
      const users = [{ id: 1 }, { id: 2 }, { id: 3 }];

      expect(await filterEmailRecipientsByPreference('campaign_run_failed', users)).toEqual({
        allowed: [{ id: 1 }, { id: 3 }],
        skipped: [{ id: 2 }],
      });
      expect(await filterEmailRecipientsByPreference('campaign_approval_required', users)).toEqual({
        allowed: users,
        skipped: [],
      });
      expect(await filterEmailRecipientsByPreference('campaign_run_failed', [])).toEqual({ allowed: [], skipped: [] });
    });
  });

  describe('notifyAdmins', () => {
    it('chuông cho mọi super admin đang hoạt động; email theo listAdminAlertEmails, KHÔNG qua notification_preferences', async () => {
      mockListEmailDisabledUserIds.mockResolvedValue(new Set([1, 2]));

      const result = await notifyAdmins({ eventType: 'support_ticket_created', title: 'Ticket mới', message: 'Nội dung' });

      expect(mockInsertMany.mock.calls[0][0].userIds).toEqual([1, 2]);
      expect(mockListEmailDisabledUserIds).not.toHaveBeenCalled();
      expect(mockFindEmailContacts).not.toHaveBeenCalled();
      expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
      expect(mockSendSystemEmail.mock.calls[0][0].to).toBe('ops@digiso.vn');
      expect(result).toEqual({ inApp: 2, emailSent: 1, emailSkipped: 0, emailFailed: 0 });
    });

    it('nhiều địa chỉ ADMIN_ALERT_EMAILS → mỗi địa chỉ một email', async () => {
      mockListAdminAlertEmails.mockResolvedValue(['a@x.vn', 'b@x.vn']);
      const result = await notifyAdmins({ eventType: 'support_ticket_created', title: 'T', message: 'M' });
      expect(mockSendSystemEmail.mock.calls.map(([arg]) => arg.to)).toEqual(['a@x.vn', 'b@x.vn']);
      expect(result.emailSent).toBe(2);
    });

    it('sự kiện trùng (dedupeKey, không dòng nào mới) → không gửi email lại', async () => {
      mockInsertMany.mockResolvedValue([]);
      const result = await notifyAdmins({
        eventType: 'support_ticket_created', title: 'T', message: 'M', dedupeKey: 'ticket:9:created',
      });
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
      expect(result.inApp).toBe(0);
    });
  });
});

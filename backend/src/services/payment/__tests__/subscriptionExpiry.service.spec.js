import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockSubscriptionRepo = {
  findExpiredUsers: jest.fn(),
  findUsersExpiringInWindow: jest.fn(),
  expireUserPlan: jest.fn(),
  incrementReminderCount: jest.fn(),
  markReminderSent: jest.fn(),
};

const mockSendSystemEmail = jest.fn();
const mockBuildPlanExpiredEmail = jest.fn();
const mockBuildRenewalReminderEmail = jest.fn();
const mockLoadCustomSystemEmailTemplate = jest.fn();
const mockGetReminderSettings = jest.fn();
// PR-3, Việc 3.1 — reconcileResourceLocks phải được gọi NGAY sau expireUserPlan, không đợi cron
// reconcileAllDueUsers ở lượt sau (lượt đó sẽ không còn thấy user này vì active_plan_id đã NULL).
const mockReconcileResourceLocks = jest.fn();
// PR-6 (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO) — thư hết hạn / nhắc hạn đi qua dispatcher (notifyUsers: chuông + email).
const mockNotifyUsers = jest.fn();

/** Tìm người dùng (email, tên) theo id trong các danh sách repo giả đã trả — thay cho truy vấn `findEmailContacts` của dispatcher thật. */
async function lookupUser(id) {
  const results = [
    ...mockSubscriptionRepo.findExpiredUsers.mock.results,
    ...mockSubscriptionRepo.findUsersExpiringInWindow.mock.results,
  ];
  for (const result of results) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await result.value;
    const found = Array.isArray(rows) ? rows.find((row) => row.id === id) : null;
    if (found) return found;
  }
  return null;
}

/**
 * Dispatcher GIẢ ở ranh giới notifyUsers: chuông luôn ghi được; `channels` không chứa email hoặc người nhận không có email → bỏ email;
 * ngược lại chạy builder email thật của service rồi đưa qua `mockSendSystemEmail`; email lỗi → emailFailed và chuông 0 (cả hai kênh hỏng).
 * Hành vi thật của dispatcher có spec riêng (notificationDispatch.service.spec.js).
 */
async function fakeDispatch(input) {
  const result = { inApp: 1, emailSent: 0, emailSkipped: 0, emailFailed: 0 };
  const wantsEmail = !Array.isArray(input.channels) || input.channels.includes('email');
  if (!wantsEmail) return result;
  const user = await lookupUser(input.userIds[0]);
  if (!user?.email) {
    result.emailSkipped = 1;
    return result;
  }
  const { subject, html } = input.email({ id: user.id, email: user.email, fullName: user.full_name });
  try {
    await mockSendSystemEmail({ to: user.email, subject, html });
    result.emailSent = 1;
  } catch {
    result.inApp = 0;
    result.emailFailed = 1;
  }
  return result;
}

jest.unstable_mockModule('../../../repositories/subscription/subscription.repository.js', () => mockSubscriptionRepo);
jest.unstable_mockModule('../../../config/database.js', () => ({ default: {} }));
jest.unstable_mockModule('../../notification/notificationDispatch.service.js', () => ({
  notifyUsers: mockNotifyUsers,
}));
jest.unstable_mockModule('../topupLock.service.js', () => ({
  reconcileResourceLocks: mockReconcileResourceLocks,
}));
jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
  buildPlanExpiredEmail: mockBuildPlanExpiredEmail,
  buildRenewalReminderEmail: mockBuildRenewalReminderEmail,
}));
// PR-2b (13/09/2026, mục 4.2 Việc 6) — service giờ đọc mẫu plan_expired tuỳ chỉnh qua
// welcomeEmailTemplate.service.js trước khi build email; mock để giữ test này chỉ soi hành vi
// gốc của PR-2a (không lẫn logic đọc mẫu, đã có bộ test riêng ở welcomeEmailTemplate.service.spec.js).
jest.unstable_mockModule('../../email/welcomeEmailTemplate.service.js', () => ({
  loadCustomSystemEmailTemplate: mockLoadCustomSystemEmailTemplate,
}));
// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 3.4 — danh sách mốc giờ đọc từ cấu hình DB
// (mặc định [7,3]) thay vì hai lời gọi cứng findExpiringUsers(6,7,1)/(2,3,2). Luật hợp lệ khi LƯU
// (1-365, không trùng, tối đa 5 mốc, rơi về mặc định khi đọc lỗi) có bộ test riêng ở
// subscriptionReminderSettings.service.spec.js — mock ở đây để cô lập hành vi sendExpiringReminders.
jest.unstable_mockModule('../subscriptionReminderSettings.service.js', () => ({
  getReminderSettings: mockGetReminderSettings,
}));

const { processExpiredSubscriptions, sendExpiringReminders } = await import('../subscriptionExpiry.service.js');

describe('subscriptionExpiry.service — Xử lý gói hết hạn và thư T-0 (PR-2a)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptionRepo.findUsersExpiringInWindow.mockResolvedValue([]);
    mockSubscriptionRepo.expireUserPlan.mockResolvedValue();
    mockSubscriptionRepo.incrementReminderCount.mockResolvedValue();
    mockSubscriptionRepo.markReminderSent.mockResolvedValue();
    mockReconcileResourceLocks.mockResolvedValue({ locked: [], unlocked: [] });
    mockSendSystemEmail.mockResolvedValue();
    mockNotifyUsers.mockReset();
    mockNotifyUsers.mockImplementation(fakeDispatch);
    mockLoadCustomSystemEmailTemplate.mockResolvedValue(null);
    mockGetReminderSettings.mockResolvedValue({ daysBefore: [7, 3], updatedBy: null, updatedAt: null });
    mockBuildPlanExpiredEmail.mockImplementation(({ fullName, planName, expiresAt }) => ({
      subject: `[Founder AI] Gói ${planName} của bạn đã hết hạn`,
      html: `<p>Xin chào ${fullName}, Gói ${planName} hết hạn ${expiresAt}</p>`,
    }));
    mockBuildRenewalReminderEmail.mockImplementation(({ fullName, planName, daysLeft }) => ({
      subject: `[Founder AI] Gói ${planName} sắp hết hạn`,
      html: `<p>Xin chào ${fullName}, còn ${daysLeft} ngày</p>`,
    }));
  });

  describe('processExpiredSubscriptions', () => {
    it('Ca 1: Gửi thư T-0 đúng 1 lần cho user hết hạn (reminder_count < 3) và thu hồi gói', async () => {
      const expiredUsers = [
        {
          id: 101,
          email: 'user101@example.com',
          full_name: 'Khách Hàng 101',
          plan_name: 'Gói Chuyên Nghiệp',
          subscription_expires_at: '2026-09-12T00:00:00.000Z',
          subscription_reminder_count: 2, // Đã nhận nhắc 7 ngày (0) và 3 ngày (1), lần này là lần 3
        },
      ];
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue(expiredUsers);

      const result = await processExpiredSubscriptions({ renewalUrl: 'https://app.uknow.vn/app/billing' });

      expect(result).toEqual({
        expiredCount: 1,
        emailsSent: 1,
        totalFound: 1,
      });

      expect(mockBuildPlanExpiredEmail).toHaveBeenCalledWith({
        fullName: 'Khách Hàng 101',
        planName: 'Gói Chuyên Nghiệp',
        expiresAt: '2026-09-12T00:00:00.000Z',
        renewalUrl: 'https://app.uknow.vn/app/billing',
        template: null,
      });
      expect(mockSendSystemEmail).toHaveBeenCalledWith({
        to: 'user101@example.com',
        subject: '[Founder AI] Gói Gói Chuyên Nghiệp của bạn đã hết hạn',
        html: expect.stringContaining('Gói Gói Chuyên Nghiệp hết hạn'),
      });
      expect(mockSubscriptionRepo.incrementReminderCount).toHaveBeenCalledWith(101, expect.anything());
      expect(mockSubscriptionRepo.expireUserPlan).toHaveBeenCalledWith(101, expect.anything());
    });

    it('TỰ KIỂM TEST CÓ RĂNG 1 — reminder_count < 3: User đã có reminder_count = 3 thì KHÔNG gửi thư thêm, chỉ thu hồi gói', async () => {
      const expiredUsers = [
        {
          id: 102,
          email: 'user102@example.com',
          full_name: 'Khách Hàng 102',
          plan_name: 'Gói Pro',
          subscription_expires_at: '2026-09-12T00:00:00.000Z',
          subscription_reminder_count: 3, // Đã nhận thư T-0 rồi
        },
      ];
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue(expiredUsers);

      const result = await processExpiredSubscriptions();

      // Chỉ thu hồi gói, 0 email gửi
      expect(result.expiredCount).toBe(1);
      expect(result.emailsSent).toBe(0);
      expect(mockBuildPlanExpiredEmail).not.toHaveBeenCalled();
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
      expect(mockSubscriptionRepo.incrementReminderCount).not.toHaveBeenCalled();
      expect(mockSubscriptionRepo.expireUserPlan).toHaveBeenCalledWith(102, expect.anything());
    });

    it('TỰ KIỂM TEST CÓ RĂNG 2 — Thứ tự gửi thư: BẮT BUỘC gửi thư TRƯỚC khi expireUserPlan để tên gói không bị rỗng', async () => {
      const callOrder = [];
      const user = {
        id: 103,
        email: 'user103@example.com',
        full_name: 'Khách Hàng 103',
        plan_name: 'Gói Basic',
        subscription_expires_at: '2026-09-12T00:00:00.000Z',
        subscription_reminder_count: 0,
      };
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([user]);

      // Khi expireUserPlan chạy, mô phỏng việc gói bị xóa khỏi DB/state
      mockSubscriptionRepo.expireUserPlan.mockImplementation(async () => {
        callOrder.push('expireUserPlan');
        user.plan_name = ''; // Tên gói bị rỗng sau khi thu hồi!
      });

      mockBuildPlanExpiredEmail.mockImplementation(({ planName }) => {
        callOrder.push('buildPlanExpiredEmail');
        // Tên gói không được rỗng tại thời điểm build email
        expect(planName).toBeTruthy();
        expect(planName).toBe('Gói Basic');
        return {
          subject: `Gói ${planName} đã hết hạn`,
          html: '<p>expired</p>',
        };
      });

      mockSendSystemEmail.mockImplementation(async () => {
        callOrder.push('sendSystemEmail');
      });

      mockSubscriptionRepo.incrementReminderCount.mockImplementation(async () => {
        callOrder.push('incrementReminderCount');
      });

      const result = await processExpiredSubscriptions();

      expect(result.emailsSent).toBe(1);
      expect(result.expiredCount).toBe(1);

      // Thứ tự bắt buộc: Build email & Gửi email -> Tăng count -> Thu hồi gói
      expect(callOrder).toEqual([
        'buildPlanExpiredEmail',
        'sendSystemEmail',
        'incrementReminderCount',
        'expireUserPlan',
      ]);
    });

    it('Ca thêm 1: Người hết hạn KHÔNG CÓ EMAIL → không nổ lỗi, người có email vẫn được gửi', async () => {
      const expiredUsers = [
        {
          id: 104,
          email: null, // Không có email
          full_name: 'Không Email',
          plan_name: 'Gói Pro',
          subscription_expires_at: '2026-09-12T00:00:00.000Z',
          subscription_reminder_count: 0,
        },
        {
          id: 105,
          email: 'valid105@example.com',
          full_name: 'Có Email',
          plan_name: 'Gói Pro',
          subscription_expires_at: '2026-09-12T00:00:00.000Z',
          subscription_reminder_count: 0,
        },
      ];
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue(expiredUsers);

      const result = await processExpiredSubscriptions();

      expect(result.expiredCount).toBe(2);
      expect(result.emailsSent).toBe(1); // Chỉ gửi cho user 105

      expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
      expect(mockSendSystemEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'valid105@example.com' }));
      expect(mockSubscriptionRepo.incrementReminderCount).not.toHaveBeenCalledWith(104, expect.anything());
      expect(mockSubscriptionRepo.incrementReminderCount).toHaveBeenCalledWith(105, expect.anything());
      expect(mockSubscriptionRepo.expireUserPlan).toHaveBeenCalledWith(104, expect.anything());
      expect(mockSubscriptionRepo.expireUserPlan).toHaveBeenCalledWith(105, expect.anything());
    });

    it('Ca thêm 2: sendSystemEmail ném lỗi cho một người → không làm hỏng cron, KHÔNG incrementReminderCount cho người đó', async () => {
      const expiredUsers = [
        {
          id: 106,
          email: 'error106@example.com',
          full_name: 'User Lỗi Email',
          plan_name: 'Gói Pro',
          subscription_expires_at: '2026-09-12T00:00:00.000Z',
          subscription_reminder_count: 1,
        },
        {
          id: 107,
          email: 'ok107@example.com',
          full_name: 'User OK',
          plan_name: 'Gói Pro',
          subscription_expires_at: '2026-09-12T00:00:00.000Z',
          subscription_reminder_count: 1,
        },
      ];
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue(expiredUsers);

      mockSendSystemEmail.mockImplementation(async ({ to }) => {
        if (to === 'error106@example.com') {
          throw new Error('SMTP connection timeout');
        }
      });

      const result = await processExpiredSubscriptions();

      // Thu hồi được cả 2, nhưng chỉ gửi thành công 1 email
      expect(result.expiredCount).toBe(2);
      expect(result.emailsSent).toBe(1);

      // User 106 lỗi email: KHÔNG được tăng reminder_count (để lần sau có thể retry/không mất thư vĩnh viễn)
      expect(mockSubscriptionRepo.incrementReminderCount).not.toHaveBeenCalledWith(106, expect.anything());
      // User 107 gửi được: có tăng reminder_count
      expect(mockSubscriptionRepo.incrementReminderCount).toHaveBeenCalledWith(107, expect.anything());

      // Cả 2 đều được thu hồi gói
      expect(mockSubscriptionRepo.expireUserPlan).toHaveBeenCalledWith(106, expect.anything());
      expect(mockSubscriptionRepo.expireUserPlan).toHaveBeenCalledWith(107, expect.anything());
    });

    it('Ca 13 (ở tầng service): Lần chạy tiếp theo không còn user hết hạn → 0 thư gửi, 0 gói thu hồi', async () => {
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([]);

      const result = await processExpiredSubscriptions();

      expect(result).toEqual({
        expiredCount: 0,
        emailsSent: 0,
        totalFound: 0,
      });
      expect(mockSubscriptionRepo.expireUserPlan).not.toHaveBeenCalled();
      expect(mockSubscriptionRepo.incrementReminderCount).not.toHaveBeenCalled();
    });

    // PR-2b (13/09/2026, mục 4.2 Việc 6) — chốt việc NỐI mẫu plan_expired do super admin sửa vào
    // thư đang chạy thật (không chỉ có API sửa mẫu mà email T-0 vẫn ra bản cứng). Đột biến kiểm:
    // bỏ dòng loadCustomSystemEmailTemplate ở subscriptionExpiry.service.js hoặc quên truyền
    // template vào buildPlanExpiredEmail thì ca này phải đỏ.
    it('Ca thêm 3: mẫu plan_expired đã bị super admin sửa → truyền đúng object mẫu vào buildPlanExpiredEmail, gọi loadCustomSystemEmailTemplate("plan_expired") đúng 1 lần dù có nhiều user', async () => {
      const customTemplate = { subject: 'Mẫu tuỳ chỉnh', bodyHtml: '<p>Tuỳ chỉnh</p>' };
      mockLoadCustomSystemEmailTemplate.mockResolvedValue(customTemplate);
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([
        {
          id: 201,
          email: 'user201@example.com',
          full_name: 'User A',
          plan_name: 'Gói Pro',
          subscription_expires_at: '2026-09-12T00:00:00.000Z',
          subscription_reminder_count: 0,
        },
        {
          id: 202,
          email: 'user202@example.com',
          full_name: 'User B',
          plan_name: 'Gói Pro',
          subscription_expires_at: '2026-09-12T00:00:00.000Z',
          subscription_reminder_count: 0,
        },
      ]);

      await processExpiredSubscriptions();

      expect(mockLoadCustomSystemEmailTemplate).toHaveBeenCalledWith('plan_expired');
      expect(mockLoadCustomSystemEmailTemplate).toHaveBeenCalledTimes(1);
      expect(mockBuildPlanExpiredEmail).toHaveBeenCalledWith(
        expect.objectContaining({ template: customTemplate })
      );
      expect(mockBuildPlanExpiredEmail).toHaveBeenCalledTimes(2);
    });

    describe('PR-3, Việc 3.1 — khoá tài nguyên NGAY sau khi thu hồi gói (đừng đợi cron reconcile sau)', () => {
      it('gọi reconcileResourceLocks đúng userId + queryable, SAU expireUserPlan, cho MỖI user hết hạn', async () => {
        const callOrder = [];
        mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([
          { id: 301, email: null, full_name: 'A', plan_name: 'Basic', subscription_expires_at: '2026-09-01', subscription_reminder_count: 3 },
          { id: 302, email: null, full_name: 'B', plan_name: 'Pro', subscription_expires_at: '2026-09-02', subscription_reminder_count: 3 },
        ]);
        mockSubscriptionRepo.expireUserPlan.mockImplementation(async (id) => {
          callOrder.push(`expireUserPlan:${id}`);
        });
        mockReconcileResourceLocks.mockImplementation(async (id) => {
          callOrder.push(`reconcile:${id}`);
          return { locked: [], unlocked: [] };
        });
        const queryable = { query: jest.fn() };

        await processExpiredSubscriptions({ queryable });

        expect(callOrder).toEqual([
          'expireUserPlan:301',
          'reconcile:301',
          'expireUserPlan:302',
          'reconcile:302',
        ]);
        expect(mockReconcileResourceLocks).toHaveBeenCalledWith(301, queryable);
        expect(mockReconcileResourceLocks).toHaveBeenCalledWith(302, queryable);
      });

      it('expireUserPlan thất bại thì KHÔNG gọi reconcile cho user đó (không có gì mới để khoá)', async () => {
        mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([
          { id: 401, email: null, full_name: 'A', plan_name: 'Basic', subscription_expires_at: '2026-09-01', subscription_reminder_count: 3 },
        ]);
        mockSubscriptionRepo.expireUserPlan.mockRejectedValue(new Error('DB lỗi tạm thời'));

        const result = await processExpiredSubscriptions();

        expect(result.expiredCount).toBe(0);
        expect(mockReconcileResourceLocks).not.toHaveBeenCalled();
      });

      it('reconcile thất bại KHÔNG làm mất expiredCount đã tính (gói vẫn được coi là đã thu hồi)', async () => {
        mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([
          { id: 501, email: null, full_name: 'A', plan_name: 'Basic', subscription_expires_at: '2026-09-01', subscription_reminder_count: 3 },
        ]);
        mockReconcileResourceLocks.mockRejectedValue(new Error('lock service lỗi'));

        await expect(processExpiredSubscriptions()).resolves.toEqual({
          expiredCount: 1,
          emailsSent: 0,
          totalFound: 1,
        });
      });
    });
  });

  describe('sendExpiringReminders (PLAN_CAU_HINH_LICH_NHAC_HAN — mốc đọc từ cấu hình DB)', () => {
    function user(overrides) {
      return {
        id: 1,
        email: 'user@example.com',
        full_name: 'User',
        plan_name: 'Gói Pro',
        subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        subscription_reminders_sent: {},
        ...overrides,
      };
    }

    it('Ca 1: cấu hình mặc định [7,3] chưa đổi gì → hành vi y hệt hôm nay (2 người mốc 7, 1 người mốc 3)', async () => {
      const week = [user({ id: 301, email: 'u301@example.com', full_name: 'User 7D-1' }),
        user({ id: 302, email: 'u302@example.com', full_name: 'User 7D-2', plan_name: 'Gói Starter' })];
      const threeDay = [user({ id: 303, email: 'u303@example.com', full_name: 'User 3D-1', plan_name: 'Gói Business' })];

      mockSubscriptionRepo.findUsersExpiringInWindow
        .mockResolvedValueOnce(week)
        .mockResolvedValueOnce(threeDay);

      const result = await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/app/billing' });

      expect(result).toEqual({ remindedWeek: 2, remindedThreeDay: 1, failed: 0 });

      // Bắt buộc đúng cửa sổ (d-1, d) cho từng mốc — bảo vệ Bẫy 2/đột biến 3: đổi (d-1,d) thành
      // (d,d) thì tham số gọi lệch, ca này bắt được ngay dù repository bị mock (không cần DB thật).
      expect(mockSubscriptionRepo.findUsersExpiringInWindow).toHaveBeenNthCalledWith(1, 6, 7, expect.anything());
      expect(mockSubscriptionRepo.findUsersExpiringInWindow).toHaveBeenNthCalledWith(2, 2, 3, expect.anything());

      expect(mockSendSystemEmail).toHaveBeenCalledTimes(3);
      expect(mockSubscriptionRepo.markReminderSent).toHaveBeenCalledTimes(3);
      expect(mockSubscriptionRepo.markReminderSent).toHaveBeenCalledWith(
        301, expect.objectContaining({ days: [7] }), expect.anything()
      );
      expect(mockSubscriptionRepo.markReminderSent).toHaveBeenCalledWith(
        303, expect.objectContaining({ days: [3] }), expect.anything()
      );
      // Nhánh nhắc trước hạn không còn dùng subscription_reminder_count (cột đó giờ chỉ còn
      // processExpiredSubscriptions/thư T-0 đọc-ghi).
      expect(mockSubscriptionRepo.incrementReminderCount).not.toHaveBeenCalled();
    });

    it('Ca 2: đổi cấu hình thành [10, 5, 2] → nhắc ở 10, 5, 2 ngày, đúng 3 thư, remindedWeek gộp mốc xa nhất, remindedThreeDay gộp 2 mốc còn lại', async () => {
      mockGetReminderSettings.mockResolvedValue({ daysBefore: [10, 5, 2], updatedBy: 9, updatedAt: null });

      mockSubscriptionRepo.findUsersExpiringInWindow
        .mockResolvedValueOnce([user({ id: 401, email: 'u401@example.com' })])
        .mockResolvedValueOnce([user({ id: 402, email: 'u402@example.com' })])
        .mockResolvedValueOnce([user({ id: 403, email: 'u403@example.com' })]);

      const result = await sendExpiringReminders();

      expect(mockSubscriptionRepo.findUsersExpiringInWindow).toHaveBeenNthCalledWith(1, 9, 10, expect.anything());
      expect(mockSubscriptionRepo.findUsersExpiringInWindow).toHaveBeenNthCalledWith(2, 4, 5, expect.anything());
      expect(mockSubscriptionRepo.findUsersExpiringInWindow).toHaveBeenNthCalledWith(3, 1, 2, expect.anything());
      expect(mockSendSystemEmail).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ remindedWeek: 1, remindedThreeDay: 2, failed: 0 });
    });

    it('Ca 3: đổi cấu hình thành [] → 0 thư nhắc trước hạn, không truy vấn danh sách nào', async () => {
      mockGetReminderSettings.mockResolvedValue({ daysBefore: [], updatedBy: 9, updatedAt: null });

      const result = await sendExpiringReminders();

      expect(mockSubscriptionRepo.findUsersExpiringInWindow).not.toHaveBeenCalled();
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ remindedWeek: 0, remindedThreeDay: 0, failed: 0 });
    });

    it('Ca 4 (quan trọng nhất) — khách đã nhận mốc 7, sếp đổi cấu hình thành [3] → khách VẪN nhận thư 3 ngày', async () => {
      const expiresAt = new Date(Date.now() + 3 * 86400000).toISOString();
      mockGetReminderSettings.mockResolvedValue({ daysBefore: [3], updatedBy: 9, updatedAt: null });
      // Đã nhận mốc 7 trong CÙNG chu kỳ (cycle khớp expiresAt) — nếu còn dùng số đếm kiểu cũ,
      // "count < ngưỡng" sẽ chặn nhầm người này ở mốc 3. Đây đúng là ca mục 1.3 của plan mô tả.
      const already = user({
        id: 501,
        email: 'u501@example.com',
        subscription_expires_at: expiresAt,
        subscription_reminders_sent: { cycle: expiresAt, days: [7] },
      });
      mockSubscriptionRepo.findUsersExpiringInWindow.mockResolvedValueOnce([already]);

      const result = await sendExpiringReminders();

      expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
      expect(result.remindedWeek + result.remindedThreeDay).toBe(1);
      // Giữ lại lịch sử mốc 7 đã gửi, cộng thêm mốc 3 mới — không phải ghi đè mất dấu.
      expect(mockSubscriptionRepo.markReminderSent).toHaveBeenCalledWith(
        501, { cycle: expiresAt, days: [7, 3] }, expect.anything()
      );
    });

    it('Ca 5 (đột biến bắt buộc: bỏ lọc "mốc đã gửi" phải làm ca này đỏ) — cron chạy 2 lần trong ngày → mốc đã gửi KHÔNG gửi lại', async () => {
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      const already = user({
        id: 601,
        email: 'u601@example.com',
        subscription_expires_at: expiresAt,
        subscription_reminders_sent: { cycle: expiresAt, days: [7] },
      });
      const notYet = user({ id: 602, email: 'u602@example.com', subscription_expires_at: expiresAt });
      mockSubscriptionRepo.findUsersExpiringInWindow
        .mockResolvedValueOnce([already, notYet])
        .mockResolvedValueOnce([]);

      const result = await sendExpiringReminders();

      expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
      expect(mockSendSystemEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'u602@example.com' }));
      expect(mockSubscriptionRepo.markReminderSent).not.toHaveBeenCalledWith(601, expect.anything(), expect.anything());
      expect(result).toEqual({ remindedWeek: 1, remindedThreeDay: 0, failed: 0 });
    });

    it('Ca 6 (đột biến bắt buộc: bỏ so cycle với subscription_expires_at phải làm ca này đỏ) — khách gia hạn rồi lại sắp hết hạn → nhận lại đủ mốc của chu kỳ mới', async () => {
      const oldCycle = new Date(Date.now() - 30 * 86400000).toISOString();
      const newExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      // Chu kỳ CŨ đã gửi đủ [7,3] rồi, nhưng subscription_expires_at giờ là một mốc MỚI (khách
      // vừa gia hạn/mua lại) — mảng days cũ không được tính, vì nó thuộc cycle khác.
      const renewed = user({
        id: 701,
        email: 'u701@example.com',
        subscription_expires_at: newExpiresAt,
        subscription_reminders_sent: { cycle: oldCycle, days: [7, 3] },
      });
      mockSubscriptionRepo.findUsersExpiringInWindow.mockResolvedValueOnce([renewed]);

      const result = await sendExpiringReminders();

      expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
      expect(result.remindedWeek).toBe(1);
      // days bắt đầu lại từ đầu cho chu kỳ mới — KHÔNG cộng dồn lên [7,3] cũ.
      expect(mockSubscriptionRepo.markReminderSent).toHaveBeenCalledWith(
        701, { cycle: newExpiresAt, days: [7] }, expect.anything()
      );
    });

    it('TỰ KIỂM TEST CÓ RĂNG — Thứ tự gọi: markReminderSent chỉ được gọi SAU sendSystemEmail thành công', async () => {
      const callOrder = [];
      mockSubscriptionRepo.findUsersExpiringInWindow
        .mockResolvedValueOnce([user({ id: 306 })])
        .mockResolvedValueOnce([]);
      mockSendSystemEmail.mockImplementation(async () => { callOrder.push('sendSystemEmail'); });
      mockSubscriptionRepo.markReminderSent.mockImplementation(async () => { callOrder.push('markReminderSent'); });

      await sendExpiringReminders();

      expect(callOrder).toEqual(['sendSystemEmail', 'markReminderSent']);
    });

    it('Người thứ nhất SMTP lỗi, người thứ hai bình thường → 1 thư gửi được, failed: 1, không ném lỗi, KHÔNG markReminderSent cho người lỗi', async () => {
      const week = [
        user({ id: 304, email: 'broken304@example.com', full_name: 'User SMTP Lỗi' }),
        user({ id: 305, email: 'ok305@example.com', full_name: 'User OK' }),
      ];
      mockSubscriptionRepo.findUsersExpiringInWindow.mockResolvedValueOnce(week).mockResolvedValueOnce([]);
      mockSendSystemEmail.mockImplementation(async ({ to }) => {
        if (to === 'broken304@example.com') throw new Error('SMTP connection refused: 535 authentication failed');
      });

      const result = await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/app/billing' });

      expect(result).toEqual({ remindedWeek: 1, remindedThreeDay: 0, failed: 1 });
      expect(mockSendSystemEmail).toHaveBeenCalledTimes(2);
      expect(mockSubscriptionRepo.markReminderSent).not.toHaveBeenCalledWith(304, expect.anything(), expect.anything());
      expect(mockSubscriptionRepo.markReminderSent).toHaveBeenCalledWith(305, expect.anything(), expect.anything());
    });

    it('Super admin đã sửa mẫu plan_expiring → mọi mốc đều truyền template xuống builder, đọc mẫu đúng 1 lần', async () => {
      const customTemplate = { subject: 'Mẫu nhắc hạn tuỳ chỉnh', bodyHtml: '<p>Sắp hết hạn rồi</p>' };
      mockLoadCustomSystemEmailTemplate.mockResolvedValue(customTemplate);
      mockSubscriptionRepo.findUsersExpiringInWindow
        .mockResolvedValueOnce([user({ id: 307, email: 'u307@example.com', full_name: 'User 7D' })])
        .mockResolvedValueOnce([user({ id: 308, email: 'u308@example.com', full_name: 'User 3D', plan_name: 'Gói Starter' })]);

      await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/renew' });

      expect(mockLoadCustomSystemEmailTemplate).toHaveBeenCalledWith('plan_expiring');
      expect(mockLoadCustomSystemEmailTemplate).toHaveBeenCalledTimes(1);
      expect(mockBuildRenewalReminderEmail).toHaveBeenNthCalledWith(
        1, expect.objectContaining({ fullName: 'User 7D', template: customTemplate })
      );
      expect(mockBuildRenewalReminderEmail).toHaveBeenNthCalledWith(
        2, expect.objectContaining({ fullName: 'User 3D', template: customTemplate })
      );
    });

    it('Chưa ai sửa mẫu (loadCustomSystemEmailTemplate trả null) → truyền template=null để builder ngã về bản cứng', async () => {
      mockSubscriptionRepo.findUsersExpiringInWindow
        .mockResolvedValueOnce([user({ id: 309, email: 'u309@example.com', full_name: 'User 7D' })])
        .mockResolvedValueOnce([user({ id: 310, email: 'u310@example.com', full_name: 'User 3D' })]);

      await sendExpiringReminders();

      expect(mockBuildRenewalReminderEmail).toHaveBeenNthCalledWith(1, expect.objectContaining({ template: null }));
      expect(mockBuildRenewalReminderEmail).toHaveBeenNthCalledWith(2, expect.objectContaining({ template: null }));
    });

    it('Ca 11: 50 người đến hạn (25 mốc 7, 25 mốc 3) → đọc cấu hình VÀ đọc mẫu đúng 1 lần, không phải 50 lần (chống N+1)', async () => {
      const week50 = Array.from({ length: 25 }, (_, i) => user({ id: 400 + i, email: `week${i}@example.com` }));
      const three50 = Array.from({ length: 25 }, (_, i) => user({ id: 500 + i, email: `three${i}@example.com` }));
      mockSubscriptionRepo.findUsersExpiringInWindow.mockResolvedValueOnce(week50).mockResolvedValueOnce(three50);

      const result = await sendExpiringReminders();

      expect(result).toEqual({ remindedWeek: 25, remindedThreeDay: 25, failed: 0 });
      expect(mockGetReminderSettings).toHaveBeenCalledTimes(1);
      expect(mockLoadCustomSystemEmailTemplate).toHaveBeenCalledTimes(1);
      expect(mockSendSystemEmail).toHaveBeenCalledTimes(50);
      expect(mockSubscriptionRepo.markReminderSent).toHaveBeenCalledTimes(50);
    });

    it('Mô phỏng luồng cron đầy đủ (PR-2a + nhắc hạn) → có người lỗi thư nhắc thì cả hai bước vẫn RESOLVE (bước khoá tài nguyên phía sau không bị chặn)', async () => {
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([
        user({ id: 601, email: 'expired601@example.com', full_name: 'User Expired', subscription_expires_at: '2026-09-12T00:00:00.000Z' }),
      ]);
      mockSubscriptionRepo.findUsersExpiringInWindow
        .mockResolvedValueOnce([
          user({ id: 602, email: 'fail602@example.com', full_name: 'User Fail' }),
          user({ id: 603, email: 'ok603@example.com', full_name: 'User OK 7D' }),
        ])
        .mockResolvedValueOnce([user({ id: 604, email: 'ok604@example.com', full_name: 'User OK 3D' })]);
      mockSendSystemEmail.mockImplementation(async ({ to }) => {
        if (to === 'fail602@example.com') throw new Error('SMTP Error 535');
      });

      const expiryResult = await processExpiredSubscriptions();
      const reminderResult = await sendExpiringReminders();

      expect(expiryResult.expiredCount).toBe(1);
      expect(reminderResult).toEqual({ remindedWeek: 1, remindedThreeDay: 1, failed: 1 });
    });
  });

  // PR-6 (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO mục 10) — plan_expiring / plan_expired vào chuông.
  describe('PR-6 — qua dispatcher (chuông + email), sự kiện plan_expired / plan_expiring', () => {
    const expiredUser = (overrides = {}) => ({
      id: 801,
      email: 'u801@example.com',
      full_name: 'Khách 801',
      plan_name: 'Gói Pro',
      subscription_expires_at: '2026-09-12T00:00:00.000Z',
      subscription_reminder_count: 0,
      ...overrides,
    });
    const expiringUser = (overrides = {}) => ({
      id: 901,
      email: 'u901@example.com',
      full_name: 'Khách 901',
      plan_name: 'Gói Pro',
      subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      subscription_reminders_sent: {},
      ...overrides,
    });

    it('plan_expired: notifyUsers đúng sự kiện + người nhận user.id + link billing + khoá theo CHU KỲ (ngày hết hạn giờ VN), mặc định không giới hạn kênh', async () => {
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([expiredUser()]);

      await processExpiredSubscriptions({ renewalUrl: 'https://app.uknow.vn/app/billing' });

      expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
      const call = mockNotifyUsers.mock.calls[0][0];
      expect(call.eventType).toBe('plan_expired');
      expect(call.userIds).toEqual([801]);
      expect(call.link).toBe('/app/billing');
      expect(call.severity).toBe('error');
      expect(call.title).toContain('Gói Pro');
      expect(call.dedupeKey).toBe('plan_expired:801:20260912');
      expect(call.channels).toBeNull();
    });

    it('plan_expired: mẫu email riêng vẫn là buildPlanExpiredEmail (mẫu admin sửa được truyền xuống, tên người nhận do dispatcher cấp)', async () => {
      const customTemplate = { subject: 'Mẫu tuỳ chỉnh', bodyHtml: '<p>x</p>' };
      mockLoadCustomSystemEmailTemplate.mockResolvedValue(customTemplate);
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([expiredUser()]);

      await processExpiredSubscriptions({ renewalUrl: 'https://app.uknow.vn/app/billing' });

      const { email } = mockNotifyUsers.mock.calls[0][0];
      email({ id: 801, email: 'u801@example.com', fullName: 'Tên Từ Dispatcher' });
      expect(mockBuildPlanExpiredEmail).toHaveBeenLastCalledWith({
        fullName: 'Tên Từ Dispatcher',
        planName: 'Gói Pro',
        expiresAt: '2026-09-12T00:00:00.000Z',
        renewalUrl: 'https://app.uknow.vn/app/billing',
        template: customTemplate,
      });
    });

    it('plan_expired: reminder_count >= 3 → channels = ["in_app"] (không email nữa theo luật cũ) nhưng CHUÔNG vẫn báo', async () => {
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([expiredUser({ id: 802, subscription_reminder_count: 3 })]);

      const result = await processExpiredSubscriptions();

      expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
      expect(mockNotifyUsers.mock.calls[0][0].channels).toEqual(['in_app']);
      expect(mockSendSystemEmail).not.toHaveBeenCalled();
      expect(mockSubscriptionRepo.incrementReminderCount).not.toHaveBeenCalled();
      expect(result.emailsSent).toBe(0);
      expect(result.expiredCount).toBe(1);
    });

    it('plan_expired: người KHÔNG có email vẫn được báo qua chuông (trước đây bị bỏ qua im lặng) và gói vẫn bị thu hồi', async () => {
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([expiredUser({ id: 803, email: null })]);

      const result = await processExpiredSubscriptions();

      expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
      expect(mockNotifyUsers.mock.calls[0][0].userIds).toEqual([803]);
      expect(result.expiredCount).toBe(1);
      expect(result.emailsSent).toBe(0);
    });

    it('plan_expired: email mặc định TẮT (dispatcher chỉ ghi chuông, emailSent=0) → KHÔNG incrementReminderCount, KHÔNG tính emailsSent, gói vẫn thu hồi', async () => {
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([expiredUser({ id: 804 })]);
      mockNotifyUsers.mockResolvedValue({ inApp: 1, emailSent: 0, emailSkipped: 0, emailFailed: 0 });

      const result = await processExpiredSubscriptions();

      expect(mockSubscriptionRepo.incrementReminderCount).not.toHaveBeenCalled();
      expect(result).toEqual({ expiredCount: 1, emailsSent: 0, totalFound: 1 });
      expect(mockSubscriptionRepo.expireUserPlan).toHaveBeenCalledWith(804, expect.anything());
    });

    it('plan_expired: notifyUsers ném lỗi bất thường → cron KHÔNG đổ, gói vẫn thu hồi và khoá tài nguyên vẫn chạy', async () => {
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([expiredUser({ id: 805 })]);
      mockNotifyUsers.mockRejectedValue(new Error('db down'));

      const result = await processExpiredSubscriptions();

      expect(result.expiredCount).toBe(1);
      expect(mockSubscriptionRepo.expireUserPlan).toHaveBeenCalledWith(805, expect.anything());
      expect(mockReconcileResourceLocks).toHaveBeenCalledWith(805, expect.anything());
    });

    it('plan_expiring: notifyUsers đúng sự kiện + người nhận + link billing + khoá RIÊNG theo mốc ngày (mốc 7 và mốc 3 cùng chu kỳ là hai khoá)', async () => {
      const expiresAt = '2026-12-20T00:00:00.000Z';
      mockSubscriptionRepo.findUsersExpiringInWindow
        .mockResolvedValueOnce([expiringUser({ id: 901, subscription_expires_at: expiresAt })])
        .mockResolvedValueOnce([expiringUser({ id: 901, subscription_expires_at: expiresAt, subscription_reminders_sent: { cycle: expiresAt, days: [7] } })]);

      await sendExpiringReminders();

      expect(mockNotifyUsers).toHaveBeenCalledTimes(2);
      const [first, second] = mockNotifyUsers.mock.calls.map(([call]) => call);
      expect(first.eventType).toBe('plan_expiring');
      expect(first.userIds).toEqual([901]);
      expect(first.link).toBe('/app/billing');
      expect(first.severity).toBe('warning');
      expect(first.dedupeKey).toBe('plan_expiring:901:20261220:d7');
      expect(second.dedupeKey).toBe('plan_expiring:901:20261220:d3');
      expect(first.dedupeKey).not.toBe(second.dedupeKey);
    });

    it('plan_expiring: mẫu email riêng vẫn là buildRenewalReminderEmail (mẫu admin sửa được + daysLeft + renewalUrl)', async () => {
      const customTemplate = { subject: 'Nhắc tuỳ chỉnh', bodyHtml: '<p>y</p>' };
      mockLoadCustomSystemEmailTemplate.mockResolvedValue(customTemplate);
      mockSubscriptionRepo.findUsersExpiringInWindow.mockResolvedValueOnce([expiringUser()]).mockResolvedValueOnce([]);

      await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/renew' });

      const { email } = mockNotifyUsers.mock.calls[0][0];
      email({ id: 901, email: 'u901@example.com', fullName: 'Tên Từ Dispatcher' });
      expect(mockBuildRenewalReminderEmail).toHaveBeenLastCalledWith(expect.objectContaining({
        fullName: 'Tên Từ Dispatcher',
        planName: 'Gói Pro',
        renewalUrl: 'https://app.uknow.vn/renew',
        template: customTemplate,
        daysLeft: expect.any(Number),
      }));
    });

    it('plan_expiring: email mặc định TẮT (chỉ chuông ghi được) → vẫn markReminderSent + tính vào remindedWeek (không quét lại mốc mỗi ngày)', async () => {
      mockSubscriptionRepo.findUsersExpiringInWindow.mockResolvedValueOnce([expiringUser({ id: 902 })]).mockResolvedValueOnce([]);
      mockNotifyUsers.mockResolvedValue({ inApp: 1, emailSent: 0, emailSkipped: 0, emailFailed: 0 });

      const result = await sendExpiringReminders();

      expect(mockSubscriptionRepo.markReminderSent).toHaveBeenCalledWith(902, expect.objectContaining({ days: [7] }), expect.anything());
      expect(result).toEqual({ remindedWeek: 1, remindedThreeDay: 0, failed: 0 });
    });

    it('plan_expiring: trùng khoá / admin tắt cả hai kênh (mọi số = 0) → vẫn đóng mốc, không failed', async () => {
      mockSubscriptionRepo.findUsersExpiringInWindow.mockResolvedValueOnce([expiringUser({ id: 903 })]).mockResolvedValueOnce([]);
      mockNotifyUsers.mockResolvedValue({ inApp: 0, emailSent: 0, emailSkipped: 0, emailFailed: 0 });

      const result = await sendExpiringReminders();

      expect(mockSubscriptionRepo.markReminderSent).toHaveBeenCalledWith(903, expect.anything(), expect.anything());
      expect(result.failed).toBe(0);
    });

    it('plan_expiring: người KHÔNG có email vẫn được nhắc qua chuông và đóng mốc', async () => {
      mockSubscriptionRepo.findUsersExpiringInWindow.mockResolvedValueOnce([expiringUser({ id: 904, email: null })]).mockResolvedValueOnce([]);

      const result = await sendExpiringReminders();

      expect(mockNotifyUsers).toHaveBeenCalledTimes(1);
      expect(mockSubscriptionRepo.markReminderSent).toHaveBeenCalledWith(904, expect.anything(), expect.anything());
      expect(result.remindedWeek).toBe(1);
    });

    it('plan_expiring: notifyUsers ném lỗi → failed++, KHÔNG markReminderSent, người sau vẫn được xử lý', async () => {
      mockSubscriptionRepo.findUsersExpiringInWindow
        .mockResolvedValueOnce([expiringUser({ id: 905 }), expiringUser({ id: 906, email: 'u906@example.com' })])
        .mockResolvedValueOnce([]);
      mockNotifyUsers.mockRejectedValueOnce(new Error('boom'));

      const result = await sendExpiringReminders();

      expect(result).toEqual({ remindedWeek: 1, remindedThreeDay: 0, failed: 1 });
      expect(mockSubscriptionRepo.markReminderSent).not.toHaveBeenCalledWith(905, expect.anything(), expect.anything());
      expect(mockSubscriptionRepo.markReminderSent).toHaveBeenCalledWith(906, expect.anything(), expect.anything());
    });
  });
});

/**
 * Ghim hợp đồng 5 khoá giám sát ghi vào `cron_job_runs`.
 *
 * Ca nghiệm thu 8 của plan trước đây KHÔNG kiểm được điều nó khẳng định: cả ca unit lẫn ca
 * integration đều TỰ DỰNG lại object result trong test rồi so với chính nó, nên không có gì
 * nối chúng với code thật ghi ra nó. Đột biến 13/09/2026: đổi tên khoá `remindedWeek` ngay
 * trong scheduler.js → 2720 unit + 6 integration VẪN XANH.
 *
 * Nay scheduler.js gọi buildSubscriptionCronResult, và khối dưới đây canh đúng hàm đó.
 */
describe('buildSubscriptionCronResult — hợp đồng 5 khoá với dashboard giám sát', () => {
  it('trả ĐÚNG bộ khoá, không thừa không thiếu', async () => {
    const { buildSubscriptionCronResult } = await import('../subscriptionExpiry.service.js');

    const result = buildSubscriptionCronResult({
      expiryResult: { expiredCount: 2 },
      reminderResult: { remindedWeek: 3, remindedThreeDay: 4 },
      lockedUsers: 5,
      reminderWeek: 6,
      reminderThree: 7,
    });

    // Đổi tên bất kỳ khoá nào trong 5 khoá giám sát là làm mù dashboard → ca này phải đỏ.
    expect(Object.keys(result).sort()).toEqual([
      'expired', 'lockedUsers', 'remindedThreeDay', 'remindedWeek',
      'reminderThree', 'reminderWeek', 'synced',
    ]);
    expect(result.expired).toBe(2);
    expect(result.remindedWeek).toBe(3);
    expect(result.remindedThreeDay).toBe(4);
    expect(result.lockedUsers).toBe(5);
    expect(result.synced).toBe(2 + 3 + 4 + 5 + 6 + 7);
  });

  it('thiếu dữ liệu đầu vào thì về 0, không ra NaN (NaN ghi vào cron_job_runs là mù số liệu)', async () => {
    const { buildSubscriptionCronResult } = await import('../subscriptionExpiry.service.js');

    const result = buildSubscriptionCronResult();

    for (const [key, value] of Object.entries(result)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBe(0);
      expect(key).toBeTruthy();
    }
  });
});

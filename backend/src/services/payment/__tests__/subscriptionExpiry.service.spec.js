import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockSubscriptionRepo = {
  findExpiredUsers: jest.fn(),
  findExpiringUsers: jest.fn(),
  expireUserPlan: jest.fn(),
  incrementReminderCount: jest.fn(),
};

const mockSendSystemEmail = jest.fn();
const mockBuildPlanExpiredEmail = jest.fn();
const mockBuildRenewalReminderEmail = jest.fn();
const mockLoadCustomSystemEmailTemplate = jest.fn();

jest.unstable_mockModule('../../../repositories/subscription/subscription.repository.js', () => mockSubscriptionRepo);
jest.unstable_mockModule('../../../config/database.js', () => ({ default: {} }));
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

const { processExpiredSubscriptions, sendExpiringReminders } = await import('../subscriptionExpiry.service.js');

describe('subscriptionExpiry.service — Xử lý gói hết hạn và thư T-0 (PR-2a)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptionRepo.findExpiringUsers.mockResolvedValue([]);
    mockSubscriptionRepo.expireUserPlan.mockResolvedValue();
    mockSubscriptionRepo.incrementReminderCount.mockResolvedValue();
    mockSendSystemEmail.mockResolvedValue();
    mockLoadCustomSystemEmailTemplate.mockResolvedValue(null);
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
  });

  describe('sendExpiringReminders (PR tách vòng lặp nhắc hạn)', () => {
    it('Ca 1: 2 người ở mốc 7 ngày, 1 người ở mốc 3 ngày → 3 thư, remindedWeek: 2, remindedThreeDay: 1, failed: 0', async () => {
      const weekUsers = [
        {
          id: 301,
          email: 'user301@example.com',
          full_name: 'User 7D-1',
          plan_name: 'Gói Pro',
          subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          subscription_reminder_count: 0,
        },
        {
          id: 302,
          email: 'user302@example.com',
          full_name: 'User 7D-2',
          plan_name: 'Gói Starter',
          subscription_expires_at: new Date(Date.now() + 6.5 * 86400000).toISOString(),
          subscription_reminder_count: 0,
        },
      ];
      const threeDayUsers = [
        {
          id: 303,
          email: 'user303@example.com',
          full_name: 'User 3D-1',
          plan_name: 'Gói Business',
          subscription_expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
          subscription_reminder_count: 1,
        },
      ];

      mockSubscriptionRepo.findExpiringUsers
        .mockResolvedValueOnce(weekUsers)
        .mockResolvedValueOnce(threeDayUsers);

      const result = await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/app/billing' });

      expect(result).toEqual({
        remindedWeek: 2,
        remindedThreeDay: 1,
        failed: 0,
      });

      // Bắt buộc đúng tham số cho hai lượt (bảo vệ đột biến 5: (6, 7, 1) và (2, 3, 2))
      expect(mockSubscriptionRepo.findExpiringUsers).toHaveBeenNthCalledWith(1, 6, 7, 1);
      expect(mockSubscriptionRepo.findExpiringUsers).toHaveBeenNthCalledWith(2, 2, 3, 2);

      // Cả 3 người đều nhận thư
      expect(mockSendSystemEmail).toHaveBeenCalledTimes(3);
      expect(mockSubscriptionRepo.incrementReminderCount).toHaveBeenCalledTimes(3);
      expect(mockSubscriptionRepo.incrementReminderCount).toHaveBeenCalledWith(301, expect.anything());
      expect(mockSubscriptionRepo.incrementReminderCount).toHaveBeenCalledWith(302, expect.anything());
      expect(mockSubscriptionRepo.incrementReminderCount).toHaveBeenCalledWith(303, expect.anything());
    });

    it('Ca 2 & 3: Người thứ nhất SMTP lỗi, người thứ hai bình thường → 1 thư gửi được, failed: 1, không ném lỗi, KHÔNG tăng đếm người lỗi', async () => {
      const weekUsers = [
        {
          id: 304,
          email: 'broken304@example.com',
          full_name: 'User SMTP Lỗi',
          plan_name: 'Gói Pro',
          subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          subscription_reminder_count: 0,
        },
        {
          id: 305,
          email: 'ok305@example.com',
          full_name: 'User OK',
          plan_name: 'Gói Pro',
          subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          subscription_reminder_count: 0,
        },
      ];

      mockSubscriptionRepo.findExpiringUsers
        .mockResolvedValueOnce(weekUsers)
        .mockResolvedValueOnce([]);

      mockSendSystemEmail.mockImplementation(async ({ to }) => {
        if (to === 'broken304@example.com') {
          throw new Error('SMTP connection refused: 535 authentication failed');
        }
      });

      const result = await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/app/billing' });

      // Người thứ hai vẫn nhận thư, failed: 1, không ném ra ngoài
      expect(result).toEqual({
        remindedWeek: 1,
        remindedThreeDay: 0,
        failed: 1,
      });

      expect(mockSendSystemEmail).toHaveBeenCalledTimes(2);

      // Người lỗi KHÔNG được tăng reminder_count (để hôm sau retry)
      expect(mockSubscriptionRepo.incrementReminderCount).not.toHaveBeenCalledWith(304, expect.anything());
      // Người thành công ĐƯỢC tăng reminder_count
      expect(mockSubscriptionRepo.incrementReminderCount).toHaveBeenCalledWith(305, expect.anything());
    });

    it('TỰ KIỂM TEST CÓ RĂNG — Thứ tự gọi: incrementReminderCount chỉ được gọi SAU sendSystemEmail thành công', async () => {
      const callOrder = [];
      const user = {
        id: 306,
        email: 'user306@example.com',
        full_name: 'User Thứ Tự',
        plan_name: 'Gói Pro',
        subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        subscription_reminder_count: 0,
      };

      mockSubscriptionRepo.findExpiringUsers
        .mockResolvedValueOnce([user])
        .mockResolvedValueOnce([]);

      mockSendSystemEmail.mockImplementation(async () => {
        callOrder.push('sendSystemEmail');
      });

      mockSubscriptionRepo.incrementReminderCount.mockImplementation(async () => {
        callOrder.push('incrementReminderCount');
      });

      await sendExpiringReminders();

      expect(callOrder).toEqual(['sendSystemEmail', 'incrementReminderCount']);
    });

    it('Ca 5 (Đột biến 1 & 2): Super admin đã sửa mẫu plan_expiring → CẢ HAI lượt nhắc 7 ngày và 3 ngày đều truyền template xuống builder', async () => {
      const customTemplate = { subject: 'Mẫu nhắc hạn tuỳ chỉnh', bodyHtml: '<p>Sắp hết hạn rồi</p>' };
      mockLoadCustomSystemEmailTemplate.mockResolvedValue(customTemplate);

      const userWeek = {
        id: 307,
        email: 'user307@example.com',
        full_name: 'User 7D',
        plan_name: 'Gói Pro',
        subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        subscription_reminder_count: 0,
      };
      const userThree = {
        id: 308,
        email: 'user308@example.com',
        full_name: 'User 3D',
        plan_name: 'Gói Starter',
        subscription_expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        subscription_reminder_count: 1,
      };

      mockSubscriptionRepo.findExpiringUsers
        .mockResolvedValueOnce([userWeek])
        .mockResolvedValueOnce([userThree]);

      await sendExpiringReminders({ renewalUrl: 'https://app.uknow.vn/renew' });

      expect(mockLoadCustomSystemEmailTemplate).toHaveBeenCalledWith('plan_expiring');
      expect(mockLoadCustomSystemEmailTemplate).toHaveBeenCalledTimes(1);

      // Đột biến 1: Kiểm tra lượt 7 ngày BẮT BUỘC nhận template tuỳ chỉnh
      expect(mockBuildRenewalReminderEmail).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          fullName: 'User 7D',
          planName: 'Gói Pro',
          template: customTemplate,
          renewalUrl: 'https://app.uknow.vn/renew',
        })
      );

      // Đột biến 2: Kiểm tra lượt 3 ngày BẮT BUỘC nhận template tuỳ chỉnh
      expect(mockBuildRenewalReminderEmail).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          fullName: 'User 3D',
          planName: 'Gói Starter',
          template: customTemplate,
          renewalUrl: 'https://app.uknow.vn/renew',
        })
      );
    });

    it('Ca 6: Chưa ai sửa mẫu (loadCustomSystemEmailTemplate trả null) → truyền template=null cho cả hai lượt để builder ngã về bản cứng', async () => {
      mockLoadCustomSystemEmailTemplate.mockResolvedValue(null);

      const userWeek = {
        id: 309,
        email: 'user309@example.com',
        full_name: 'User 7D',
        plan_name: 'Gói Pro',
        subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        subscription_reminder_count: 0,
      };
      const userThree = {
        id: 310,
        email: 'user310@example.com',
        full_name: 'User 3D',
        plan_name: 'Gói Pro',
        subscription_expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        subscription_reminder_count: 1,
      };

      mockSubscriptionRepo.findExpiringUsers
        .mockResolvedValueOnce([userWeek])
        .mockResolvedValueOnce([userThree]);

      await sendExpiringReminders();

      expect(mockBuildRenewalReminderEmail).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ fullName: 'User 7D', template: null })
      );
      expect(mockBuildRenewalReminderEmail).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ fullName: 'User 3D', template: null })
      );
    });

    it('Ca 7: 50 người đến hạn (25 ở mốc 7 ngày, 25 ở mốc 3 ngày) → loadCustomSystemEmailTemplate gọi đúng 1 lần, không phải 50 lần (chống N+1)', async () => {
      const week50 = Array.from({ length: 25 }, (_, i) => ({
        id: 400 + i,
        email: `week${i}@example.com`,
        full_name: `User Week ${i}`,
        plan_name: 'Gói Pro',
        subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        subscription_reminder_count: 0,
      }));
      const three50 = Array.from({ length: 25 }, (_, i) => ({
        id: 500 + i,
        email: `three${i}@example.com`,
        full_name: `User Three ${i}`,
        plan_name: 'Gói Pro',
        subscription_expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        subscription_reminder_count: 1,
      }));

      mockSubscriptionRepo.findExpiringUsers
        .mockResolvedValueOnce(week50)
        .mockResolvedValueOnce(three50);

      const result = await sendExpiringReminders();

      expect(result).toEqual({
        remindedWeek: 25,
        remindedThreeDay: 25,
        failed: 0,
      });
      // Đọc mẫu đúng 1 lần duy nhất cho toàn bộ lượt chạy
      expect(mockLoadCustomSystemEmailTemplate).toHaveBeenCalledTimes(1);
      expect(mockBuildRenewalReminderEmail).toHaveBeenCalledTimes(50);
      expect(mockSendSystemEmail).toHaveBeenCalledTimes(50);
      expect(mockSubscriptionRepo.incrementReminderCount).toHaveBeenCalledTimes(50);
    });

    it('Ca 4 & 8: Mô phỏng toàn bộ luồng cron (PR-2a + nhắc hạn + khoá tài nguyên) → có người lỗi thư nhắc thì bước khoá tài nguyên vẫn chạy, cron_job_runs đầy đủ 5 khoá', async () => {
      // 1. Giả lập hết hạn (1 user)
      mockSubscriptionRepo.findExpiredUsers.mockResolvedValue([
        {
          id: 601,
          email: 'expired601@example.com',
          full_name: 'User Expired',
          plan_name: 'Gói Pro',
          subscription_expires_at: '2026-09-12T00:00:00.000Z',
          subscription_reminder_count: 0,
        },
      ]);

      // 2. Giả lập nhắc hạn: 1 user lỗi, 1 user thành công ở 7 ngày; 1 user thành công ở 3 ngày
      mockSubscriptionRepo.findExpiringUsers
        .mockResolvedValueOnce([
          {
            id: 602,
            email: 'fail602@example.com',
            full_name: 'User Fail',
            plan_name: 'Gói Pro',
            subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            subscription_reminder_count: 0,
          },
          {
            id: 603,
            email: 'ok603@example.com',
            full_name: 'User OK 7D',
            plan_name: 'Gói Pro',
            subscription_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
            subscription_reminder_count: 0,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 604,
            email: 'ok604@example.com',
            full_name: 'User OK 3D',
            plan_name: 'Gói Pro',
            subscription_expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
            subscription_reminder_count: 1,
          },
        ]);

      mockSendSystemEmail.mockImplementation(async ({ to }) => {
        if (to === 'fail602@example.com') {
          throw new Error('SMTP Error 535');
        }
      });

      // Chạy bước 1: expiry
      const expiryResult = await processExpiredSubscriptions();

      // Chạy bước 2 & 3: reminder
      const reminderResult = await sendExpiringReminders();

      // Bước 4 (khoá tài nguyên) trong cron thật nằm SAU hai lời gọi trên. Thứ duy nhất có thể
      // ngăn nó chạy là một trong hai lời gọi ném ra ngoài — nên phép kiểm đúng là "cả hai
      // RESOLVE dù có người gửi hỏng", chứ không phải một cờ tự đặt.
      //
      // (Bản trước ở đây viết `const step4Executed = true; expect(step4Executed).toBe(true);`
      //  — một phép lặp thừa luôn xanh, không nối với hành vi nào. Claude gỡ 13/09/2026.)
      await expect(sendExpiringReminders()).resolves.toEqual(
        expect.objectContaining({ failed: expect.any(Number) })
      );

      const lockedUsers = 0;
      const reminderWeek = 0;
      const reminderThree = 0;

      // Kết quả ghi vào cron_job_runs — hình dạng do buildSubscriptionCronResult quyết định,
      // ghim riêng ở khối cuối file.
      const processed = expiryResult.expiredCount + reminderResult.remindedWeek + reminderResult.remindedThreeDay
        + lockedUsers + reminderWeek + reminderThree;
      const cronRunResult = {
        expired: expiryResult.expiredCount,
        remindedWeek: reminderResult.remindedWeek,
        remindedThreeDay: reminderResult.remindedThreeDay,
        lockedUsers,
        reminderWeek,
        reminderThree,
        synced: processed,
      };

      expect(cronRunResult).toEqual({
        expired: 1,
        remindedWeek: 1,
        remindedThreeDay: 1,
        lockedUsers: 0,
        reminderWeek: 0,
        reminderThree: 0,
        synced: 3,
      });

      // Kiểm tra đầy đủ 5 khoá giám sát: expired, remindedWeek, remindedThreeDay, lockedUsers, synced
      expect(cronRunResult).toHaveProperty('expired');
      expect(cronRunResult).toHaveProperty('remindedWeek');
      expect(cronRunResult).toHaveProperty('remindedThreeDay');
      expect(cronRunResult).toHaveProperty('lockedUsers');
      expect(cronRunResult).toHaveProperty('synced');
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

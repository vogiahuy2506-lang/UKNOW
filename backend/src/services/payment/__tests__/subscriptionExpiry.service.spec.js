import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockSubscriptionRepo = {
  findExpiredUsers: jest.fn(),
  expireUserPlan: jest.fn(),
  incrementReminderCount: jest.fn(),
};

const mockSendSystemEmail = jest.fn();
const mockBuildPlanExpiredEmail = jest.fn();

jest.unstable_mockModule('../../../repositories/subscription/subscription.repository.js', () => mockSubscriptionRepo);
jest.unstable_mockModule('../../../config/database.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
  buildPlanExpiredEmail: mockBuildPlanExpiredEmail,
}));

const { processExpiredSubscriptions } = await import('../subscriptionExpiry.service.js');

describe('subscriptionExpiry.service — Xử lý gói hết hạn và thư T-0 (PR-2a)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptionRepo.expireUserPlan.mockResolvedValue();
    mockSubscriptionRepo.incrementReminderCount.mockResolvedValue();
    mockSendSystemEmail.mockResolvedValue();
    mockBuildPlanExpiredEmail.mockImplementation(({ fullName, planName, expiresAt }) => ({
      subject: `[Founder AI] Gói ${planName} của bạn đã hết hạn`,
      html: `<p>Xin chào ${fullName}, Gói ${planName} hết hạn ${expiresAt}</p>`,
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
  });
});

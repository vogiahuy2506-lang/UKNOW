import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockScheduledPlanChangeRepo = {
  findPendingByUserId: jest.fn(),
  supersedePendingByUserId: jest.fn(),
  supersedePendingById: jest.fn(),
  findDueChanges: jest.fn(),
  claimDueChange: jest.fn(),
  markActivated: jest.fn(),
};

const mockPaymentRepo = {
  activateUserPlan: jest.fn(),
  findNewerSuccessfulPlanCheckout: jest.fn(),
};

const mockLockUserForPlanActivation = jest.fn();

const mockClient = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
};

const mockDb = {
  getClient: jest.fn().mockResolvedValue(mockClient),
  query: jest.fn(),
};

const mockTopupLockService = {
  reconcileResourceLocks: jest.fn().mockResolvedValue(),
};

const mockSystemEmail = {
  sendSystemEmail: jest.fn().mockResolvedValue(),
};

// PR-3 (đợt rà soát 26/09), Việc 2.1 — updateCustomPlanLimits được import ĐỘNG
// (`await import(...)`) bên trong processDueScheduledPlanChanges; unstable_mockModule
// vẫn chặn được vì cùng specifier, kể cả khi import xảy ra lúc runtime chứ không phải
// lúc module load.
const mockCustomPlanRepo = {
  updateCustomPlanLimits: jest.fn().mockResolvedValue(),
};

jest.unstable_mockModule('../../../repositories/payment/scheduledPlanChange.repository.js', () => ({
  scheduledPlanChangeRepository: mockScheduledPlanChangeRepo,
  ScheduledPlanChangeRepository: jest.fn(() => mockScheduledPlanChangeRepo),
}));

jest.unstable_mockModule('../../../repositories/payment/payment.repository.js', () => mockPaymentRepo);
jest.unstable_mockModule('../../../repositories/user/user.repository.js', () => ({
  lockUserForPlanActivation: mockLockUserForPlanActivation,
}));
jest.unstable_mockModule('../../../config/database.js', () => ({ default: mockDb }));
jest.unstable_mockModule('../topupLock.service.js', () => mockTopupLockService);
jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => mockSystemEmail);
jest.unstable_mockModule('../../../repositories/payment/customPlan.repository.js', () => mockCustomPlanRepo);

const {
  getPendingScheduledChange,
  cancelPendingScheduledChange,
  processDueScheduledPlanChanges,
} = await import('../scheduledPlanChange.service.js');

describe('scheduledPlanChange.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLockUserForPlanActivation.mockResolvedValue({ id: 100, email: 'test@example.com' });
    mockPaymentRepo.findNewerSuccessfulPlanCheckout.mockResolvedValue(null);
  });

  describe('getPendingScheduledChange', () => {
    it('returns null if no userId', async () => {
      const res = await getPendingScheduledChange(null);
      expect(res).toBeNull();
    });

    it('returns pending change from repository', async () => {
      mockScheduledPlanChangeRepo.findPendingByUserId.mockResolvedValue({ id: 10, plan_id: 2 });
      const res = await getPendingScheduledChange(100);
      expect(res).toEqual({ id: 10, plan_id: 2 });
    });
  });

  describe('cancelPendingScheduledChange', () => {
    it('throws 404 if no pending change exists', async () => {
      mockScheduledPlanChangeRepo.findPendingByUserId.mockResolvedValue(null);
      await expect(cancelPendingScheduledChange(100)).rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 if changeId does not match', async () => {
      mockScheduledPlanChangeRepo.findPendingByUserId.mockResolvedValue({ id: 10 });
      await expect(cancelPendingScheduledChange(100, 99)).rejects.toMatchObject({ status: 400 });
    });

    it('supersedes pending change on success', async () => {
      mockScheduledPlanChangeRepo.findPendingByUserId.mockResolvedValue({ id: 10 });
      mockScheduledPlanChangeRepo.supersedePendingById.mockResolvedValue({ id: 10, status: 'superseded' });

      const res = await cancelPendingScheduledChange(100, 10);
      expect(mockLockUserForPlanActivation).toHaveBeenCalledWith(100, mockClient);
      expect(mockScheduledPlanChangeRepo.findPendingByUserId).toHaveBeenCalledWith(100, mockClient);
      expect(mockScheduledPlanChangeRepo.supersedePendingById).toHaveBeenCalledWith(10, mockClient);
      expect(res.success).toBe(true);
    });
  });

  describe('processDueScheduledPlanChanges', () => {
    it('returns 0 if no due changes', async () => {
      mockScheduledPlanChangeRepo.findDueChanges.mockResolvedValue([]);
      const res = await processDueScheduledPlanChanges();
      expect(res.processed).toBe(0);
    });

    it('processes and activates due changes', async () => {
      mockScheduledPlanChangeRepo.findDueChanges.mockResolvedValue([
        {
          id: 5,
          user_id: 200,
          plan_id: 3,
          billing_period: 'monthly',
          user_email: 'test@example.com',
          plan_name: 'Pro',
        },
      ]);
      mockScheduledPlanChangeRepo.claimDueChange.mockResolvedValue({
        id: 5,
        user_id: 200,
        plan_id: 3,
        billing_period: 'monthly',
        user_email: 'test@example.com',
        plan_name: 'Pro',
      });
      mockScheduledPlanChangeRepo.markActivated.mockResolvedValue({ id: 5 });
      mockPaymentRepo.activateUserPlan.mockResolvedValue();

      const res = await processDueScheduledPlanChanges();

      expect(mockLockUserForPlanActivation).toHaveBeenCalledWith(200, mockClient);
      expect(mockScheduledPlanChangeRepo.claimDueChange).toHaveBeenCalledWith(5, 200, mockClient);
      expect(mockPaymentRepo.activateUserPlan).toHaveBeenCalledWith(200, 3, 'monthly', mockClient);
      expect(mockScheduledPlanChangeRepo.markActivated).toHaveBeenCalledWith(5, mockClient);
      expect(res.processed).toBe(1);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('does not activate a due change superseded by a newer paid checkout', async () => {
      mockScheduledPlanChangeRepo.findDueChanges.mockResolvedValue([
        { id: 6, user_id: 200, plan_id: 3, billing_period: 'monthly' },
      ]);
      mockScheduledPlanChangeRepo.claimDueChange.mockResolvedValue({
        id: 6,
        user_id: 200,
        plan_id: 3,
        billing_period: 'monthly',
        order_id: 101,
      });
      mockPaymentRepo.findNewerSuccessfulPlanCheckout.mockResolvedValue({
        newer_successful_order_id: 102,
        newer_successful_order_code: 900102,
      });
      mockScheduledPlanChangeRepo.supersedePendingById.mockResolvedValue({ id: 6, status: 'superseded' });

      await expect(processDueScheduledPlanChanges()).resolves.toEqual({ processed: 0 });

      expect(mockScheduledPlanChangeRepo.supersedePendingById).toHaveBeenCalledWith(6, mockClient);
      expect(mockPaymentRepo.activateUserPlan).not.toHaveBeenCalled();
      expect(mockScheduledPlanChangeRepo.markActivated).not.toHaveBeenCalled();
    });

    // PR-3 (đợt rà soát 26/09), Việc 2.1
    it('ghi cấu hình Tùy chọn mới vào plans TRƯỚC khi activateUserPlan khi lệnh hẹn có custom_plan_config', async () => {
      mockScheduledPlanChangeRepo.findDueChanges.mockResolvedValue([
        { id: 7, user_id: 300, plan_id: 99, billing_period: 'monthly' },
      ]);
      const customConfig = { name: 'Gói tự chọn', price: 200000, priceYearly: null, max_zalo_accounts: 2 };
      mockScheduledPlanChangeRepo.claimDueChange.mockResolvedValue({
        id: 7,
        user_id: 300,
        plan_id: 99,
        billing_period: 'monthly',
        custom_plan_config: customConfig,
      });
      mockScheduledPlanChangeRepo.markActivated.mockResolvedValue({ id: 7 });
      mockPaymentRepo.activateUserPlan.mockResolvedValue();

      const callOrder = [];
      mockCustomPlanRepo.updateCustomPlanLimits.mockImplementationOnce(async () => { callOrder.push('updateCustomPlanLimits'); });
      mockPaymentRepo.activateUserPlan.mockImplementationOnce(async () => { callOrder.push('activateUserPlan'); });

      const res = await processDueScheduledPlanChanges();

      expect(mockCustomPlanRepo.updateCustomPlanLimits).toHaveBeenCalledWith(99, customConfig, mockClient);
      expect(callOrder).toEqual(['updateCustomPlanLimits', 'activateUserPlan']);
      expect(res.processed).toBe(1);
    });

    it('parse custom_plan_config dạng chuỗi JSON (cột JSONB có thể trả về string tuỳ driver)', async () => {
      mockScheduledPlanChangeRepo.findDueChanges.mockResolvedValue([
        { id: 8, user_id: 300, plan_id: 99, billing_period: 'monthly' },
      ]);
      mockScheduledPlanChangeRepo.claimDueChange.mockResolvedValue({
        id: 8,
        user_id: 300,
        plan_id: 99,
        billing_period: 'monthly',
        custom_plan_config: JSON.stringify({ name: 'Gói tự chọn', price: 150000 }),
      });
      mockScheduledPlanChangeRepo.markActivated.mockResolvedValue({ id: 8 });
      mockPaymentRepo.activateUserPlan.mockResolvedValue();

      await processDueScheduledPlanChanges();

      expect(mockCustomPlanRepo.updateCustomPlanLimits).toHaveBeenCalledWith(
        99,
        { name: 'Gói tự chọn', price: 150000 },
        mockClient
      );
    });

    it('KHÔNG gọi updateCustomPlanLimits khi lệnh hẹn là gói cố định (không có custom_plan_config)', async () => {
      mockScheduledPlanChangeRepo.findDueChanges.mockResolvedValue([
        { id: 5, user_id: 200, plan_id: 3, billing_period: 'monthly' },
      ]);
      mockScheduledPlanChangeRepo.claimDueChange.mockResolvedValue({
        id: 5,
        user_id: 200,
        plan_id: 3,
        billing_period: 'monthly',
        custom_plan_config: null,
      });
      mockScheduledPlanChangeRepo.markActivated.mockResolvedValue({ id: 5 });
      mockPaymentRepo.activateUserPlan.mockResolvedValue();

      await processDueScheduledPlanChanges();

      expect(mockCustomPlanRepo.updateCustomPlanLimits).not.toHaveBeenCalled();
      expect(mockPaymentRepo.activateUserPlan).toHaveBeenCalledWith(200, 3, 'monthly', mockClient);
    });
  });
});

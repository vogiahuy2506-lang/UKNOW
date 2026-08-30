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
  });
});

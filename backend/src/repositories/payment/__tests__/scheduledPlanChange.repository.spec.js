import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ScheduledPlanChangeRepository } from '../scheduledPlanChange.repository.js';

describe('ScheduledPlanChangeRepository', () => {
  let mockDb;
  let repo;

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    };
    repo = new ScheduledPlanChangeRepository(mockDb);
  });

  describe('findPendingByUserId', () => {
    it('returns pending change row or null', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 10, status: 'pending' }] });
      const result = await repo.findPendingByUserId(10);
      expect(result).toEqual({ id: 1, user_id: 10, status: 'pending' });
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('WHERE spc.user_id = $1'), [10]);
    });
  });

  describe('findByOrderId', () => {
    it('returns null if no orderId', async () => {
      const res = await repo.findByOrderId(null);
      expect(res).toBeNull();
    });

    it('returns scheduled change row by orderId', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, order_id: 99 }] });
      const res = await repo.findByOrderId(99);
      expect(res).toEqual({ id: 1, order_id: 99 });
    });
  });

  describe('create', () => {
    it('inserts a new pending change and returns it', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 10, plan_id: 2 }] });
      const res = await repo.create({
        userId: 10,
        planId: 2,
        billingPeriod: 'monthly',
        orderId: 100,
        amountPaid: 299000,
        activateAfter: new Date('2026-09-01'),
      });
      expect(res).toEqual({ id: 1, user_id: 10, plan_id: 2 });
    });
  });

  describe('supersedePendingByUserId', () => {
    it('marks pending rows as superseded', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'superseded' }] });
      const res = await repo.supersedePendingByUserId(10);
      expect(res).toEqual([{ id: 1, status: 'superseded' }]);
    });
  });

  describe('findDueChanges', () => {
    it('returns list of due pending changes', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, activate_after: new Date() }] });
      const res = await repo.findDueChanges();
      expect(res).toHaveLength(1);
    });
  });

  describe('markActivated', () => {
    it('marks change as activated', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'activated' }] });
      const res = await repo.markActivated(1);
      expect(res.status).toBe('activated');
    });
  });
});

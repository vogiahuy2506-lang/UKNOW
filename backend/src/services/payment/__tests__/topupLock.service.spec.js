import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSumActive = jest.fn();
const mockGetPlan = jest.fn();
const mockDeleteOrphan = jest.fn();
const mockCountValid = jest.fn();
const mockCountInUse = jest.fn();
const mockListUnlocked = jest.fn();
const mockListLocked = jest.fn();
const mockInsertLock = jest.fn();
const mockDeleteLock = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/topup.repository.js', () => ({
  sumActiveTopupGrants: mockSumActive,
}));

jest.unstable_mockModule('../../../repositories/payment/plan.repository.js', () => ({
  getPlanByUserId: mockGetPlan,
}));

jest.unstable_mockModule('../../../repositories/payment/topupLock.repository.js', () => ({
  LOCKABLE_RESOURCE_KEYS: ['zalo_accounts', 'email_accounts', 'landing_pages', 'chatbots', 'employees'],
  isResourceLocked: jest.fn(),
  filterLockedResources: jest.fn(),
  deleteOrphanLocks: mockDeleteOrphan,
  countValidLocks: mockCountValid,
  countResourcesInUse: mockCountInUse,
  listUnlockedResourceIds: mockListUnlocked,
  listLockedResourceIds: mockListLocked,
  insertLock: mockInsertLock,
  deleteLock: mockDeleteLock,
  replaceLocksForUser: jest.fn(),
  listResourcesWithLockStatus: jest.fn(),
  findUsersWithExpiredStructuralGrants: jest.fn(),
  findUsersWithLocks: jest.fn(),
  findExpiringStructuralGrants: jest.fn(),
  incrementGrantReminderCount: jest.fn(),
}));

const mockQueryable = {
  query: jest.fn(async (sql) => {
    if (String(sql).includes('overage_grace_until')) {
      return { rows: [{ overage_grace_until: null }] };
    }
    if (String(sql).includes('max_zalo_accounts')) {
      return { rows: [{ max_zalo_accounts: 1 }] };
    }
    if (String(sql).includes('max_email_accounts')) {
      return { rows: [{ max_email_accounts: 1 }] };
    }
    if (String(sql).includes('max_landing_pages')) {
      return { rows: [{ max_landing_pages: 1 }] };
    }
    if (String(sql).includes('max_employees')) {
      return { rows: [{ max_employees: 1 }] };
    }
    return { rows: [] };
  }),
};

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: mockQueryable,
}));

const { reconcileResourceLocks, getLockOverview } = await import('../topupLock.service.js');

describe('reconcileResourceLocks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteOrphan.mockResolvedValue(0);
    mockSumActive.mockResolvedValue(0);
    mockGetPlan.mockResolvedValue({ max_chatbots: 3 });
    mockCountInUse.mockResolvedValue(0);
    mockCountValid.mockResolvedValue(0);
    mockListUnlocked.mockResolvedValue([]);
    mockListLocked.mockResolvedValue([]);
    mockQueryable.query.mockImplementation(async (sql) => {
      if (String(sql).includes('overage_grace_until')) {
        return { rows: [{ overage_grace_until: null }] };
      }
      if (String(sql).includes('max_zalo_accounts')) {
        return { rows: [{ max_zalo_accounts: 1 }] };
      }
      if (String(sql).includes('max_email_accounts')) {
        return { rows: [{ max_email_accounts: 1 }] };
      }
      if (String(sql).includes('max_landing_pages')) {
        return { rows: [{ max_landing_pages: 1 }] };
      }
      if (String(sql).includes('max_employees')) {
        return { rows: [{ max_employees: 1 }] };
      }
      return { rows: [] };
    });
  });

  it('locks oldest excess zalo accounts when over ceiling', async () => {
    mockCountInUse.mockImplementation(async (_uid, key) => (key === 'zalo_accounts' ? 2 : 0));
    mockCountValid.mockResolvedValue(0);
    mockListUnlocked.mockImplementation(async (_uid, key) => (
      key === 'zalo_accounts' ? [10, 20] : []
    ));

    const result = await reconcileResourceLocks(42, mockQueryable);

    expect(mockInsertLock).toHaveBeenCalledWith(42, 'zalo_accounts', 10, mockQueryable);
    expect(mockInsertLock).toHaveBeenCalledTimes(1);
    expect(result.locked).toEqual([{ resourceKey: 'zalo_accounts', resourceId: 10 }]);
  });

  it('skips locking when overage_grace_until is active (7-day grace period)', async () => {
    mockQueryable.query.mockImplementation(async (sql) => {
      if (String(sql).includes('overage_grace_until')) {
        return { rows: [{ overage_grace_until: new Date(Date.now() + 5 * 86400 * 1000).toISOString() }] };
      }
      if (String(sql).includes('max_zalo_accounts')) {
        return { rows: [{ max_zalo_accounts: 1 }] };
      }
      return { rows: [] };
    });

    mockCountInUse.mockImplementation(async (_uid, key) => (key === 'zalo_accounts' ? 3 : 0));
    mockCountValid.mockResolvedValue(0);
    mockListUnlocked.mockImplementation(async (_uid, key) => (
      key === 'zalo_accounts' ? [10, 20, 30] : []
    ));

    const result = await reconcileResourceLocks(42, mockQueryable);

    expect(mockInsertLock).not.toHaveBeenCalled();
    expect(result.locked).toEqual([]);
    expect(result.isGraceActive).toBe(true);
  });

  it('locks employees when exceeding employee ceiling', async () => {
    mockQueryable.query.mockImplementation(async (sql) => {
      if (String(sql).includes('overage_grace_until')) {
        return { rows: [{ overage_grace_until: null }] };
      }
      if (String(sql).includes('max_employees')) {
        return { rows: [{ max_employees: 1 }] };
      }
      return { rows: [] };
    });

    mockCountInUse.mockImplementation(async (_uid, key) => (key === 'employees' ? 3 : 0));
    mockCountValid.mockResolvedValue(0);
    mockListUnlocked.mockImplementation(async (_uid, key) => (
      key === 'employees' ? [101, 102, 103] : []
    ));

    const result = await reconcileResourceLocks(42, mockQueryable);

    expect(mockInsertLock).toHaveBeenCalledWith(42, 'employees', 101, mockQueryable);
    expect(mockInsertLock).toHaveBeenCalledWith(42, 'employees', 102, mockQueryable);
    expect(mockInsertLock).toHaveBeenCalledTimes(2);
    expect(result.locked).toEqual([
      { resourceKey: 'employees', resourceId: 101 },
      { resourceKey: 'employees', resourceId: 102 },
    ]);
  });

  it('unlocks most-recently-locked when under ceiling after grant', async () => {
    mockSumActive.mockImplementation(async (_uid, key) => (key === 'zalo_accounts' ? 1 : 0));
    mockCountInUse.mockImplementation(async (_uid, key) => (key === 'zalo_accounts' ? 2 : 0));
    mockCountValid.mockImplementation(async (_uid, key) => (key === 'zalo_accounts' ? 1 : 0));
    mockListLocked.mockImplementation(async (_uid, key) => (
      key === 'zalo_accounts' ? [20] : []
    ));

    const result = await reconcileResourceLocks(7, mockQueryable);

    expect(mockDeleteLock).toHaveBeenCalledWith('zalo_accounts', 20, mockQueryable);
    expect(result.unlocked).toEqual([{ resourceKey: 'zalo_accounts', resourceId: 20 }]);
  });

  it('does not lock chatbots when plan max_chatbots covers usage', async () => {
    mockGetPlan.mockResolvedValue({ max_chatbots: 3 });
    mockCountInUse.mockImplementation(async (_uid, key) => (key === 'chatbots' ? 3 : 0));
    mockCountValid.mockResolvedValue(0);

    const result = await reconcileResourceLocks(9, mockQueryable);

    expect(mockInsertLock).not.toHaveBeenCalled();
    expect(result.locked).toEqual([]);
  });

  it('unlockOnly skips locking when over ceiling but still unlocks under ceiling', async () => {
    mockCountInUse.mockImplementation(async (_uid, key) => {
      if (key === 'zalo_accounts') return 3; // over plan ceiling 1
      if (key === 'landing_pages') return 0;
      return 0;
    });
    mockCountValid.mockImplementation(async (_uid, key) => (
      key === 'landing_pages' ? 1 : 0
    ));
    mockSumActive.mockImplementation(async (_uid, key) => (
      key === 'landing_pages' ? 1 : 0
    ));
    mockListUnlocked.mockImplementation(async (_uid, key) => (
      key === 'zalo_accounts' ? [10, 20, 30] : []
    ));
    mockListLocked.mockImplementation(async (_uid, key) => (
      key === 'landing_pages' ? [99] : []
    ));
    // plan landing 1 + grant 1 = effective 2; inUse 0 locked 1 → running -1 < 2 → unlock
    mockQueryable.query.mockImplementation(async (sql) => {
      if (String(sql).includes('overage_grace_until')) {
        return { rows: [{ overage_grace_until: null }] };
      }
      if (String(sql).includes('max_zalo_accounts')) {
        return { rows: [{ max_zalo_accounts: 1 }] };
      }
      if (String(sql).includes('max_email_accounts')) {
        return { rows: [{ max_email_accounts: 1 }] };
      }
      if (String(sql).includes('max_landing_pages')) {
        return { rows: [{ max_landing_pages: 1 }] };
      }
      if (String(sql).includes('max_employees')) {
        return { rows: [{ max_employees: 1 }] };
      }
      return { rows: [] };
    });

    const result = await reconcileResourceLocks(5, mockQueryable, { unlockOnly: true });

    expect(mockInsertLock).not.toHaveBeenCalled();
    expect(result.locked).toEqual([]);
    expect(mockDeleteLock).toHaveBeenCalledWith('landing_pages', 99, mockQueryable);
    expect(result.unlocked).toEqual([{ resourceKey: 'landing_pages', resourceId: 99 }]);
  });
});

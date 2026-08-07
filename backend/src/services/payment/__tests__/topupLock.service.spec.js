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
  LOCKABLE_RESOURCE_KEYS: ['zalo_accounts', 'email_accounts', 'landing_pages', 'chatbots'],
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
    if (String(sql).includes('max_zalo_accounts')) {
      return { rows: [{ max_zalo_accounts: 1 }] };
    }
    if (String(sql).includes('max_email_accounts')) {
      return { rows: [{ max_email_accounts: 1 }] };
    }
    if (String(sql).includes('max_landing_pages')) {
      return { rows: [{ max_landing_pages: 1 }] };
    }
    return { rows: [] };
  }),
};

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: mockQueryable,
}));

const { reconcileResourceLocks } = await import('../topupLock.service.js');

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
  });

  it('locks newest excess zalo accounts when over ceiling', async () => {
    mockCountInUse.mockImplementation(async (_uid, key) => (key === 'zalo_accounts' ? 2 : 0));
    mockCountValid.mockResolvedValue(0);
    mockListUnlocked.mockImplementation(async (_uid, key) => (
      key === 'zalo_accounts' ? [20, 10] : []
    ));

    const result = await reconcileResourceLocks(42, mockQueryable);

    expect(mockInsertLock).toHaveBeenCalledWith(42, 'zalo_accounts', 20, mockQueryable);
    expect(mockInsertLock).toHaveBeenCalledTimes(1);
    expect(result.locked).toEqual([{ resourceKey: 'zalo_accounts', resourceId: 20 }]);
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
});

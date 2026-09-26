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

const { reconcileResourceLocks, getLockOverview, normalizeCeiling } = await import('../topupLock.service.js');

describe('normalizeCeiling — PR-3, Việc 3.2 (hợp đồng NULL/-1 = không giới hạn)', () => {
  it('null (cột DB thật sự NULL, vd gói Enterprise/Tùy chọn) -> Infinity', () => {
    expect(normalizeCeiling(null)).toBe(Infinity);
  });

  it('-1 (quy ước riêng của max_employees gói Tùy chọn) -> Infinity', () => {
    expect(normalizeCeiling(-1)).toBe(Infinity);
  });

  it('undefined (KHÔNG có gói / không đọc được cột — KHÁC null) -> 0, KHÔNG được lẫn với null', () => {
    // Đây chính là ranh giới hiểm nhất: raw === null (strict) mới đúng. Nếu ai đó "gọn hoá" thành
    // raw == null (loose), undefined sẽ lẫn vào null và biến chủ ĐÃ HẾT GÓI (plan=null ->
    // plan?.max_chatbots=undefined) thành "không giới hạn" — xem đột biến M3 trong mut_pr3.py.
    expect(normalizeCeiling(undefined)).toBe(0);
  });

  it('0 -> 0 (cấm hoàn toàn, KHÔNG phải không giới hạn — vd vừa expireUserPlan)', () => {
    expect(normalizeCeiling(0)).toBe(0);
  });

  it('số dương bình thường -> giữ nguyên', () => {
    expect(normalizeCeiling(5)).toBe(5);
  });

  it('chuỗi số hỏng/NaN -> 0 (khoá an toàn, không mở nhầm)', () => {
    expect(normalizeCeiling('abc')).toBe(0);
  });
});

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

  it('locks employees when exceeding employee ceiling (trần đọc từ plans.max_employees, KHÔNG phải users.max_employees)', async () => {
    // PR-3, Việc 3.2 — bẫy chính: users.max_employees không bao giờ được ghi (luôn NULL trên thật),
    // để giá trị này khác hẳn giá trị plan (1) để chứng minh code KHÔNG còn đọc từ bảng users nữa.
    mockGetPlan.mockResolvedValue({ max_chatbots: 3, max_employees: 1 });
    mockQueryable.query.mockImplementation(async (sql) => {
      if (String(sql).includes('overage_grace_until')) {
        return { rows: [{ overage_grace_until: null }] };
      }
      if (String(sql).includes('max_employees')) {
        return { rows: [{ max_employees: null }] }; // giá trị thật trên production — phải bị BỎ QUA
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

  it('PR-3, Việc 3.2 — gói Tùy chọn (max_employees=-1) KHÔNG bị khoá nhầm nhân viên dù dùng rất nhiều', async () => {
    mockGetPlan.mockResolvedValue({ max_chatbots: null, max_employees: -1 });
    mockCountInUse.mockImplementation(async (_uid, key) => (key === 'employees' ? 50 : 0));
    mockCountValid.mockResolvedValue(0);
    mockListUnlocked.mockImplementation(async (_uid, key) => (
      key === 'employees' ? Array.from({ length: 50 }, (_, i) => i + 1) : []
    ));

    const result = await reconcileResourceLocks(42, mockQueryable);

    expect(mockInsertLock).not.toHaveBeenCalled();
    expect(result.locked).toEqual([]);
  });

  it('PR-3, Việc 3.2 — gói Enterprise (max_zalo_accounts=NULL) KHÔNG bị khoá nhầm tài khoản Zalo', async () => {
    mockQueryable.query.mockImplementation(async (sql) => {
      if (String(sql).includes('overage_grace_until')) {
        return { rows: [{ overage_grace_until: null }] };
      }
      if (String(sql).includes('max_zalo_accounts')) {
        return { rows: [{ max_zalo_accounts: null }] }; // users.max_zalo_accounts copy từ plan NULL
      }
      return { rows: [] };
    });
    mockCountInUse.mockImplementation(async (_uid, key) => (key === 'zalo_accounts' ? 20 : 0));
    mockCountValid.mockResolvedValue(0);
    mockListUnlocked.mockImplementation(async (_uid, key) => (
      key === 'zalo_accounts' ? Array.from({ length: 20 }, (_, i) => i + 1) : []
    ));

    const result = await reconcileResourceLocks(42, mockQueryable);

    expect(mockInsertLock).not.toHaveBeenCalled();
    expect(result.locked).toEqual([]);
  });

  it('PR-3, Việc 3.2 — chủ KHÔNG có gói hiệu lực (đã hết hạn) vẫn khoá đúng chatbot/nhân viên về 0, KHÔNG hiểu nhầm thành không giới hạn', async () => {
    // plan=null mô phỏng getPlanByUserId sau khi active_plan_id đã bị NULL hoá — đây là ca dễ vá SAI
    // NHẤT của Việc 3.2: nếu lỡ gọi normalizeCeiling(plan?.max_chatbots) mà không có nhánh `!plan`
    // riêng, plan?.max_chatbots = undefined sẽ bị hiểu thành "cột NULL = không giới hạn".
    mockGetPlan.mockResolvedValue(null);
    mockCountInUse.mockImplementation(async (_uid, key) => (
      key === 'chatbots' || key === 'employees' ? 2 : 0
    ));
    mockCountValid.mockResolvedValue(0);
    mockListUnlocked.mockImplementation(async (_uid, key) => (
      key === 'chatbots' || key === 'employees' ? [1, 2] : []
    ));

    const result = await reconcileResourceLocks(42, mockQueryable);

    expect(mockInsertLock).toHaveBeenCalledWith(42, 'chatbots', 1, mockQueryable);
    expect(mockInsertLock).toHaveBeenCalledWith(42, 'employees', 1, mockQueryable);
    expect(result.locked).toEqual(
      expect.arrayContaining([
        { resourceKey: 'chatbots', resourceId: 1 },
        { resourceKey: 'employees', resourceId: 1 },
      ])
    );
  });

  it('PR-3, Việc 3.3 — khách xoá bớt nhân viên về dưới trần đã sửa đúng thì lần reconcile sau MỞ khoá', async () => {
    mockGetPlan.mockResolvedValue({ max_chatbots: 3, max_employees: 2 });
    mockCountInUse.mockImplementation(async (_uid, key) => (key === 'employees' ? 2 : 0));
    mockCountValid.mockImplementation(async (_uid, key) => (key === 'employees' ? 1 : 0));
    mockListLocked.mockImplementation(async (_uid, key) => (key === 'employees' ? [103] : []));

    const result = await reconcileResourceLocks(42, mockQueryable);

    expect(mockDeleteLock).toHaveBeenCalledWith('employees', 103, mockQueryable);
    expect(result.unlocked).toEqual([{ resourceKey: 'employees', resourceId: 103 }]);
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

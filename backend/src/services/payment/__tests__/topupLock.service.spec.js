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
const mockFindExpiringStructuralGrants = jest.fn();
const mockIncrementGrantReminderCount = jest.fn();
const mockSendSystemEmail = jest.fn();
const mockFindExpiringUnrenewedGrants = jest.fn();
const mockFindUsersWithExpiredStructuralGrants = jest.fn();
const mockFindUsersWithLocks = jest.fn();
const mockFindUsersWithEndedOverageGrace = jest.fn();
const mockFindUsersEligibleForOverageGrace = jest.fn();
const mockFindExpiredUsers = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/topup.repository.js', () => ({
  sumActiveTopupGrants: mockSumActive,
  findExpiringUnrenewedGrants: mockFindExpiringUnrenewedGrants,
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
  findUsersWithExpiredStructuralGrants: mockFindUsersWithExpiredStructuralGrants,
  findUsersWithLocks: mockFindUsersWithLocks,
  findUsersWithEndedOverageGrace: mockFindUsersWithEndedOverageGrace,
  findUsersEligibleForOverageGrace: mockFindUsersEligibleForOverageGrace,
  findExpiringStructuralGrants: mockFindExpiringStructuralGrants,
  incrementGrantReminderCount: mockIncrementGrantReminderCount,
}));

jest.unstable_mockModule('../../../repositories/subscription/subscription.repository.js', () => ({
  findExpiredUsers: mockFindExpiredUsers,
}));

jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
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

const {
  reconcileResourceLocks,
  getLockOverview,
  normalizeCeiling,
  sendStructuralGrantReminders,
  reconcileAllDueUsers,
  buildLockNoticeEmail,
  sendLockNotices,
  computeOverage,
  buildOverageGraceNotice,
  startGraceForUnlockedOverage,
} = await import('../topupLock.service.js');

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

// "Nợ nhỏ" 26/09 — Infinity qua JSON.stringify() ngầm định thành null, tab "Tài nguyên bị khoá" đọc
// Number(null)||0 = 0 → khoá nhầm ô chọn cho tài nguyên KHÔNG giới hạn (4 chủ enterprise + 1 custom
// có max_chatbots NULL trên production). getLockOverview() phải tự ép null tường minh, không dựa
// vào quirk serialize của JSON.
describe('getLockOverview — trả null tường minh cho tài nguyên không giới hạn (không phải Infinity)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSumActive.mockResolvedValue(0);
  });

  it('cột NULL (không giới hạn) -> effectiveCeiling/planCeiling = null, KHÔNG phải Infinity', async () => {
    mockGetPlan.mockResolvedValue({ max_chatbots: null, max_employees: null });
    mockQueryable.query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('overage_grace_until')) return { rows: [{ overage_grace_until: null }] };
      if (s.includes('max_zalo_accounts')) return { rows: [{ max_zalo_accounts: null }] };
      if (s.includes('max_email_accounts')) return { rows: [{ max_email_accounts: null }] };
      if (s.includes('max_landing_pages')) return { rows: [{ max_landing_pages: null }] };
      return { rows: [] };
    });

    const overview = await getLockOverview(99, mockQueryable);

    for (const key of ['zalo_accounts', 'email_accounts', 'landing_pages', 'chatbots', 'employees']) {
      expect(overview[key].effectiveCeiling).toBeNull();
      expect(overview[key].planCeiling).toBeNull();
      // Object.is phân biệt được: nếu code lỡ trả Infinity thì .toBeNull() đã đỏ ở trên, nhưng
      // kiểm thêm typeof để chặn trường hợp JSON.stringify từng làm im lặng một giá trị sai kiểu.
      expect(overview[key].effectiveCeiling).not.toBe(Infinity);
    }
  });

  it('cột có số bình thường -> effectiveCeiling/planCeiling vẫn là số, không bị ép về null', async () => {
    mockGetPlan.mockResolvedValue({ max_chatbots: 3, max_employees: 2 });
    mockQueryable.query.mockImplementation(async (sql) => {
      const s = String(sql);
      if (s.includes('overage_grace_until')) return { rows: [{ overage_grace_until: null }] };
      if (s.includes('max_zalo_accounts')) return { rows: [{ max_zalo_accounts: 1 }] };
      if (s.includes('max_email_accounts')) return { rows: [{ max_email_accounts: 1 }] };
      if (s.includes('max_landing_pages')) return { rows: [{ max_landing_pages: 1 }] };
      return { rows: [] };
    });

    const overview = await getLockOverview(99, mockQueryable);

    expect(overview.chatbots.effectiveCeiling).toBe(3);
    expect(overview.chatbots.planCeiling).toBe(3);
    expect(overview.employees.effectiveCeiling).toBe(2);
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

describe('sendStructuralGrantReminders — nhắc hết hạn, riêng storage_gb + escape full_name', () => {
  const cycleEnd = new Date(Date.now() + 5 * 86400000).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
    mockIncrementGrantReminderCount.mockResolvedValue(undefined);
    mockSendSystemEmail.mockResolvedValue({ messageId: 'x' });
    // Mặc định "luật gia hạn không xác định được" (như lỗi truy vấn) cho MỌI test trong describe
    // này chưa tự cấu hình riêng — giữ đúng hành vi CŨ (luôn gửi) cho các ca đã có từ trước, không
    // cần sửa lại chúng khi thêm luật bỏ-qua-đã-gia-hạn. Các ca mới bên dưới tự ghi đè bằng
    // mockResolvedValueOnce/mockRejectedValueOnce theo từng ca.
    mockFindExpiringUnrenewedGrants.mockRejectedValue(new Error('not configured in this test'));
  });

  it('nhánh storage_gb: tiêu đề/thân riêng, KHÔNG có link "Chọn tài nguyên giữ lại", giống nhau cả 2 lượt', async () => {
    const grant = { id: 1, item_key: 'storage_gb', qty: 50, cycle_end: cycleEnd, email: 'a@x.com', full_name: 'Chủ A' };
    mockFindExpiringStructuralGrants.mockResolvedValueOnce([grant]).mockResolvedValueOnce([grant]);

    await sendStructuralGrantReminders();

    expect(mockSendSystemEmail).toHaveBeenCalledTimes(2);
    for (const call of mockSendSystemEmail.mock.calls) {
      const [{ subject, html }] = call;
      expect(subject).toMatch(/^\[Founder AI\] Dung lượng mua thêm sắp hết hạn \(\d+ ngày\)$/);
      expect(html).toContain('50 GB dung lượng lưu trữ mua thêm sẽ hết hạn');
      expect(html).toContain('trở về mức của gói');
      expect(html).not.toContain('Chọn tài nguyên giữ lại');
      expect(html).not.toContain('billing?tab=locks');
    }
  });

  it('nhánh khác (chatbots): vẫn câu chữ cũ theo từng lượt, CÓ link "Chọn tài nguyên giữ lại"', async () => {
    const grant = { id: 2, item_key: 'chatbots', qty: 1, cycle_end: cycleEnd, email: 'b@x.com', full_name: 'Chủ B' };
    mockFindExpiringStructuralGrants.mockResolvedValueOnce([grant]).mockResolvedValueOnce([grant]);

    await sendStructuralGrantReminders();

    const [weekCall, threeCall] = mockSendSystemEmail.mock.calls;
    expect(weekCall[0].subject).toMatch(/^\[Founder AI\] Slot mua thêm sắp hết hạn \(\d+ ngày\)$/);
    expect(weekCall[0].html).toContain('1 × <strong>chatbot</strong> mua thêm sẽ hết hạn');
    expect(weekCall[0].html).toContain('Chọn tài nguyên giữ lại');
    expect(threeCall[0].subject).toMatch(/^\[Founder AI\] Còn \d+ ngày — slot mua thêm sắp bị khoá$/);
    expect(threeCall[0].html).toContain('Chọn tài nguyên giữ lại');
  });

  it('full_name chứa "<b>" bị escape ở cả nhánh storage_gb lẫn nhánh khác — không lọt HTML injection', async () => {
    const evilName = '<b>Chủ</b><script>alert(1)</script>';
    const storageGrant = { id: 3, item_key: 'storage_gb', qty: 10, cycle_end: cycleEnd, email: 'c@x.com', full_name: evilName };
    const chatbotGrant = { id: 4, item_key: 'chatbots', qty: 1, cycle_end: cycleEnd, email: 'd@x.com', full_name: evilName };
    mockFindExpiringStructuralGrants
      .mockResolvedValueOnce([storageGrant, chatbotGrant])
      .mockResolvedValueOnce([]);

    await sendStructuralGrantReminders();

    for (const call of mockSendSystemEmail.mock.calls) {
      const [{ html }] = call;
      expect(html).not.toContain('<b>Chủ</b>');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;b&gt;Chủ&lt;/b&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    }
  });

  it('gửi hỏng cho grant này KHÔNG chặn grant khác; chỉ tăng reminder_count cho grant gửi thành công', async () => {
    const ok = { id: 5, item_key: 'storage_gb', qty: 5, cycle_end: cycleEnd, email: 'ok@x.com', full_name: 'OK' };
    const fail = { id: 6, item_key: 'storage_gb', qty: 5, cycle_end: cycleEnd, email: 'fail@x.com', full_name: 'Fail' };
    mockFindExpiringStructuralGrants.mockResolvedValueOnce([ok, fail]).mockResolvedValueOnce([]);
    mockSendSystemEmail.mockImplementation(async ({ to }) => {
      if (to === 'fail@x.com') throw new Error('SMTP down');
      return { messageId: 'x' };
    });

    const result = await sendStructuralGrantReminders();

    expect(result).toEqual({ week: 2, three: 0 });
    expect(mockIncrementGrantReminderCount).toHaveBeenCalledTimes(1);
    expect(mockIncrementGrantReminderCount).toHaveBeenCalledWith(5);
  });
});

describe('sendStructuralGrantReminders — bỏ qua item đã gia hạn đủ (dùng lại findExpiringUnrenewedGrants)', () => {
  const cycleEnd = new Date(Date.now() + 5 * 86400000).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
    mockIncrementGrantReminderCount.mockResolvedValue(undefined);
    mockSendSystemEmail.mockResolvedValue({ messageId: 'x' });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('itemKey KHÔNG có trong kết quả findExpiringUnrenewedGrants (đã gia hạn đủ) → không gửi, không tăng reminder_count', async () => {
    const grant = { id: 10, user_id: 100, item_key: 'chatbots', qty: 1, cycle_end: cycleEnd, email: 'renewed@x.com', full_name: 'Renewed' };
    mockFindExpiringStructuralGrants.mockResolvedValueOnce([grant]).mockResolvedValueOnce([]);
    // chatbots không nằm trong kết quả -> đã được gia hạn đủ.
    mockFindExpiringUnrenewedGrants.mockResolvedValueOnce([{ itemKey: 'email_accounts', qty: 1, cycleEnd }]);

    const result = await sendStructuralGrantReminders();

    expect(mockSendSystemEmail).not.toHaveBeenCalled();
    expect(mockIncrementGrantReminderCount).not.toHaveBeenCalled();
    expect(mockFindExpiringUnrenewedGrants).toHaveBeenCalledWith(100);
    expect(result).toEqual({ week: 1, three: 0 });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('grant=10'));
  });

  it('itemKey CÓ trong kết quả findExpiringUnrenewedGrants (chưa gia hạn) → gửi như bình thường', async () => {
    const grant = { id: 11, user_id: 101, item_key: 'email_accounts', qty: 1, cycle_end: cycleEnd, email: 'notyet@x.com', full_name: 'Chua gia han' };
    mockFindExpiringStructuralGrants.mockResolvedValueOnce([grant]).mockResolvedValueOnce([]);
    mockFindExpiringUnrenewedGrants.mockResolvedValueOnce([{ itemKey: 'email_accounts', qty: 1, cycleEnd }]);

    await sendStructuralGrantReminders();

    expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSystemEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'notyet@x.com' }));
    expect(mockIncrementGrantReminderCount).toHaveBeenCalledWith(11);
  });

  it('truy vấn luật gia hạn ném lỗi cho một khách → vẫn gửi như cũ, không chặn khách khác', async () => {
    const grantErr = { id: 12, user_id: 102, item_key: 'landing_pages', qty: 1, cycle_end: cycleEnd, email: 'err@x.com', full_name: 'Loi truy van' };
    const grantOther = { id: 13, user_id: 103, item_key: 'zalo_accounts', qty: 1, cycle_end: cycleEnd, email: 'ok2@x.com', full_name: 'Khach khac' };
    mockFindExpiringStructuralGrants.mockResolvedValueOnce([grantErr, grantOther]).mockResolvedValueOnce([]);
    mockFindExpiringUnrenewedGrants.mockImplementation(async (userId) => {
      if (userId === 102) throw new Error('DB timeout');
      return [{ itemKey: 'zalo_accounts', qty: 1, cycleEnd }];
    });

    await sendStructuralGrantReminders();

    expect(mockSendSystemEmail).toHaveBeenCalledTimes(2);
    expect(mockIncrementGrantReminderCount).toHaveBeenCalledWith(12);
    expect(mockIncrementGrantReminderCount).toHaveBeenCalledWith(13);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('user=102'), expect.any(String));
  });

  it('2 grant CÙNG một khách (kể cả khác lượt 7 ngày/3 ngày) → findExpiringUnrenewedGrants chỉ bị gọi 1 lần', async () => {
    const grantWeek = { id: 14, user_id: 104, item_key: 'email_accounts', qty: 1, cycle_end: cycleEnd, email: 'same@x.com', full_name: 'Cung khach' };
    const grantThree = { id: 15, user_id: 104, item_key: 'zalo_accounts', qty: 1, cycle_end: cycleEnd, email: 'same@x.com', full_name: 'Cung khach' };
    mockFindExpiringStructuralGrants.mockResolvedValueOnce([grantWeek]).mockResolvedValueOnce([grantThree]);
    mockFindExpiringUnrenewedGrants.mockResolvedValueOnce([
      { itemKey: 'email_accounts', qty: 1, cycleEnd },
      { itemKey: 'zalo_accounts', qty: 1, cycleEnd },
    ]);

    await sendStructuralGrantReminders();

    expect(mockFindExpiringUnrenewedGrants).toHaveBeenCalledTimes(1);
    expect(mockFindExpiringUnrenewedGrants).toHaveBeenCalledWith(104);
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(2);
  });
});

describe('buildLockNoticeEmail — thư báo khoá do vượt hạn mức (Việc 2)', () => {
  it('escape full_name chứa HTML; liệt kê đúng số lượng theo resourceKey; đủ 2 link', () => {
    const { subject, html } = buildLockNoticeEmail({
      fullName: '<b>Chủ</b>',
      locked: [
        { resourceKey: 'zalo_accounts', resourceId: 1 },
        { resourceKey: 'zalo_accounts', resourceId: 2 },
        { resourceKey: 'chatbots', resourceId: 3 },
      ],
      frontendUrl: 'https://app.example.com',
    });

    expect(subject).toBe('[Founder AI] Một số tài nguyên đã bị tạm khoá do vượt hạn mức');
    expect(html).toContain('&lt;b&gt;Chủ&lt;/b&gt;');
    expect(html).not.toContain('<b>Chủ</b>');
    expect(html).toContain('2 tài khoản Zalo, 1 chatbot');
    expect(html).toContain('https://app.example.com/app/billing?tab=locks');
    expect(html).toContain('https://app.example.com/app/topup');
  });

  it('không có fullName → dùng "bạn"', () => {
    const { html } = buildLockNoticeEmail({ fullName: null, locked: [{ resourceKey: 'chatbots', resourceId: 1 }], frontendUrl: 'https://x.com' });
    expect(html).toContain('Xin chào bạn,');
  });
});

describe('sendLockNotices — mỗi user một try/catch riêng (Việc 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendSystemEmail.mockResolvedValue({ messageId: 'x' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('bỏ qua entry không có locked (unlock-only); gửi đúng 1 thư cho entry có locked', async () => {
    const queryable = {
      query: jest.fn(async () => ({ rows: [{ email: 'a@x.com', full_name: 'A' }] })),
    };
    const results = [
      { userId: 1, locked: [], unlocked: [{ resourceKey: 'chatbots', resourceId: 9 }] },
      { userId: 2, locked: [{ resourceKey: 'chatbots', resourceId: 10 }], unlocked: [] },
    ];

    const sent = await sendLockNotices(results, queryable);

    expect(sent).toBe(1);
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSystemEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@x.com' }));
  });

  it('sendSystemEmail ném lỗi cho user A → vẫn gửi cho user B, trả về 1', async () => {
    const queryable = {
      query: jest.fn(async (sql, params) => {
        const id = params[0];
        if (id === 1) return { rows: [{ email: 'a@x.com', full_name: 'A' }] };
        return { rows: [{ email: 'b@x.com', full_name: 'B' }] };
      }),
    };
    mockSendSystemEmail.mockImplementation(async ({ to }) => {
      if (to === 'a@x.com') throw new Error('SMTP down');
      return { messageId: 'x' };
    });
    const results = [
      { userId: 1, locked: [{ resourceKey: 'chatbots', resourceId: 1 }] },
      { userId: 2, locked: [{ resourceKey: 'chatbots', resourceId: 2 }] },
    ];

    const sent = await sendLockNotices(results, queryable);

    expect(sent).toBe(1);
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('user 1'), expect.any(String));
  });

  it('user không có email (đã xoá tài khoản?) → bỏ qua, không lỗi', async () => {
    const queryable = { query: jest.fn(async () => ({ rows: [] })) };
    const sent = await sendLockNotices([{ userId: 1, locked: [{ resourceKey: 'chatbots', resourceId: 1 }] }], queryable);
    expect(sent).toBe(0);
    expect(mockSendSystemEmail).not.toHaveBeenCalled();
  });
});

describe('reconcileAllDueUsers — gom thêm tập "đã hết ân hạn hạ gói" (Việc 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryable.query.mockImplementation(async (sql) => {
      if (String(sql).includes('overage_grace_until')) {
        return { rows: [{ overage_grace_until: null }] };
      }
      if (String(sql).includes('max_zalo_accounts')) {
        return { rows: [{ max_zalo_accounts: 1 }] };
      }
      return { rows: [] };
    });
  });

  it('gọi findUsersWithEndedOverageGrace và reconcile đúng user đó (khoá phần vượt)', async () => {
    mockFindExpiredUsers.mockResolvedValueOnce([]);
    mockFindUsersWithExpiredStructuralGrants.mockResolvedValueOnce([]);
    mockFindUsersWithLocks.mockResolvedValueOnce([]);
    mockFindUsersWithEndedOverageGrace.mockResolvedValueOnce([{ id: 555 }]);
    mockCountInUse.mockImplementation(async (_uid, key) => (key === 'zalo_accounts' ? 2 : 0));
    mockCountValid.mockResolvedValue(0);
    mockListUnlocked.mockImplementation(async (_uid, key) => (key === 'zalo_accounts' ? [10, 20] : []));

    const results = await reconcileAllDueUsers(mockQueryable);

    expect(mockFindUsersWithEndedOverageGrace).toHaveBeenCalledWith(mockQueryable);
    expect(results).toHaveLength(1);
    expect(results[0].userId).toBe(555);
    expect(results[0].locked).toEqual([{ resourceKey: 'zalo_accounts', resourceId: 10 }]);
  });

  it('user hết ân hạn nhưng không vượt (đã tự xoá bớt) → không có trong kết quả', async () => {
    mockFindExpiredUsers.mockResolvedValueOnce([]);
    mockFindUsersWithExpiredStructuralGrants.mockResolvedValueOnce([]);
    mockFindUsersWithLocks.mockResolvedValueOnce([]);
    mockFindUsersWithEndedOverageGrace.mockResolvedValueOnce([{ id: 556 }]);
    // running (inUse - lockedCount) = 0 = effective (1) không kích hoạt cả hai nhánh khoá/mở khoá —
    // reset đủ mọi mock chạm tới trong vòng lặp resourceKey để không dính giá trị còn sót từ test
    // khác trong cùng file (đã dính đúng bẫy này ở lần chạy đầu: mockListLocked rò rỉ từ test
    // "unlocks most-recently-locked" làm ca này tưởng có unlock dù không cấu hình).
    mockSumActive.mockResolvedValue(0);
    mockCountInUse.mockResolvedValue(0);
    mockCountValid.mockResolvedValue(0);
    mockListUnlocked.mockResolvedValue([]);
    mockListLocked.mockResolvedValue([]);

    const results = await reconcileAllDueUsers(mockQueryable);

    expect(results).toHaveLength(0);
  });
});

describe('computeOverage — cùng công thức với reconcile: vượt = (đang dùng − đang khoá) − trần', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSumActive.mockResolvedValue(0);
    // max_employees: null = không giới hạn; max_chatbots: 3 = đúng bằng số đang dùng
    mockGetPlan.mockResolvedValue({ max_chatbots: 3, max_employees: null });
    mockCountInUse.mockImplementation(async (_userId, key) => ({ zalo_accounts: 4, chatbots: 3, employees: 10 }[key] || 0));
    mockCountValid.mockImplementation(async (_userId, key) => (key === 'zalo_accounts' ? 1 : 0));
    mockQueryable.query.mockImplementation(async (sql) => {
      if (String(sql).includes('max_zalo_accounts')) return { rows: [{ max_zalo_accounts: 1 }] };
      if (String(sql).includes('max_email_accounts')) return { rows: [{ max_email_accounts: 1 }] };
      if (String(sql).includes('max_landing_pages')) return { rows: [{ max_landing_pages: 1 }] };
      return { rows: [] };
    });
  });

  it('4 Zalo, 1 đã khoá, trần 1 → vượt 2 (trừ phần đã khoá); chatbot đúng trần và nhân viên không giới hạn → không vượt', async () => {
    const result = await computeOverage(7, mockQueryable);

    expect(result).toEqual([{ resourceKey: 'zalo_accounts', over: 2 }]);
    expect(mockInsertLock).not.toHaveBeenCalled();
    expect(mockDeleteLock).not.toHaveBeenCalled();
  });

  it('slot mua thêm còn hạn được cộng vào trần → hết vượt', async () => {
    mockSumActive.mockImplementation(async (_userId, key) => (key === 'zalo_accounts' ? 2 : 0));

    expect(await computeOverage(7, mockQueryable)).toEqual([]);
  });
});

describe('buildOverageGraceNotice — PR-2 mục 7.1 Việc B (dùng chung với thư hạ gói)', () => {
  it('liệt kê đúng theo resourceKey, mốc giờ VN đúng định dạng, đủ 2 link', () => {
    const html = buildOverageGraceNotice({
      overages: [{ resourceKey: 'zalo_accounts', over: 2 }, { resourceKey: 'chatbots', over: 1 }],
      graceUntil: new Date('2026-10-04T01:00:00Z'), // 08:00 giờ VN 04/10/2026
      frontendUrl: 'https://app.example.com',
    });

    expect(html).toContain('Hạn mức hiện tại cho phép');
    expect(html).toContain('vượt <strong>2 tài khoản Zalo, 1 chatbot</strong>');
    expect(html).toContain('04/10/2026');
    expect(html).toContain('08:00');
    expect(html).toContain('https://app.example.com/app/billing?tab=locks');
    expect(html).toContain('https://app.example.com/app/topup');
  });

  it('overages rỗng → chuỗi rỗng (không có đoạn cảnh báo)', () => {
    expect(buildOverageGraceNotice({ overages: [], graceUntil: new Date(), frontendUrl: 'https://x.com' })).toBe('');
  });
});

describe('startGraceForUnlockedOverage — PR-2 mục 7.1 Việc A (cấp ân hạn cho mọi đường làm trần giảm mà không qua lệnh hẹn)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendSystemEmail.mockResolvedValue({ messageId: 'x' });
    mockGetPlan.mockResolvedValue(null); // chatbots/employees: không có gói -> ceiling 0, không vượt qua nhánh này
    mockSumActive.mockResolvedValue(0);
    mockCountValid.mockResolvedValue(0);
    mockQueryable.query.mockImplementation(async (sql) => {
      if (String(sql).includes('UPDATE users SET overage_grace_until')) {
        return {
          rows: [{
            overage_grace_until: new Date('2026-10-04T01:00:00Z'),
            email: 'khach@example.com',
            full_name: '<b>Khach</b>',
          }],
        };
      }
      if (String(sql).includes('overage_grace_until')) {
        return { rows: [{ overage_grace_until: null }] };
      }
      if (String(sql).includes('max_zalo_accounts')) {
        return { rows: [{ max_zalo_accounts: 1 }] };
      }
      return { rows: [] };
    });
  });

  it('có vượt hạn mức → UPDATE overage_grace_until + gửi đúng 1 thư, escape full_name', async () => {
    mockFindUsersEligibleForOverageGrace.mockResolvedValueOnce([{ id: 10 }]);
    mockCountInUse.mockImplementation(async (_uid, key) => (key === 'zalo_accounts' ? 2 : 0));

    const result = await startGraceForUnlockedOverage(mockQueryable);

    expect(result).toEqual({ graceStarted: 1, emailed: 1 });
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
    const [{ to, subject, html }] = mockSendSystemEmail.mock.calls[0];
    expect(to).toBe('khach@example.com');
    expect(subject).toBe('[Founder AI] Tài khoản đang dùng vượt hạn mức gói hiện tại');
    expect(html).toContain('&lt;b&gt;Khach&lt;/b&gt;');
    expect(html).not.toContain('<b>Khach</b>');
    expect(html).toContain('vượt <strong>1 tài khoản Zalo</strong>');
  });

  it('không vượt (computeOverage rỗng) → KHÔNG UPDATE overage_grace_until, không gửi thư', async () => {
    mockFindUsersEligibleForOverageGrace.mockResolvedValueOnce([{ id: 11 }]);
    mockCountInUse.mockResolvedValue(0);

    const result = await startGraceForUnlockedOverage(mockQueryable);

    expect(result).toEqual({ graceStarted: 0, emailed: 0 });
    expect(mockSendSystemEmail).not.toHaveBeenCalled();
    const updateCalls = mockQueryable.query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE users SET overage_grace_until'));
    expect(updateCalls).toHaveLength(0);
  });

  it('user A lỗi (computeOverage ném lỗi) không chặn user B', async () => {
    mockFindUsersEligibleForOverageGrace.mockResolvedValueOnce([{ id: 20 }, { id: 21 }]);
    mockCountInUse.mockImplementation(async (userId, key) => {
      if (userId === 20) throw new Error('DB timeout');
      return key === 'zalo_accounts' ? 2 : 0;
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await startGraceForUnlockedOverage(mockQueryable);

    expect(result).toEqual({ graceStarted: 1, emailed: 1 });
    expect(mockSendSystemEmail).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('user 20'), expect.any(String));
  });
});

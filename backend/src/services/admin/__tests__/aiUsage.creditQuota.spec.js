import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSafeQuery = jest.fn();
const mockListCreditCustomers = jest.fn();
const mockGetUsageInRange = jest.fn();
const mockGetBillingCycle = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/aiUsage.repository.js', () => ({
  default: { safeQuery: mockSafeQuery, listCreditCustomers: mockListCreditCustomers },
}));
jest.unstable_mockModule('../../../repositories/payment/usageTracking.repository.js', () => ({
  default: { getUsageInRange: mockGetUsageInRange },
}));
jest.unstable_mockModule('../../../utils/billingCycle.util.js', () => ({
  getBillingCycle: mockGetBillingCycle,
}));

const { getAiUsageOverview, summarizeCreditUsage } = await import('../aiUsage.service.js');

const isPlanQuery = (sql) => sql.includes('COUNT(DISTINCT ul.id_user)::int AS user_count');
const isP90TokenQuery = (sql) => sql.includes('p90_user_tokens');

const PLAN_BASIC = {
  plan_id: 1, plan_code: 'basic', plan_name: 'Basic', ai_credits_per_period: 100,
};

const customer = (userId, plan = PLAN_BASIC) => ({ user_id: String(userId), ...plan });

const CYCLE_START = new Date('2026-09-10T00:00:00.000Z');
const CYCLE_END = new Date('2026-10-10T00:00:00.000Z');

/**
 * customers: [{ user_id, ...plan }]; usedByUser: { [userId]: đã dùng trong kỳ hiện tại (kết quả của getUsageInRange) }.
 * planRows/p90Rows: hàng token (giữ nguyên cách cũ, để chứng minh phần token/chi phí không bị đụng).
 */
const mockDb = ({
  customers = [],
  usedByUser = {},
  planRows = [],
  p90Rows = [],
  // hasPlan=false nhưng VẪN có cửa sổ kỳ: không có ở getBillingCycle thật, dùng để ghim riêng chốt hasPlan.
  noPlanUserIds = [],
  // hasPlan=true nhưng không dựng được cửa sổ kỳ: ghim riêng chốt cycleStart.
  noCycleUserIds = [],
} = {}) => {
  mockSafeQuery.mockImplementation(async (sql) => {
    if (isP90TokenQuery(sql)) return p90Rows;
    if (isPlanQuery(sql)) return planRows;
    return [];
  });
  mockListCreditCustomers.mockResolvedValue(customers);
  mockGetBillingCycle.mockImplementation(async (userId) => {
    const id = Number(userId);
    if (noPlanUserIds.includes(id)) {
      return { hasPlan: false, billingUserId: id, cycleStart: CYCLE_START, cycleEnd: CYCLE_END };
    }
    if (noCycleUserIds.includes(id)) {
      return { hasPlan: true, billingUserId: id, cycleStart: null, cycleEnd: null };
    }
    return { hasPlan: true, billingUserId: id, cycleStart: CYCLE_START, cycleEnd: CYCLE_END };
  });
  mockGetUsageInRange.mockImplementation(async (userId) => usedByUser[Number(userId)] ?? 0);
};

describe('summarizeCreditUsage - thong ke luot AI cua mot goi', () => {
  it('p90 noi suy tuyen tinh nhu percentile_cont cua Postgres: [10,50,90] -> 82', () => {
    expect(summarizeCreditUsage([90, 10, 50], 100)).toEqual({
      creditUserCount: 3,
      totalCredits: 150,
      p90UserCredits: 82,
      usersNearLimit: 1,
      quotaUsagePctAtP90: 82,
    });
  });

  it('cac moc khac: 1 khach -> chinh gia tri do; 4 khach [1,2,3,4] -> 3.7', () => {
    expect(summarizeCreditUsage([7], 100).p90UserCredits).toBe(7);
    expect(summarizeCreditUsage([4, 1, 3, 2], 100).p90UserCredits).toBe(3.7);
  });

  it('khach da dung 0 khong nam trong mau (khong keo p90 xuong, khong tinh vao creditUserCount)', () => {
    const withZeros = summarizeCreditUsage([0, 0, 0, 10, 50, 90], 100);
    expect(withZeros.creditUserCount).toBe(3);
    expect(withZeros.p90UserCredits).toBe(82);
  });

  it('dung 80% hạn mức thi tinh la gan tran, 79% thi khong', () => {
    expect(summarizeCreditUsage([80], 100).usersNearLimit).toBe(1);
    expect(summarizeCreditUsage([79], 100).usersNearLimit).toBe(0);
    // gói 3 lượt: 80% = 2.4 → 3 lượt mới đạt, 2 lượt chưa (không được lệch vì số thực)
    expect(summarizeCreditUsage([3], 3).usersNearLimit).toBe(1);
    expect(summarizeCreditUsage([2], 3).usersNearLimit).toBe(0);
  });

  it('da dung vuot han muc van tinh la gan tran, pct co the > 100', () => {
    const over = summarizeCreditUsage([150], 100);
    expect(over.usersNearLimit).toBe(1);
    expect(over.quotaUsagePctAtP90).toBe(150);
  });

  it('goi khong gioi han (null hoac <= 0): pct = null, usersNearLimit = 0', () => {
    for (const quota of [null, 0, -1]) {
      const stats = summarizeCreditUsage([500, 900], quota);
      expect(stats.quotaUsagePctAtP90).toBeNull();
      expect(stats.usersNearLimit).toBe(0);
      expect(stats.totalCredits).toBe(1400);
    }
  });

  it('khong co khach nao: toan so 0, pct = 0 khi goi co han muc', () => {
    expect(summarizeCreditUsage([], 300)).toEqual({
      creditUserCount: 0, totalCredits: 0, p90UserCredits: 0, usersNearLimit: 0, quotaUsagePctAtP90: 0,
    });
    expect(summarizeCreditUsage(undefined, null).quotaUsagePctAtP90).toBeNull();
  });
});

describe('getAiUsageOverview - luot AI da dung trong KY HIEN TAI cua tung khach', () => {
  beforeEach(() => {
    mockSafeQuery.mockReset();
    mockListCreditCustomers.mockReset();
    mockGetUsageInRange.mockReset();
    mockGetBillingCycle.mockReset();
  });

  it('3 khach cung goi han muc 100, da dung 10/50/90 -> p90 = 82, % = 82, usersNearLimit = 1', async () => {
    mockDb({ customers: [customer(11), customer(12), customer(13)], usedByUser: { 11: 10, 12: 50, 13: 90 } });
    const { byPlan } = await getAiUsageOverview({ range: '30d' });
    expect(byPlan).toHaveLength(1);
    expect(byPlan[0]).toMatchObject({
      planCode: 'basic',
      aiCreditsPerPeriod: 100,
      creditUserCount: 3,
      totalCredits: 150,
      p90UserCredits: 82,
      quotaUsagePctAtP90: 82,
      usersNearLimit: 1,
    });
  });

  it('bo loc "Thang nay" hay "30 ngay qua" KHONG doi cac so luot AI (chi token/chi phi theo bo loc)', async () => {
    const setup = () => mockDb({
      customers: [customer(11), customer(12), customer(13)],
      usedByUser: { 11: 10, 12: 50, 13: 90 },
    });
    setup();
    const month = (await getAiUsageOverview({ range: 'month' })).byPlan[0];
    const monthSql = mockSafeQuery.mock.calls.map(([sql]) => sql);
    mockSafeQuery.mockClear();
    setup();
    const last30 = (await getAiUsageOverview({ range: '30d' })).byPlan[0];
    const last30Sql = mockSafeQuery.mock.calls.map(([sql]) => sql);
    for (const field of ['creditUserCount', 'totalCredits', 'p90UserCredits', 'quotaUsagePctAtP90', 'usersNearLimit']) {
      expect(month[field]).toBe(last30[field]);
    }
    // Tập khách luôn tra theo 31 ngày, KHÔNG theo bộ lọc.
    expect(mockListCreditCustomers.mock.calls.map(([arg]) => arg.lookbackDays)).toEqual([31, 31]);
    // Còn các truy vấn token dùng đúng mốc của bộ lọc được chọn (mốc nằm trong SQL, giờ VN).
    expect(monthSql.filter((sql) => sql.includes("date_trunc('month'")).length).toBeGreaterThan(0);
    expect(monthSql.some((sql) => sql.includes("INTERVAL '29 days'"))).toBe(false);
    expect(last30Sql.filter((sql) => sql.includes("INTERVAL '29 days'")).length).toBeGreaterThan(0);
    expect(last30Sql.some((sql) => sql.includes("date_trunc('month'"))).toBe(false);
  });

  it('"da dung" lay tu CUNG ham cong chan: getBillingCycle(khach, chinh khach lam chu) + getUsageInRange(khach, ai_credit, dau ky, bay gio)', async () => {
    mockDb({ customers: [customer(21)], usedByUser: { 21: 5 } });
    const before = Date.now();
    await getAiUsageOverview();
    const after = Date.now();

    expect(mockGetBillingCycle).toHaveBeenCalledTimes(1);
    expect(mockGetBillingCycle).toHaveBeenCalledWith(21, { ownerContextId: 21 });
    expect(mockGetUsageInRange).toHaveBeenCalledTimes(1);
    const [userId, resource, from, to] = mockGetUsageInRange.mock.calls[0];
    expect(userId).toBe(21);
    expect(resource).toBe('ai_credit');
    expect(from).toBe(CYCLE_START); // đầu KỲ của khách, không phải đầu cửa sổ N ngày
    expect(to.getTime()).toBeGreaterThanOrEqual(before);
    expect(to.getTime()).toBeLessThanOrEqual(after);
  });

  it('khach khong co goi (hasPlan = false) hoac khong dung duoc ky bi bo qua, khong goi getUsageInRange cho ho', async () => {
    mockDb({
      customers: [customer(31), customer(32), customer(33)],
      usedByUser: { 31: 40, 32: 999, 33: 888 },
      noPlanUserIds: [32],
      noCycleUserIds: [33],
    });
    const { byPlan } = await getAiUsageOverview();
    expect(mockGetUsageInRange).toHaveBeenCalledTimes(1);
    expect(mockGetUsageInRange.mock.calls[0][0]).toBe(31);
    expect(byPlan[0]).toMatchObject({ creditUserCount: 1, totalCredits: 40 });
  });

  it('khach co dong credit trong 31 ngay nhung da dung 0 trong ky hien tai: khong tinh vao mau va khong tao dong goi rong', async () => {
    const proPlan = {
      plan_id: 2, plan_code: 'pro', plan_name: 'Pro', ai_credits_per_period: 1000,
    };
    mockDb({
      customers: [customer(41), customer(42, proPlan)],
      usedByUser: { 41: 20, 42: 0 },
    });
    const { byPlan } = await getAiUsageOverview();
    expect(byPlan.map((plan) => plan.planCode)).toEqual(['basic']);
    expect(byPlan[0].creditUserCount).toBe(1);
  });

  it('goi khong gioi han -> pct null, usersNearLimit 0, van co totalCredits', async () => {
    const enterprise = {
      plan_id: 3, plan_code: 'ent', plan_name: 'Enterprise', ai_credits_per_period: null,
    };
    mockDb({ customers: [customer(51, enterprise), customer(52, enterprise)], usedByUser: { 51: 300, 52: 700 } });
    const { byPlan } = await getAiUsageOverview();
    expect(byPlan[0]).toMatchObject({
      aiCreditsPerPeriod: null,
      creditUserCount: 2,
      totalCredits: 1000,
      quotaUsagePctAtP90: null,
      usersNearLimit: 0,
    });
  });

  it('goi co token nhung khong ai dung credit trong ky van co trong byPlan, giu han muc, credit = 0', async () => {
    mockDb({
      planRows: [{
        plan_id: 3, plan_code: 'starter', plan_name: 'Starter', ai_credits_per_period: 300,
        model: 'm', user_count: 1, total_tokens: 1000, prompt_tokens: 600, output_tokens: 400,
      }],
    });
    const { byPlan } = await getAiUsageOverview();
    expect(byPlan).toHaveLength(1);
    expect(byPlan[0]).toMatchObject({
      planCode: 'starter',
      aiCreditsPerPeriod: 300,
      p90UserCredits: 0,
      quotaUsagePctAtP90: 0,
      usersNearLimit: 0,
      creditUserCount: 0,
    });
  });

  it('goi co credit nhung khong co dong token van hien', async () => {
    const pro = {
      plan_id: 4, plan_code: 'pro', plan_name: 'Pro', ai_credits_per_period: 1000,
    };
    mockDb({
      customers: [customer(61, pro), customer(62, pro), customer(63, pro)],
      usedByUser: { 61: 10, 62: 30, 63: 50 },
    });
    const { byPlan } = await getAiUsageOverview();
    expect(byPlan).toHaveLength(1);
    expect(byPlan[0]).toMatchObject({
      planCode: 'pro', totalTokens: 0, userCount: 0, totalCredits: 90, p90UserCredits: 46, quotaUsagePctAtP90: 4.6,
    });
  });

  it('cot token/chi phi giu nguyen: userCount cu (quan the co dong token) khong bi doi nghia', async () => {
    mockDb({
      planRows: [{
        plan_id: 1, plan_code: 'basic', plan_name: 'Basic', ai_credits_per_period: 100,
        model: 'gemini-2.5-flash', user_count: 10, total_tokens: 5000000, prompt_tokens: 4000000, output_tokens: 1000000,
      }],
      p90Rows: [{ plan_id: 1, plan_code: 'basic', user_count: 10, p90_user_tokens: 900000 }],
      customers: [customer(71)],
      usedByUser: { 71: 20 },
    });
    const { byPlan } = await getAiUsageOverview();
    expect(byPlan).toHaveLength(1);
    expect(byPlan[0]).toMatchObject({
      userCount: 10, // token
      creditUserCount: 1, // lượt AI
      totalTokens: 5000000,
      p90UserTokens: 900000,
      totalCredits: 20,
    });
  });

  it('khong co khach nao co luot AI: khong loi, byPlan chi con cac goi co token', async () => {
    mockDb({ customers: [] });
    const { byPlan } = await getAiUsageOverview();
    expect(byPlan).toEqual([]);
    expect(mockGetBillingCycle).not.toHaveBeenCalled();
  });

  it('tra ky/da dung song song co gioi han: toi da 8 khach cung luc (khong bung 20 truy van mot luot)', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => 100 + i);
    mockDb({ customers: ids.map((id) => customer(id)), usedByUser: Object.fromEntries(ids.map((id) => [id, 1])) });
    let inFlight = 0;
    let maxInFlight = 0;
    mockGetBillingCycle.mockImplementation(async (userId) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { hasPlan: true, billingUserId: Number(userId), cycleStart: CYCLE_START, cycleEnd: CYCLE_END };
    });
    const { byPlan } = await getAiUsageOverview();
    expect(byPlan[0].creditUserCount).toBe(20);
    expect(maxInFlight).toBe(8);
  });

  it('loi khi tra mot khach lan ra ngoai (khong am tham bo khach roi bao so thieu)', async () => {
    mockDb({ customers: [customer(81), customer(82)], usedByUser: { 81: 1, 82: 1 } });
    mockGetUsageInRange.mockRejectedValueOnce(new Error('db down'));
    await expect(getAiUsageOverview()).rejects.toThrow('db down');
  });
});

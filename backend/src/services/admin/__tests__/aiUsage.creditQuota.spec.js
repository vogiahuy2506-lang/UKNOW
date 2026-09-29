import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSafeQuery = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/aiUsage.repository.js', () => ({
  default: { safeQuery: mockSafeQuery },
}));

const { getAiUsageOverview } = await import('../aiUsage.service.js');

const isCreditQuery = (sql) => sql.includes("resource_type = 'ai_credit'");
const isPlanQuery = (sql) => sql.includes('COUNT(DISTINCT ul.id_user)::int AS user_count');
const isP90TokenQuery = (sql) => sql.includes('p90_user_tokens');

const mockDb = ({ planRows = [], p90Rows = [], creditRows = [] }) => {
  mockSafeQuery.mockImplementation(async (sql) => {
    if (isCreditQuery(sql)) return creditRows;
    if (isP90TokenQuery(sql)) return p90Rows;
    if (isPlanQuery(sql)) return planRows;
    return [];
  });
};

describe('getAiUsageOverview - han muc theo luot AI (credit)', () => {
  beforeEach(() => {
    mockSafeQuery.mockReset();
  });

  it('tinh quotaUsagePctAtP90 theo credit: p90 9.1 / 800 luot ~ 1.1%', async () => {
    mockDb({
      planRows: [{
        plan_id: 1, plan_code: 'basic', plan_name: 'Basic', ai_credits_per_period: 800,
        model: 'gemini-2.5-flash', user_count: 10, total_tokens: 5000000, prompt_tokens: 4000000, output_tokens: 1000000,
      }],
      // p90 token lon: neu service tinh pct theo token thi so se khac han
      p90Rows: [{ plan_id: 1, plan_code: 'basic', user_count: 10, p90_user_tokens: 900000 }],
      creditRows: [{
        plan_id: 1, plan_code: 'basic', plan_name: 'Basic', ai_credits_per_period: 800,
        user_count: 10, total_credits: 55, p90_user_credits: '9.1',
      }],
    });
    const { byPlan } = await getAiUsageOverview({ windowDays: 30 });
    expect(byPlan).toHaveLength(1);
    expect(byPlan[0].aiCreditsPerPeriod).toBe(800);
    expect(byPlan[0].p90UserCredits).toBe(9.1);
    expect(byPlan[0].totalCredits).toBe(55);
    expect(byPlan[0].quotaUsagePctAtP90).toBe(1.1);
    // cot token phan tich chi phi van con
    expect(byPlan[0].totalTokens).toBe(5000000);
    expect(byPlan[0].p90UserTokens).toBe(900000);
  });

  it('goi khong gioi han credit -> pct null', async () => {
    mockDb({
      planRows: [{
        plan_id: 2, plan_code: 'ent', plan_name: 'Enterprise', ai_credits_per_period: null,
        model: 'm', user_count: 2, total_tokens: 100, prompt_tokens: 60, output_tokens: 40,
      }],
      creditRows: [{
        plan_id: 2, plan_code: 'ent', plan_name: 'Enterprise', ai_credits_per_period: null,
        user_count: 2, total_credits: 20, p90_user_credits: '12.0',
      }],
    });
    const { byPlan } = await getAiUsageOverview();
    expect(byPlan[0].aiCreditsPerPeriod).toBeNull();
    expect(byPlan[0].quotaUsagePctAtP90).toBeNull();
  });

  it('goi co token nhung khong ai dung credit van co trong byPlan, giu han muc credit cua goi', async () => {
    mockDb({
      planRows: [{
        plan_id: 3, plan_code: 'starter', plan_name: 'Starter', ai_credits_per_period: 300,
        model: 'm', user_count: 1, total_tokens: 1000, prompt_tokens: 600, output_tokens: 400,
      }],
      creditRows: [],
    });
    const { byPlan } = await getAiUsageOverview();
    expect(byPlan).toHaveLength(1);
    expect(byPlan[0].planCode).toBe('starter');
    expect(byPlan[0].aiCreditsPerPeriod).toBe(300);
    expect(byPlan[0].p90UserCredits).toBe(0);
    expect(byPlan[0].quotaUsagePctAtP90).toBe(0);
  });

  it('goi co credit nhung khong co dong token van hien', async () => {
    mockDb({
      planRows: [],
      creditRows: [{
        plan_id: 4, plan_code: 'pro', plan_name: 'Pro', ai_credits_per_period: 1000,
        user_count: 3, total_credits: 90, p90_user_credits: '50.0',
      }],
    });
    const { byPlan } = await getAiUsageOverview();
    expect(byPlan).toHaveLength(1);
    expect(byPlan[0]).toMatchObject({
      planCode: 'pro', totalTokens: 0, totalCredits: 90, p90UserCredits: 50, quotaUsagePctAtP90: 5,
    });
  });

  // DB giả trả sẵn kết quả nên không tự kiểm được điều kiện lọc — ghim câu SQL: chỉ đếm lượt AI (ai_credit,
  // delta > 0). Dòng ai_credit delta ÂM (mua marketplace, usageTracking.repository) không phải lượt dùng.
  it('truy van credit chi lay ai_credit va delta > 0 (loai dong am cua marketplace)', async () => {
    mockDb({});
    await getAiUsageOverview();
    const creditSql = mockSafeQuery.mock.calls.map(([sql]) => String(sql)).find(isCreditQuery);
    expect(creditSql).toBeDefined();
    expect(creditSql).toMatch(/resource_type = 'ai_credit'/);
    expect(creditSql).toMatch(/ul\.delta > 0/);
  });
});

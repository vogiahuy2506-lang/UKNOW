/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-8 - trang Chi phi AI admin: bon so, bang theo tinh nang, co gia, cot
 * "neu dung het han muc". Chi phi cong tay nam ngay trong tung ca (khong import tu ma dang test).
 *
 * Mock toan bo DB nen cac ca nay chi ghim PHEP TINH va hinh dang tra ve; phep loc thoi gian + tong hop SQL that duoc
 * kiem trong tests/integration/aiUsageCost.test.js.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

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

const {
  getAiUsageOverview,
  getMeasuredCostByModel,
  normalizeUsageRange,
  USAGE_RANGE_START_SQL,
} = await import('../aiUsage.service.js');

const isMetaQuery = (sql) => sql.includes('AS start_day');
const isFeatureModelQuery = (sql) => sql.includes('AS call_count');
const isUserFeatureQuery = (sql) => sql.includes('SELECT DISTINCT');
const isPlanQuery = (sql) => sql.includes('COUNT(DISTINCT ul.id_user)::int AS user_count');
const isP90Query = (sql) => sql.includes('p90_user_tokens');
const isTopUserQuery = (sql) => sql.includes('AS email');
const isTimelineQuery = (sql) => sql.includes('AS bucket');

const mockDb = ({
  meta = { start_day: '2026-09-01', end_day: '2026-09-30' },
  featureModelRows = [],
  userFeatureRows = [],
  planRows = [],
  timelineRows = [],
  customers = [],
  usedByUser = {},
} = {}) => {
  mockSafeQuery.mockImplementation(async (sql) => {
    if (isMetaQuery(sql)) return [meta];
    if (isFeatureModelQuery(sql)) return featureModelRows;
    if (isUserFeatureQuery(sql)) return userFeatureRows;
    if (isP90Query(sql)) return [];
    if (isPlanQuery(sql)) return planRows;
    if (isTopUserQuery(sql)) return [];
    if (isTimelineQuery(sql)) return timelineRows;
    return [];
  });
  mockListCreditCustomers.mockResolvedValue(customers);
  mockGetBillingCycle.mockImplementation(async (userId) => ({
    hasPlan: true,
    billingUserId: Number(userId),
    cycleStart: new Date('2026-09-10T00:00:00.000Z'),
    cycleEnd: new Date('2026-10-10T00:00:00.000Z'),
  }));
  mockGetUsageInRange.mockImplementation(async (userId) => usedByUser[Number(userId)] ?? 0);
};

const row = (feature, model, calls, prompt, output, total, kind = '') => ({
  feature,
  kind,
  model,
  call_count: calls,
  prompt_tokens: prompt,
  output_tokens: output,
  total_tokens: total,
});

/**
 * Du lieu chinh (gia mac dinh, 1 USD = 24.000d), cong tay:
 *   chatbot_reply  3.5-flash  10 luot: vao 10tr, ra 1tr, tong 12tr -> 10 x 1,5 + max(1tr, 2tr) = 2tr x 9 = 15 + 18 = 33 USD
 *   smart_chat     3.5-flash   5 luot: vao 2tr, ra 0,1tr, tong 2,2tr -> 2 x 1,5 + 0,2 x 9 = 3 + 1,8 = 4,8 USD
 *   help_answer    3.5-flash   5 luot: vao 90k, ra 5k, tong 100k -> 0,135 + 0,01 x 9 = 0,225 USD
 *   embedding_rag_query embedding-001 100 dong: vao 4tr, ra 0, tong 4tr -> 4 x 0,15 = 0,6 USD
 * Tong = 33 + 4,8 + 0,225 + 0,6 = 38,625 USD = 927.000d.
 * Luot goi = 10 + 5 + 5 = 20 (KHONG ke 100 dong embedding). Chi phi moi luot = 38,625 / 20 = 1,93125 USD = 46.350d.
 * Khach dang dung AI: chi chu 1 (chatbot, smart_chat) va 2 (smart_chat) -> 2; chu 3 chi co embedding, chu 4 chi co
 * tro giup -> khong tinh. Ca 4 deu la "user co dong token" -> userCount 4.
 */
const MAIN_ROWS = [
  row('chatbot_reply', 'gemini-3.5-flash', 10, 10_000_000, 1_000_000, 12_000_000),
  row('smart_chat', 'gemini-3.5-flash', 5, 2_000_000, 100_000, 2_200_000),
  row('help_answer', 'gemini-3.5-flash', 5, 90_000, 5_000, 100_000),
  row('embedding_rag_query', 'gemini-embedding-001', 100, 4_000_000, 0, 4_000_000, 'embedding'),
];
const MAIN_USER_ROWS = [
  { id_user: '1', feature: 'chatbot_reply', kind: '' },
  { id_user: '1', feature: 'smart_chat', kind: '' },
  { id_user: '2', feature: 'smart_chat', kind: '' },
  { id_user: '3', feature: 'embedding_rag_query', kind: 'embedding' },
  { id_user: '4', feature: 'help_answer', kind: '' },
];

describe('getAiUsageOverview - bon so tren cung', () => {
  const originalRate = process.env.USD_VND_RATE;
  const originalPricing = process.env.AI_PRICING_JSON;

  beforeEach(() => {
    mockSafeQuery.mockReset();
    mockListCreditCustomers.mockReset();
    mockGetUsageInRange.mockReset();
    mockGetBillingCycle.mockReset();
    process.env.USD_VND_RATE = '24000';
    delete process.env.AI_PRICING_JSON;
  });

  afterEach(() => {
    if (originalRate === undefined) delete process.env.USD_VND_RATE;
    else process.env.USD_VND_RATE = originalRate;
    if (originalPricing === undefined) delete process.env.AI_PRICING_JSON;
    else process.env.AI_PRICING_JSON = originalPricing;
  });

  it('chi phi = 38,625 USD = 927.000d (gom token suy nghi + embedding); tra ve ty gia', async () => {
    mockDb({ featureModelRows: MAIN_ROWS, userFeatureRows: MAIN_USER_ROWS });
    const { summary, usdVndRate } = await getAiUsageOverview({ range: '30d' });
    expect(usdVndRate).toBe(24000);
    expect(summary.estimatedCostUsd).toBe(38.625);
    expect(summary.estimatedCostVnd).toBe(927000);
  });

  it('token suy nghi nam trong chi phi: bo phan (total - prompt) > output thi chi phi tut xuong', async () => {
    // Cung du lieu nhung khong co token suy nghi (total = prompt + output): chatbot 15 + 9 = 24, smart_chat 3 + 0,9 = 3,9,
    // help 0,135 + 0,045 = 0,18, embedding 0,6 -> 28,68 USD. Du lieu that (co suy nghi) phai LON HON.
    mockDb({
      featureModelRows: [
        row('chatbot_reply', 'gemini-3.5-flash', 10, 10_000_000, 1_000_000, 11_000_000),
        row('smart_chat', 'gemini-3.5-flash', 5, 2_000_000, 100_000, 2_100_000),
        row('help_answer', 'gemini-3.5-flash', 5, 90_000, 5_000, 95_000),
        row('embedding_rag_query', 'gemini-embedding-001', 100, 4_000_000, 0, 4_000_000, 'embedding'),
      ],
      userFeatureRows: MAIN_USER_ROWS,
    });
    const noThinking = (await getAiUsageOverview()).summary;
    expect(noThinking.estimatedCostUsd).toBe(28.68);
    expect(noThinking.thoughtsTokens).toBe(0);

    mockDb({ featureModelRows: MAIN_ROWS, userFeatureRows: MAIN_USER_ROWS });
    const withThinking = (await getAiUsageOverview()).summary;
    expect(withThinking.estimatedCostUsd).toBe(38.625);
    // 12tr + 2,2tr + 0,1tr + 4tr - (10tr + 2tr + 0,09tr + 4tr) - (1tr + 0,1tr + 0,005tr + 0)
    expect(withThinking.totalTokens).toBe(18_300_000);
    expect(withThinking.promptTokens).toBe(16_090_000);
    expect(withThinking.outputTokens).toBe(1_105_000);
    expect(withThinking.thoughtsTokens).toBe(1_105_000);
  });

  it('luot goi = 20, khong ke dong embedding; chi phi moi luot = chi phi / luot = 46.350d', async () => {
    mockDb({ featureModelRows: MAIN_ROWS, userFeatureRows: MAIN_USER_ROWS });
    const { summary } = await getAiUsageOverview();
    expect(summary.calls).toBe(20);
    expect(summary.costPerCallUsd).toBeCloseTo(1.93125, 3);
    expect(summary.costPerCallVnd).toBe(46350);
    // Khong co moi quan he "chi phi / dong log": logCount tinh ca 100 dong embedding
    expect(summary.logCount).toBe(120);
  });

  it('khach dang dung AI = 2: chu chi co embedding hoac chi co tro giup khong tinh', async () => {
    mockDb({ featureModelRows: MAIN_ROWS, userFeatureRows: MAIN_USER_ROWS });
    const { summary } = await getAiUsageOverview();
    expect(summary.customers).toBe(2);
    expect(summary.userCount).toBe(4);
  });

  it('khong co dong nao trong khoang: 0 luot, chi phi moi luot = null (khong chia cho 0), 0 khach', async () => {
    mockDb();
    const { summary, byFeature, pricingWarning } = await getAiUsageOverview();
    expect(summary).toMatchObject({
      estimatedCostVnd: 0, calls: 0, costPerCallVnd: null, costPerCallUsd: null, customers: 0,
    });
    expect(byFeature).toEqual([]);
    expect(pricingWarning).toBeNull();
  });
});

describe('getAiUsageOverview - bang theo tinh nang', () => {
  beforeEach(() => {
    mockSafeQuery.mockReset();
    mockListCreditCustomers.mockReset();
    process.env.USD_VND_RATE = '24000';
    delete process.env.AI_PRICING_JSON;
  });

  it('gom theo NHOM (ma -> nhom o aiFeatureCatalog), sap theo chi phi giam dan, kem chi phi moi luot', async () => {
    mockDb({ featureModelRows: MAIN_ROWS, userFeatureRows: MAIN_USER_ROWS });
    const { byFeature } = await getAiUsageOverview();
    expect(byFeature.map((item) => item.group)).toEqual(['chatbot', 'assistant', 'embedding', 'help']);

    const chatbot = byFeature[0];
    expect(chatbot).toMatchObject({
      group: 'chatbot',
      features: ['chatbot_reply'],
      calls: 10,
      estimatedCostUsd: 33,
      estimatedCostVnd: 792000,
      countsAsCall: true,
      costPerCallUsd: 3.3,
      costPerCallVnd: 79200,
    });
    expect(byFeature[1]).toMatchObject({
      group: 'assistant', calls: 5, estimatedCostVnd: 115200, costPerCallVnd: 23040,
    });
    expect(byFeature[3]).toMatchObject({ group: 'help', calls: 5, estimatedCostUsd: 0.225, costPerCallVnd: 1080 });
  });

  it('nap tai lieu (embedding): co chi phi nhung KHONG phai luot va khong co chi phi moi luot', async () => {
    mockDb({ featureModelRows: MAIN_ROWS, userFeatureRows: MAIN_USER_ROWS });
    const { byFeature } = await getAiUsageOverview();
    const embedding = byFeature.find((item) => item.group === 'embedding');
    expect(embedding).toMatchObject({
      countsAsCall: false,
      estimatedCostUsd: 0.6,
      estimatedCostVnd: 14400,
      costPerCallUsd: null,
      costPerCallVnd: null,
    });
  });

  it('hai ma cung nhom (chatbot_reply + kb_chat) cong don vao mot dong; ma la roi vao "other", khong mat chi phi', async () => {
    mockDb({
      featureModelRows: [
        row('chatbot_reply', 'gemini-2.5-flash', 2, 1_000_000, 100_000, 1_100_000),
        row('kb_chat', 'gemini-2.5-flash', 3, 1_000_000, 100_000, 1_100_000),
        row('tinh_nang_moi', 'gemini-2.5-flash', 1, 1_000_000, 100_000, 1_100_000),
        row('_unknown', 'gemini-2.5-flash', 1, 1_000_000, 100_000, 1_100_000),
      ],
    });
    const { byFeature, summary } = await getAiUsageOverview();
    const chatbot = byFeature.find((item) => item.group === 'chatbot');
    expect(chatbot.calls).toBe(5);
    expect(chatbot.features).toEqual(['chatbot_reply', 'kb_chat']);
    const other = byFeature.find((item) => item.group === 'other');
    expect(other.calls).toBe(2);
    expect(other.features).toEqual(['_unknown', 'tinh_nang_moi']);
    // tong cac dong bang tong KPI (cung nguon)
    const sumVnd = byFeature.reduce((total, item) => total + item.estimatedCostVnd, 0);
    expect(Math.abs(sumVnd - summary.estimatedCostVnd)).toBeLessThanOrEqual(byFeature.length);
  });
});

describe('getAiUsageOverview - co gia (model chua co gia bi tinh bang gia tam)', () => {
  beforeEach(() => {
    mockSafeQuery.mockReset();
    mockListCreditCustomers.mockReset();
    process.env.USD_VND_RATE = '24000';
    delete process.env.AI_PRICING_JSON;
  });

  it('3 model co gia niem yet (3.5-flash, 3.8-flash, embedding-001): KHONG co co gia', async () => {
    mockDb({
      featureModelRows: [
        row('chatbot_reply', 'gemini-3.5-flash', 1, 1_000_000, 100_000, 1_200_000),
        row('smart_chat', 'gemini-3.8-flash', 1, 1_000_000, 100_000, 1_200_000),
        row('embedding_kb_ingest', 'gemini-embedding-001', 1, 1_000_000, 0, 1_000_000, 'embedding'),
      ],
    });
    const { pricingWarning, byModel } = await getAiUsageOverview();
    expect(pricingWarning).toBeNull();
    expect(byModel.every((item) => item.priceConfigured)).toBe(true);
    // 3.5-flash: 1,5 + 0,2 x 9 = 3,3 USD; 3.8-flash: 0,75 + 0,2 x 3,75 = 1,5 USD; embedding: 0,15 USD
    expect(byModel.map((item) => [item.model, item.estimatedCostUsd])).toEqual([
      ['gemini-3.5-flash', 3.3],
      ['gemini-3.8-flash', 1.5],
      ['gemini-embedding-001', 0.15],
    ]);
  });

  it('model chua co gia -> co gia do: ty le chi phi tinh theo gia tam + danh sach model', async () => {
    // A: 3.5-flash 3,3 USD (co gia). B: gemini-9.9-flash rơi về _default 0,30/2,50: 0,6 + 0,4 x 2,5 = 1,6 USD.
    mockDb({
      featureModelRows: [
        row('chatbot_reply', 'gemini-3.5-flash', 1, 1_000_000, 100_000, 1_200_000),
        row('smart_chat', 'gemini-9.9-flash', 3, 2_000_000, 200_000, 2_400_000),
      ],
    });
    const { pricingWarning, byModel } = await getAiUsageOverview();
    // 1,6 / 4,9 = 32,65% -> 32,7
    expect(pricingWarning).toEqual({
      unpricedCostSharePct: 32.7,
      models: [{
        model: 'gemini-9.9-flash', calls: 3, estimatedCostUsd: 1.6, costSharePct: 32.7,
      }],
    });
    expect(byModel.find((item) => item.model === 'gemini-9.9-flash').priceConfigured).toBe(false);
    expect(byModel.find((item) => item.model === 'gemini-3.5-flash').priceConfigured).toBe(true);
  });

  it('dong cu khong ghi model (_unknown) cung bi co gia tam', async () => {
    mockDb({ featureModelRows: [row('chatbot_reply', '_unknown', 1, 1_000_000, 0, 1_000_000)] });
    const { pricingWarning } = await getAiUsageOverview();
    expect(pricingWarning.models.map((item) => item.model)).toEqual(['_unknown']);
    expect(pricingWarning.unpricedCostSharePct).toBe(100);
  });

  it('AI_PRICING_JSON dien gia cho model do thi het co gia', async () => {
    process.env.AI_PRICING_JSON = JSON.stringify({ 'gemini-9.9-flash': { input: 1, output: 1 } });
    mockDb({ featureModelRows: [row('smart_chat', 'gemini-9.9-flash', 1, 1_000_000, 0, 1_000_000)] });
    const { pricingWarning, summary } = await getAiUsageOverview();
    expect(pricingWarning).toBeNull();
    expect(summary.estimatedCostUsd).toBe(1);
  });
});

describe('getAiUsageOverview - cot "neu dung het han muc" theo goi', () => {
  beforeEach(() => {
    mockSafeQuery.mockReset();
    mockListCreditCustomers.mockReset();
    mockGetUsageInRange.mockReset();
    mockGetBillingCycle.mockReset();
    process.env.USD_VND_RATE = '24000';
    process.env.AI_PRICING_JSON = JSON.stringify({ 'test-model': { input: 1, output: 1 } });
  });

  afterEach(() => {
    delete process.env.AI_PRICING_JSON;
  });

  // test-model 1/1 USD: 4 luot, vao 2tr, ra 1tr, tong 3tr (khong suy nghi) -> 3 USD, moi luot 0,75 USD = 18.000d.
  const DATA_ROWS = [row('chatbot_reply', 'test-model', 4, 2_000_000, 1_000_000, 3_000_000)];
  const planCustomer = (userId, plan) => ({ user_id: String(userId), ...plan });
  const PLAN_A = {
    plan_id: 1, plan_code: 'a', plan_name: 'Goi A', ai_credits_per_period: 100, plan_price: '900000',
  };
  const PLAN_U = {
    plan_id: 2, plan_code: 'u', plan_name: 'Goi khong gioi han', ai_credits_per_period: null, plan_price: '5000000',
  };
  const PLAN_FREE = {
    plan_id: 3, plan_code: 'free', plan_name: 'Dung thu', ai_credits_per_period: 10, plan_price: '0',
  };

  it('chi phi neu dung het = han muc x chi phi moi luot; so voi gia goi (plans.price): 100 x 18.000 = 1.800.000d = 200% cua 900.000d', async () => {
    mockDb({
      featureModelRows: DATA_ROWS,
      customers: [planCustomer(11, PLAN_A)],
      usedByUser: { 11: 30 },
    });
    const { byPlan, summary } = await getAiUsageOverview();
    expect(summary.costPerCallVnd).toBe(18000);
    const planA = byPlan.find((plan) => plan.planCode === 'a');
    expect(planA).toMatchObject({
      aiCreditsPerPeriod: 100,
      planPriceVnd: 900000,
      fullQuotaCostVnd: 1800000,
      fullQuotaCostVsPricePct: 200,
    });
  });

  it('goi khong gioi han: khong co so; goi gia 0d: co chi phi nhung khong co ti le; goi lay gia tu dong token cung duoc', async () => {
    mockDb({
      featureModelRows: DATA_ROWS,
      planRows: [{
        plan_id: 1, plan_code: 'a', plan_name: 'Goi A', ai_credits_per_period: 100, plan_price: '900000',
        model: 'test-model', user_count: 1, total_tokens: 3_000_000, prompt_tokens: 2_000_000, output_tokens: 1_000_000,
      }],
      customers: [planCustomer(11, PLAN_A), planCustomer(12, PLAN_U), planCustomer(13, PLAN_FREE)],
      usedByUser: { 11: 30, 12: 500, 13: 4 },
    });
    const { byPlan } = await getAiUsageOverview();
    const byCode = Object.fromEntries(byPlan.map((plan) => [plan.planCode, plan]));
    // goi A den tu dong token (planRows): gia goi van co
    expect(byCode.a).toMatchObject({ planPriceVnd: 900000, fullQuotaCostVnd: 1800000, fullQuotaCostVsPricePct: 200 });
    // goi khong gioi han (chi co dong credit): khong tinh duoc "dung het"
    expect(byCode.u).toMatchObject({ planPriceVnd: 5000000, fullQuotaCostVnd: null, fullQuotaCostVsPricePct: null });
    // goi dung thu 0d: 10 x 18.000 = 180.000d, khong chia cho 0
    expect(byCode.free).toMatchObject({ planPriceVnd: 0, fullQuotaCostVnd: 180000, fullQuotaCostVsPricePct: null });
  });

  it('chua co luot goi nao trong khoang (khong biet chi phi moi luot): khong bia so cho cot nay', async () => {
    mockDb({ customers: [planCustomer(11, PLAN_A)], usedByUser: { 11: 30 } });
    const { byPlan } = await getAiUsageOverview();
    expect(byPlan[0]).toMatchObject({ aiCreditsPerPeriod: 100, fullQuotaCostVnd: null, fullQuotaCostVsPricePct: null });
  });

  it('goi ty le lay tu chi phi moi luot cua BO LOC dang chon (cung nguon voi KPI)', async () => {
    // Cung goi A nhung chi phi moi luot khac (4 luot -> 2 luot): 100 x 36.000 = 3.600.000d
    mockDb({
      featureModelRows: [row('chatbot_reply', 'test-model', 2, 2_000_000, 1_000_000, 3_000_000)],
      customers: [planCustomer(11, PLAN_A)],
      usedByUser: { 11: 30 },
    });
    const { byPlan, summary } = await getAiUsageOverview();
    expect(summary.costPerCallVnd).toBe(36000);
    expect(byPlan[0].fullQuotaCostVnd).toBe(3600000);
  });
});

describe('getAiUsageOverview - bo loc thoi gian tinh trong SQL theo gio Viet Nam', () => {
  beforeEach(() => {
    mockSafeQuery.mockReset();
    mockListCreditCustomers.mockReset();
    mockGetUsageInRange.mockReset();
    mockGetBillingCycle.mockReset();
  });

  const tokenQueries = () => mockSafeQuery.mock.calls.map(([sql]) => sql).filter((sql) => sql.includes('usage_logs'));

  it('"Thang nay": 00:00 ngay 1 gio VN, tinh bang date_trunc trong SQL - khong truyen moc tu JS', async () => {
    mockDb();
    const result = await getAiUsageOverview({ range: 'month' });
    expect(result.range).toBe('month');
    const sqls = tokenQueries();
    expect(sqls).toHaveLength(6); // tổng hợp, ai-dùng-gì, theo gói, top user, p90 token, biểu đồ
    const monthStart = "(date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')";
    expect(USAGE_RANGE_START_SQL.month).toBe(monthStart);
    for (const sql of sqls) {
      expect(sql).toContain(`created_at >= ${monthStart}`);
    }
    // Moc KHONG do JS tinh: moi truy van khong co tham so nao (khong "$1", khong Date/so truyen vao)
    for (const [sql, params] of mockSafeQuery.mock.calls) {
      expect(sql).not.toMatch(/\$\d/);
      expect(params).toEqual([]);
    }
  });

  it('"30 ngay qua": 00:00 cua ngay cach hom nay 29 ngay (gio VN) = du 30 ngay lich ke ca hom nay', async () => {
    mockDb();
    const result = await getAiUsageOverview({ range: '30d' });
    expect(result.range).toBe('30d');
    const last30Start = "((date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '29 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')";
    expect(USAGE_RANGE_START_SQL['30d']).toBe(last30Start);
    for (const sql of tokenQueries()) {
      expect(sql).toContain(`created_at >= ${last30Start}`);
    }
  });

  it('gia tri la / thieu -> "30 ngay qua"; cua so cu 7/90 ngay khong con', async () => {
    expect(normalizeUsageRange(undefined)).toBe('30d');
    expect(normalizeUsageRange('')).toBe('30d');
    expect(normalizeUsageRange('90')).toBe('30d');
    expect(normalizeUsageRange('7d')).toBe('30d');
    expect(normalizeUsageRange('month')).toBe('month');
    mockDb();
    expect((await getAiUsageOverview({ windowDays: 7 })).range).toBe('30d');
  });

  it('ngay bieu do lay tu SQL (gio VN), du ca ngay co 0 dong; khong phu thuoc mui gio cua Node', async () => {
    const originalTz = process.env.TZ;
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Ho_Chi_Minh', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        mockDb({
          meta: { start_day: '2026-09-29', end_day: '2026-10-02' },
          timelineRows: [
            { bucket: '2026-09-30', model: 'gemini-3.5-flash', prompt_tokens: 1_000_000, output_tokens: 100_000, total_tokens: 1_200_000 },
            { bucket: '2026-10-02', model: 'gemini-3.5-flash', prompt_tokens: 1_000_000, output_tokens: 0, total_tokens: 1_000_000 },
          ],
        });
        const { timeline, rangeStart, rangeEnd } = await getAiUsageOverview({ range: '30d' });
        expect(rangeStart).toBe('2026-09-29');
        expect(rangeEnd).toBe('2026-10-02');
        expect(timeline.map((day) => day.bucket)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
        // 30/09: 1,5 + 0,2 x 9 = 3,3 USD = 79.200d; 02/10: 1,5 USD = 36.000d (gom cả token suy nghi o ngay 30/09)
        expect(timeline.map((day) => day.estimatedCostVnd)).toEqual([0, 79200, 0, 36000]);
        expect(timeline[1].estimatedCostUsd).toBe(3.3);
      }
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it('meta khong tra ve duoc (loi/thieu) -> bieu do rong, khong ném', async () => {
    mockDb({ meta: { start_day: null, end_day: null } });
    const { timeline } = await getAiUsageOverview();
    expect(timeline).toEqual([]);
  });
});

describe('getMeasuredCostByModel - chi phi thuc do moi luot goi (trang Quan ly model AI)', () => {
  beforeEach(() => {
    mockSafeQuery.mockReset();
    process.env.USD_VND_RATE = '24000';
    delete process.env.AI_PRICING_JSON;
  });

  it('chi phi moi luot theo tung model, gom token suy nghi, KHONG ke dong embedding', async () => {
    mockSafeQuery.mockResolvedValue([
      // 3.5-flash: 4 luot, vao 4tr, ra 0,4tr, tong 4,8tr -> 6 + 0,8 x 9 = 13,2 USD -> 3,3 USD / luot = 79.200d
      row('chatbot_reply', 'gemini-3.5-flash', 3, 3_000_000, 300_000, 3_600_000),
      row('smart_chat', 'gemini-3.5-flash', 1, 1_000_000, 100_000, 1_200_000),
      // model chi chay embedding: khong co luot goi -> khong co khoa
      row('embedding_rag_query', 'gemini-embedding-001', 50, 5_000_000, 0, 5_000_000, 'embedding'),
    ]);
    const result = await getMeasuredCostByModel({ range: '30d' });
    expect(result.range).toBe('30d');
    expect(Object.keys(result.byModel)).toEqual(['gemini-3.5-flash']);
    expect(result.byModel['gemini-3.5-flash']).toEqual({
      calls: 4, costUsd: 13.2, costPerCallUsd: 3.3, costPerCallVnd: 79200,
    });
    // truy van dung bo loc 30 ngay o SQL, khong co tham so
    const [sql, params] = mockSafeQuery.mock.calls[0];
    expect(sql).toContain(`created_at >= ${USAGE_RANGE_START_SQL['30d']}`);
    expect(params).toEqual([]);
  });
});

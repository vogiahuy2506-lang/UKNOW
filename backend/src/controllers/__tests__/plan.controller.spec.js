import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPlanService = {
  getAllPlans: jest.fn(),
};

const mockCustomPlanService = {
  getCustomPlanPricingConfig: jest.fn(),
  quoteCustomPlan: jest.fn(),
  getMyCustomPlan: jest.fn(),
};

jest.unstable_mockModule('../../services/payment/plan.service.js', () => ({
  getAllPlans: mockPlanService.getAllPlans,
}));

jest.unstable_mockModule('../../services/payment/customPlan.service.js', () => ({
  getCustomPlanPricingConfig: mockCustomPlanService.getCustomPlanPricingConfig,
  quoteCustomPlan: mockCustomPlanService.quoteCustomPlan,
  getMyCustomPlan: mockCustomPlanService.getMyCustomPlan,
}));

const {
  getPlans,
  getCustomPlanConfig,
  quoteCustomPlan,
  getMyCustomPlan,
} = await import('../plan.controller.js');

const makeReqRes = (options = {}) => {
  const resHeaders = {};
  let statusCode = 200;
  let responseData = null;

  const req = {
    user: options.user || null,
    body: options.body || {},
    query: options.query || {},
  };

  const res = {
    setHeader: jest.fn((k, v) => {
      resHeaders[k.toLowerCase()] = v;
    }),
    status: jest.fn((code) => {
      statusCode = code;
      return res;
    }),
    json: jest.fn((data) => {
      responseData = data;
      return res;
    }),
    get statusCode() { return statusCode; },
    get responseData() { return responseData; },
    get resHeaders() { return resHeaders; },
  };

  return { req, res };
};

describe('plan.controller HTTP Caching policies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets public Cache-Control for getPlans', async () => {
    mockPlanService.getAllPlans.mockResolvedValue([
      { id: 1, code: 'starter', name: 'Starter', price: 99000 },
    ]);

    const { req, res } = makeReqRes();
    await getPlans(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.resHeaders['cache-control']).toBe('public, max-age=30, s-maxage=60, stale-while-revalidate=120');
    expect(res.responseData.success).toBe(true);
    expect(res.responseData.plans).toHaveLength(1);
  });

  it('sets private, no-store Cache-Control for getCustomPlanConfig', async () => {
    mockCustomPlanService.getCustomPlanPricingConfig.mockResolvedValue({ tier: 'custom' });

    const { req, res } = makeReqRes();
    await getCustomPlanConfig(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.resHeaders['cache-control']).toBe('private, no-store');
  });

  it('sets private, no-store Cache-Control for getMyCustomPlan', async () => {
    mockCustomPlanService.getMyCustomPlan.mockResolvedValue({ id: 9, name: 'My Plan' });

    const { req, res } = makeReqRes({ user: { id: 100, activePlanId: 9 } });
    await getMyCustomPlan(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.resHeaders['cache-control']).toBe('private, no-store');
  });
});

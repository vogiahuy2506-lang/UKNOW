import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockAdminPlansService = {
  createNewPlan: jest.fn(),
  editPlan: jest.fn(),
  removePlan: jest.fn(),
};

const mockCloudflareService = {
  purgeUrls: jest.fn().mockResolvedValue({ success: true }),
};

const mockAuditService = {
  logSystem: jest.fn().mockResolvedValue(true),
  AUDIT_ACTIONS: { PLAN_CREATED: 'PLAN_CREATED', PLAN_UPDATED: 'PLAN_UPDATED', PLAN_DELETED: 'PLAN_DELETED' },
  AUDIT_ENTITY_TYPES: { PLAN: 'PLAN' },
};

jest.unstable_mockModule('../../../services/admin/adminPlans.service.js', () => mockAdminPlansService);
jest.unstable_mockModule('../../../services/cloudflare.service.js', () => ({
  default: mockCloudflareService,
}));
jest.unstable_mockModule('../../../services/audit.service.js', () => mockAuditService);
jest.unstable_mockModule('../../../utils/auditContext.util.js', () => ({
  getSystemAuditContext: jest.fn(() => ({})),
}));

const { create, update, remove } = await import('../adminPlans.controller.js');

const makeReqRes = (body = {}, params = {}) => {
  let statusCode = 200;
  let responseData = null;
  const res = {
    status: jest.fn((c) => { statusCode = c; return res; }),
    json: jest.fn((d) => { responseData = d; return res; }),
    get statusCode() { return statusCode; },
    get responseData() { return responseData; },
  };
  const req = { body, params };
  return { req, res };
};

describe('adminPlans.controller cache invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create() calls cloudflareService.purgeUrls after creating a plan', async () => {
    mockAdminPlansService.createNewPlan.mockResolvedValue({ id: 5, code: 'pro', name: 'Pro Plan' });

    const { req, res } = makeReqRes({ code: 'pro', name: 'Pro Plan', price: 199000 });
    await create(req, res);

    expect(res.statusCode).toBe(201);
    expect(mockCloudflareService.purgeUrls).toHaveBeenCalledWith([
      'https://founderai.biz/api/plans',
      'https://founderai.biz/pricing',
    ]);
  });

  it('update() calls cloudflareService.purgeUrls after updating a plan', async () => {
    mockAdminPlansService.editPlan.mockResolvedValue({ id: 5, code: 'pro', name: 'Pro Plan Updated' });

    const { req, res } = makeReqRes({ name: 'Pro Plan Updated', price: 249000 }, { id: '5' });
    await update(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockCloudflareService.purgeUrls).toHaveBeenCalledWith([
      'https://founderai.biz/api/plans',
      'https://founderai.biz/pricing',
    ]);
  });

  it('remove() calls cloudflareService.purgeUrls after removing a plan', async () => {
    mockAdminPlansService.removePlan.mockResolvedValue({ message: 'Đã xóa gói thành công', softDeleted: false });

    const { req, res } = makeReqRes({}, { id: '5' });
    await remove(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockCloudflareService.purgeUrls).toHaveBeenCalledWith([
      'https://founderai.biz/api/plans',
      'https://founderai.biz/pricing',
    ]);
  });
});

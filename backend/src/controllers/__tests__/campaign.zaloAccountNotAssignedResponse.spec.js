/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — tạo / sửa / nhân bản chiến dịch: lỗi `ZALO_ACCOUNT_NOT_ASSIGNED` từ
 * campaignCrudService phải ra HTTP 403 kèm `code` + câu tiếng Việt (trước đây `create` nuốt mọi lỗi lạ thành 500 "Lỗi server").
 * Đường trợ lý AI (`ai.controller.executeCampaign`) gọi lại `campaignController.create` và chuyển nguyên status/body.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockCreateCampaign = jest.fn();
const mockUpdateCampaign = jest.fn();
const mockDuplicateCampaign = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: jest.fn() },
  isConnectionError: jest.fn(() => false),
}));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: { CAMPAIGN_CREATED: 'CAMPAIGN_CREATED', CAMPAIGN_UPDATED: 'CAMPAIGN_UPDATED' },
  AUDIT_ENTITY_TYPES: { CAMPAIGN: 'campaign' },
  logWorkspace: jest.fn(),
}));
jest.unstable_mockModule('../../utils/auditContext.util.js', () => ({
  getWorkspaceAuditContext: jest.fn(() => ({ userId: 20, ownerId: 10 })),
}));
jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({
  default: {
    createCampaign: mockCreateCampaign,
    updateCampaign: mockUpdateCampaign,
    duplicateCampaign: mockDuplicateCampaign,
  },
}));
jest.unstable_mockModule('../../services/campaign/campaignFlow.service.js', () => ({
  default: { inferValueType: jest.fn(), isCampaignContentUpdateRequest: jest.fn(() => false) },
}));
jest.unstable_mockModule('../../services/campaign/campaignRun.service.js', () => ({
  default: {},
  EMAIL_API_DELAY_MIN_MS: 50,
  EMAIL_API_DELAY_MAX_MS: 250,
}));
jest.unstable_mockModule('../../services/campaign/campaignNodeData.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignExecutionLog.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignEmailSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: jest.fn(),
  recordDirectSendUsage: jest.fn(),
  _clearQuotaCache: jest.fn(),
  getVnDayBoundaries: jest.fn(() => ({ vnDayStart: new Date(), vnDayEnd: new Date(), vnNow: new Date() })),
  nextVnMidnight: jest.fn(() => new Date()),
  nextVnMonthStart: jest.fn(() => new Date()),
}));
jest.unstable_mockModule('../upload.controller.js', () => ({ default: {} }));
jest.unstable_mockModule('../zaloSettings.controller.js', () => ({ default: {} }));
jest.unstable_mockModule('../emailSettings.controller.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignPreflight.service.js', () => ({
  validateCampaignPreflight: jest.fn(async () => ({ valid: true })),
}));
const realResourceLimit = await import('../../utils/userResourceLimit.util.js');
jest.unstable_mockModule('../../utils/userResourceLimit.util.js', () => ({
  ...realResourceLimit,
  checkUserResourceLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

const { default: campaignController } = await import('../campaign.controller.js');
const { createZaloNotAssignedError } = await import('../../services/campaign/campaignZaloAccess.service.js');

const employee = {
  id: 20,
  role: 'user',
  activeContext: { type: 'employee', ownerId: 10, membershipId: 3, permissions: { campaigns_create: true } },
};

function createRes() {
  const res = {};
  res.status = jest.fn().mockImplementation((code) => { res.statusCode = code; return res; });
  res.json = jest.fn().mockImplementation((payload) => { res.body = payload; return res; });
  return res;
}

describe('campaign.controller — ZALO_ACCOUNT_NOT_ASSIGNED ra 403 + code', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('create → 403 + code + câu tiếng Việt (không phải 500 "Lỗi server")', async () => {
    mockCreateCampaign.mockRejectedValue(createZaloNotAssignedError('Chiến dịch dùng tài khoản Zalo chưa được giao cho bạn.'));
    const res = createRes();
    await campaignController.create({
      user: employee,
      body: { campaignName: 'C', campaignType: 'zalo', nodes: [{ tempId: 'a', nodeSubtype: 'send_zalo_personal', config: { zaloAccountId: 9 } }] },
    }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      code: 'ZALO_ACCOUNT_NOT_ASSIGNED',
      message: 'Chiến dịch dùng tài khoản Zalo chưa được giao cho bạn.',
    });
  });

  it('create: lỗi lạ khác vẫn là 500 như cũ (không nuốt nhầm)', async () => {
    mockCreateCampaign.mockRejectedValue(new Error('boom'));
    const res = createRes();
    await campaignController.create({ user: employee, body: { campaignName: 'C', campaignType: 'zalo' } }, res);
    expect(res.statusCode).toBe(500);
  });

  it('update → 403 + code', async () => {
    mockUpdateCampaign.mockRejectedValue(createZaloNotAssignedError());
    const res = createRes();
    await campaignController.update({ user: employee, params: { id: '7' }, body: { nodes: [] } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual(expect.objectContaining({ success: false, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' }));
  });

  it('duplicate → 403 + code + câu báo (không phải 500)', async () => {
    mockDuplicateCampaign.mockRejectedValue(createZaloNotAssignedError('Chiến dịch dùng tài khoản Zalo chưa được giao cho bạn.'));
    const res = createRes();
    await campaignController.duplicate({ user: employee, params: { id: '7' }, body: { campaignName: 'Bản sao' } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual(expect.objectContaining({
      success: false,
      code: 'ZALO_ACCOUNT_NOT_ASSIGNED',
      message: 'Chiến dịch dùng tài khoản Zalo chưa được giao cho bạn.',
    }));
  });
});

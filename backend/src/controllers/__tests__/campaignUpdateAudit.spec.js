import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDbQuery = jest.fn();
const mockLogWorkspace = jest.fn();
const mockGetWorkspaceAuditContext = jest.fn(() => ({ userId: 2, ownerId: 1 }));
const mockUpdateCampaign = jest.fn();
const mockIsCampaignContentUpdateRequest = jest.fn(() => false);

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockDbQuery },
}));

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: {
    CAMPAIGN_CREATED: 'CAMPAIGN_CREATED',
    CAMPAIGN_UPDATED: 'CAMPAIGN_UPDATED',
    CAMPAIGN_DELETED: 'CAMPAIGN_DELETED',
  },
  AUDIT_ENTITY_TYPES: { CAMPAIGN: 'campaign' },
  logWorkspace: mockLogWorkspace,
}));

jest.unstable_mockModule('../../utils/auditContext.util.js', () => ({
  getWorkspaceAuditContext: mockGetWorkspaceAuditContext,
}));

jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({
  default: {
    updateCampaign: mockUpdateCampaign,
  },
}));

jest.unstable_mockModule('../../services/campaign/campaignFlow.service.js', () => ({
  default: {
    inferValueType: jest.fn(),
    isCampaignContentUpdateRequest: mockIsCampaignContentUpdateRequest,
  },
}));

jest.unstable_mockModule('../../services/campaign/campaignRun.service.js', () => ({
  default: {},
  EMAIL_API_DELAY_MIN_MS: 50,
  EMAIL_API_DELAY_MAX_MS: 250,
}));
jest.unstable_mockModule('../../services/campaign/campaignNodeData.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignExecutionLog.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignEmailSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/campaign/campaignCustomer.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../utils/userResourceLimit.util.js', () => ({ checkUserResourceLimit: jest.fn() }));
jest.unstable_mockModule('../../utils/userSendLimit.util.js', () => ({ checkSendQuota: jest.fn(), recordDirectSendUsage: jest.fn() }));
jest.unstable_mockModule('../upload.controller.js', () => ({ default: {} }));
jest.unstable_mockModule('../zaloSettings.controller.js', () => ({ default: {} }));
jest.unstable_mockModule('../emailSettings.controller.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignPreflight.service.js', () => ({
  validateCampaignPreflight: jest.fn(async () => ({ valid: true })),
}));

const { default: campaignController } = await import('../campaign.controller.js');

function createRes() {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn().mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

describe('campaignController.update - Audit and 409 conflict handling (Việc 1.5 & PR-A4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs CAMPAIGN_UPDATED with nodesTruoc and nodesSau when campaign update succeeds', async () => {
    mockUpdateCampaign.mockResolvedValueOnce({
      id: 10,
      campaignName: 'Updated Campaign',
      status: 'draft',
      nodesTruoc: 3,
    });

    const req = {
      params: { id: '10' },
      body: {
        campaignName: 'Updated Campaign',
        nodes: [{ id: 'n1' }, { id: 'n2' }],
      },
      user: { id: 2, role: 'user_admin' },
    };
    const res = createRes();

    await campaignController.update(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
    expect(mockLogWorkspace).toHaveBeenCalledWith(
      expect.anything(),
      'CAMPAIGN_UPDATED',
      'campaign',
      10,
      {
        nodesTruoc: 3,
        nodesSau: 2,
      }
    );
  });

  it('returns 409 with CANNOT_EMPTY_ACTIVE_CAMPAIGN code when updateCampaign throws 409', async () => {
    const error = new Error('Không thể xoá toàn bộ node của chiến dịch đã kích hoạt');
    error.code = 'CANNOT_EMPTY_ACTIVE_CAMPAIGN';
    error.statusCode = 409;
    mockUpdateCampaign.mockRejectedValueOnce(error);

    const req = {
      params: { id: '10' },
      body: {
        nodes: [],
      },
      user: { id: 2, role: 'user_admin' },
    };
    const res = createRes();

    await campaignController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'CANNOT_EMPTY_ACTIVE_CAMPAIGN',
      message: 'Không thể xoá toàn bộ node của chiến dịch đã kích hoạt',
    });
  });
});

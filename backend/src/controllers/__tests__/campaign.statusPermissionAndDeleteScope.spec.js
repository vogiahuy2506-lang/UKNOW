import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockLogWorkspace = jest.fn();
const mockUpdateCampaign = jest.fn();
const mockDeleteCampaign = jest.fn();
const mockDeleteFromS3 = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: jest.fn() },
  isConnectionError: jest.fn(() => false),
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
  getWorkspaceAuditContext: jest.fn(() => ({ userId: 20, ownerId: 10 })),
}));

jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({
  default: {
    updateCampaign: mockUpdateCampaign,
    deleteCampaign: mockDeleteCampaign,
  },
}));

jest.unstable_mockModule('../../services/campaign/campaignFlow.service.js', () => ({
  default: {
    inferValueType: jest.fn(),
    isCampaignContentUpdateRequest: jest.fn(() => false),
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
jest.unstable_mockModule('../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: jest.fn(),
  recordDirectSendUsage: jest.fn(),
  _clearQuotaCache: jest.fn(),
  getVnDayBoundaries: jest.fn(() => ({ vnDayStart: new Date(), vnDayEnd: new Date(), vnNow: new Date() })),
  nextVnMidnight: jest.fn(() => new Date()),
  nextVnMonthStart: jest.fn(() => new Date()),
}));
jest.unstable_mockModule('../upload.controller.js', () => ({ default: { deleteFromS3: mockDeleteFromS3 } }));
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

describe('campaignController.update — 403 khi nhân viên thiếu campaigns_run kích hoạt qua PUT', () => {
  let errorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('service ném 403 PERMISSION_DENIED → trả 403 (không phải 500), không ghi audit', async () => {
    const error = new Error('Bạn không có quyền kích hoạt chiến dịch (cần quyền campaigns_run)');
    error.statusCode = 403;
    error.code = 'PERMISSION_DENIED';
    mockUpdateCampaign.mockRejectedValueOnce(error);

    const res = createRes();
    await campaignController.update({
      params: { id: '7' },
      body: { status: 'active' },
      user: { id: 20, role: 'user', activeContext: { type: 'employee', ownerId: 10, permissions: { campaigns_create: true } } },
    }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'PERMISSION_DENIED' });
    expect(mockLogWorkspace).not.toHaveBeenCalled();
  });
});

describe('campaignController.delete — truyền chủ chiến dịch xuống deleteFromS3', () => {
  let logSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('gọi deleteFromS3 với ownerUserId do service trả về', async () => {
    mockDeleteCampaign.mockResolvedValueOnce({
      fileKeysToDelete: ['uploads/10/quick-send/a.pdf'],
      ownerUserId: 10,
    });
    mockDeleteFromS3.mockResolvedValueOnce({ success: true, deletedCount: 1, skippedCount: 0, errors: [] });

    const res = createRes();
    await campaignController.delete({ params: { id: '7' }, user: { id: 10, role: 'user' } }, res);

    expect(mockDeleteFromS3).toHaveBeenCalledWith(['uploads/10/quick-send/a.pdf'], { ownerUserId: 10 });
    expect(res.body).toMatchObject({ success: true });
  });

  it('không có key cần xoá → không gọi deleteFromS3', async () => {
    mockDeleteCampaign.mockResolvedValueOnce({ fileKeysToDelete: [], ownerUserId: 10 });

    const res = createRes();
    await campaignController.delete({ params: { id: '7' }, user: { id: 10, role: 'user' } }, res);

    expect(mockDeleteFromS3).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ success: true });
  });
});

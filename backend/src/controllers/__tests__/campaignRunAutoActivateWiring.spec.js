import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-3, Việc 1+2.
 *
 * Test WIRING: req.body.autoActivate → campaign.controller.js → campaignRunService.createCampaignRunRecord.
 * Logic kích hoạt thật (draft/paused, chặn source='schedule') đã test riêng ở
 * campaignRunAutoActivate.spec.js (service level) — ở đây chỉ canh dây nối không đứt/không tự bịa.
 */
const mockDbQuery = jest.fn();
const mockLogWorkspace = jest.fn();
const mockGetWorkspaceAuditContext = jest.fn(() => ({ userId: 1, ownerId: 1 }));
const mockCreateCampaignRunRecord = jest.fn();
const mockExecuteCampaign = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockDbQuery },
  isConnectionError: jest.fn(() => false),
}));

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: {
    CAMPAIGN_RUN_STARTED: 'campaign.run.started',
  },
  AUDIT_ENTITY_TYPES: { CAMPAIGN: 'campaign' },
  logWorkspace: mockLogWorkspace,
}));

jest.unstable_mockModule('../../utils/auditContext.util.js', () => ({
  getWorkspaceAuditContext: mockGetWorkspaceAuditContext,
}));

jest.unstable_mockModule('../../services/campaign/campaignRun.service.js', () => ({
  default: {
    createCampaignRunRecord: mockCreateCampaignRunRecord,
    executeCampaign: mockExecuteCampaign,
  },
  EMAIL_API_DELAY_MIN_MS: 50,
  EMAIL_API_DELAY_MAX_MS: 250,
}));

jest.unstable_mockModule('../../services/campaign/campaignFlow.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignNodeData.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignExecutionLog.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignEmailSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/campaign/campaignCustomer.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../utils/userResourceLimit.util.js', () => ({ checkUserResourceLimit: jest.fn() }));
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

function ownerReq(body) {
  return {
    params: { id: '10' },
    body,
    user: { id: 1, role: 'user', activeContext: { type: 'self' } },
  };
}

describe('campaign.controller.js run() — dây nối autoActivate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateCampaignRunRecord.mockResolvedValue({ id: 99 });
    mockExecuteCampaign.mockResolvedValue({});
  });

  it("body.autoActivate: true → truyền autoActivate: true xuống createCampaignRunRecord", async () => {
    const req = ownerReq({ source: 'campaign_run', autoActivate: true });
    const res = createRes();

    await campaignController.run(req, res);

    expect(mockCreateCampaignRunRecord).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 10, source: 'campaign_run', autoActivate: true })
    );
  });

  it('không gửi autoActivate → mặc định false, không tự suy true', async () => {
    const req = ownerReq({ source: 'campaign_run' });
    const res = createRes();

    await campaignController.run(req, res);

    expect(mockCreateCampaignRunRecord).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 10, autoActivate: false })
    );
  });

  it("source: 'schedule' + autoActivate: true (payload bất thường) → vẫn truyền nguyên xuống service, KHÔNG tự chặn ở tầng controller — chốt chặn thật nằm ở service", async () => {
    const req = ownerReq({ source: 'schedule', autoActivate: true });
    const res = createRes();

    await campaignController.run(req, res);

    expect(mockCreateCampaignRunRecord).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'schedule', autoActivate: true })
    );
  });
});

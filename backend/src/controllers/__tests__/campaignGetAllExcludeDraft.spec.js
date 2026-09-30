import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 (C-09) — GET /campaigns nhận `excludeDraft=1|true` và chuyển xuống service dưới dạng boolean,
 * để `/app/customers` lọc nháp trong SQL (phân trang + tổng đúng) thay vì lọc ở trình duyệt.
 */
const mockGetAllCampaigns = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: jest.fn() },
  isConnectionError: jest.fn(() => false),
}));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  AUDIT_ACTIONS: {},
  AUDIT_ENTITY_TYPES: {},
  logWorkspace: jest.fn(),
}));
jest.unstable_mockModule('../../utils/auditContext.util.js', () => ({
  getWorkspaceAuditContext: jest.fn(),
}));
jest.unstable_mockModule('../../services/campaign/campaignRun.service.js', () => ({
  default: {},
  EMAIL_API_DELAY_MIN_MS: 50,
  EMAIL_API_DELAY_MAX_MS: 250,
}));
jest.unstable_mockModule('../../services/campaign/campaignFlow.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignNodeData.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignExecutionLog.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignEmailSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({
  default: { getAllCampaigns: mockGetAllCampaigns },
}));
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
  res.status = jest.fn().mockImplementation(() => res);
  res.json = jest.fn().mockImplementation((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

const user = { id: 1, role: 'user' };

describe('campaign.controller getAll — excludeDraft (C-09)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllCampaigns.mockResolvedValue({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });

  it.each(['1', 'true', 'TRUE'])('excludeDraft=%s → service nhận excludeDraft: true', async (value) => {
    await campaignController.getAll({ query: { page: 1, limit: 20, excludeDraft: value }, user }, createRes());
    expect(mockGetAllCampaigns.mock.calls[0][0].excludeDraft).toBe(true);
  });

  it.each([undefined, '', '0', 'false'])('excludeDraft=%p → service KHÔNG lọc nháp', async (value) => {
    await campaignController.getAll({ query: { page: 1, limit: 20, excludeDraft: value }, user }, createRes());
    expect(mockGetAllCampaigns.mock.calls[0][0].excludeDraft).toBeUndefined();
  });
});

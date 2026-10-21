import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetLeadsForCampaignConfig = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn() },
}));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignNodeData.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../lead/lead.service.js', () => ({
  default: { getLeadsForCampaignConfig: mockGetLeadsForCampaignConfig },
}));

jest.unstable_mockModule('../campaignFlow.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCustomer.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../customer/customerInterested.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../customer/customerHelper.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../queue/outboundMessageQueue.service.js', () => ({
  default: {
    isQueueFeatureEnabled: () => false,
  },
  OUTBOUND_MESSAGE_JOB_TYPES: {},
}));

jest.unstable_mockModule('../../form.service.js', () => ({
  default: {},
}));

const { default: campaignNodeDataService } = await import('../campaignNodeData.service.js');

describe('campaignNodeData read_landing_leads — phạm vi workspace do server quyết định (PLAN_VA_CO_LAP_DU_LIEU_TENANT PR-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLeadsForCampaignConfig.mockResolvedValue({ items: [], total: 0, excludedNoConsent: 0 });
  });

  it('khoá phạm vi do client ghi trong config KHÔNG thắng: ghi đè SAU spread bằng chủ chiến dịch, isSuperAdmin=false', async () => {
    const node = {
      id: 'n1',
      node_subtype: 'read_landing_leads',
      config: {
        workspaceOwnerId: 999,
        idUser: 999,
        userId: 999,
        isSuperAdmin: true,
        landingLeadsLimit: 50,
        landingLeadsSlugs: ['landing-a'],
      },
    };

    await campaignNodeDataService.getCustomersFromDataNode(node, 7, [node]);

    expect(mockGetLeadsForCampaignConfig).toHaveBeenCalledTimes(1);
    const passed = mockGetLeadsForCampaignConfig.mock.calls[0][0];
    expect(passed).toMatchObject({
      workspaceOwnerId: 7,
      idUser: 7,
      userId: 7,
      isSuperAdmin: false,
    });
    // bộ lọc hợp lệ của người dùng vẫn đi xuống
    expect(passed.landingLeadsLimit).toBe(50);
    expect(passed.landingLeadsSlugs).toEqual(['landing-a']);
  });

  it('config không có khoá phạm vi vẫn nhận phạm vi của chủ chiến dịch', async () => {
    const node = { id: 'n2', node_subtype: 'read_landing_leads', config: {} };

    await campaignNodeDataService.getCustomersFromDataNode(node, 12, [node]);

    expect(mockGetLeadsForCampaignConfig.mock.calls[0][0]).toMatchObject({ workspaceOwnerId: 12, idUser: 12, isSuperAdmin: false });
  });
});

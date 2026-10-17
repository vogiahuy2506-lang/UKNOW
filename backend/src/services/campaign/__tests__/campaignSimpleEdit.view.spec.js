import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D3 (PLAN_TUNG_BUOC_MO_RONG_SUA_DUOC_2026-10-17) — `GET /campaigns/:id/simple` trả `view` khi form null vì nhịp chờ;
 * `editable` vẫn false và `updateSimpleCampaign` vẫn 409.
 */
const mockGetCampaignById = jest.fn();
const mockHasRunningRun = jest.fn();
const mockFindSchedules = jest.fn();

jest.unstable_mockModule('../campaignCrud.service.js', () => ({
  default: { getCampaignById: mockGetCampaignById, updateCampaign: jest.fn() },
}));
jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: { hasRunningRun: mockHasRunningRun },
}));
jest.unstable_mockModule('../../../repositories/campaign/campaignSchedule.repository.js', () => ({
  default: { findByCampaignId: mockFindSchedules },
}));
jest.unstable_mockModule('../../ai/landingAudienceResolver.service.js', () => ({
  applyLandingAudienceResolution: jest.fn(async (intent) => intent),
  default: {},
}));
jest.unstable_mockModule('../../ai/aiCampaignDraft.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../ai/campaignConfirmation.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../readSheetAutoName.service.js', () => ({ fillReadSheetFirstTabNames: jest.fn() }));
jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({ checkUserResourceLimit: jest.fn() }));
jest.unstable_mockModule('../../../repositories/ai/aiCampaign.repository.js', () => ({
  default: { getFormIdsOwnedBy: jest.fn(async (_o, ids) => ids) },
}));
jest.unstable_mockModule('../../../repositories/customer/customerRead.repository.js', () => ({
  default: { countWorkspaceCustomers: jest.fn() },
}));

const { normalizeSimpleBody, compileSimpleGraph } = await import('../campaignSimple.service.js');
const { applyDirectRecipients } = await import('../../../utils/directRecipients.util.js');
const { getSimpleEditState, updateSimpleCampaign } = await import('../campaignSimpleEdit.service.js');

const OWNER = 7;
const AUTH = { id: OWNER };

function persist({ nodes, connections }) {
  const map = new Map(nodes.map((node, index) => [String(node.id), String(1000 + index)]));
  return {
    nodes: nodes.map((node) => ({
      id: map.get(String(node.id)),
      nodeType: node.nodeType,
      nodeSubtype: node.nodeSubtype,
      nodeName: node.nodeName,
      config: JSON.parse(JSON.stringify(node.config || {})),
    })),
    connections: connections.map((conn, index) => ({
      id: index + 1,
      sourceNodeId: map.get(String(conn.sourceNodeId)),
      targetNodeId: map.get(String(conn.targetNodeId)),
      connectionType: 'default',
      conditionConfig: null,
    })),
  };
}

async function storedCampaign(followUps) {
  const input = await normalizeSimpleBody(
    { channel: 'email', senderId: 5, audience: { type: 'manual', emails: ['a@x.com'] }, content: { mode: 'template', templateId: 11 }, followUps },
    { ownerId: OWNER, skipDbChecks: true },
  );
  const graph = await compileSimpleGraph(input, { ownerId: OWNER });
  if (input.directRecipients) applyDirectRecipients({ nodes: graph.nodes }, input.directRecipients);
  const stored = persist(graph);
  return { id: 1, campaignName: 'Chiến dịch A', campaignType: 'email', status: 'draft', workspaceOwnerId: OWNER, ...stored };
}

const stepsOf = (campaign) => campaign.nodes.find((node) => node.nodeSubtype === 'send_email').config.emailSteps;
const fu = (delayValue, delayUnit, templateId) => ({ delayValue, delayUnit, content: { mode: 'template', templateId } });

beforeEach(() => {
  jest.clearAllMocks();
  mockHasRunningRun.mockResolvedValue(false);
  mockFindSchedules.mockResolvedValue([]);
});

describe('getSimpleEditState — view', () => {
  it('delay_from_start: editable false, form null, có view giữ nguyên delayFrom/đơn vị', async () => {
    const campaign = await storedCampaign([fu(2, 'days', 12)]);
    stepsOf(campaign)[1].delayFrom = 'start';
    mockGetCampaignById.mockResolvedValue(campaign);
    const state = await getSimpleEditState({ authUser: AUTH, campaignId: 1 });
    expect(state.editable).toBe(false);
    expect(state.form).toBeNull();
    expect(state.readOnlyReasons.map((item) => item.code)).toEqual(['delay_from_start']);
    expect(state.view.followUps).toEqual([{ delayValue: 2, delayUnit: 'days', delayFrom: 'start', content: { mode: 'template', templateId: 12 } }]);
  });

  it('đọc đủ form (sửa được): có form, KHÔNG có view', async () => {
    mockGetCampaignById.mockResolvedValue(await storedCampaign([fu(2, 'days', 12)]));
    const state = await getSimpleEditState({ authUser: AUTH, campaignId: 1 });
    expect(state.editable).toBe(true);
    expect(state.form).not.toBeNull();
    expect(state).not.toHaveProperty('view');
  });

  it('khối nâng cao: không có view', async () => {
    const campaign = await storedCampaign([fu(2, 'days', 12)]);
    stepsOf(campaign)[1].delayFrom = 'start';
    campaign.nodes.splice(1, 0, { id: '5000', nodeType: 'condition', nodeSubtype: 'condition', nodeName: 'Rẽ nhánh', config: {} });
    mockGetCampaignById.mockResolvedValue(campaign);
    const state = await getSimpleEditState({ authUser: AUTH, campaignId: 1 });
    expect(state).not.toHaveProperty('view');
  });

  it('PUT vẫn 409 CAMPAIGN_NOT_EDITABLE dù có view', async () => {
    const campaign = await storedCampaign([fu(2, 'days', 12)]);
    stepsOf(campaign)[1].delayFrom = 'start';
    mockGetCampaignById.mockResolvedValue(campaign);
    await expect(updateSimpleCampaign({ authUser: AUTH, campaignId: 1, body: { channel: 'email' }, createdTemplates: {} }))
      .rejects.toMatchObject({ statusCode: 409, code: 'CAMPAIGN_NOT_EDITABLE' });
  });
});

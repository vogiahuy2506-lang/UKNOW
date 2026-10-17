import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * getSimpleEditState — tham chiếu khối trong config phải được đổi mã GIỐNG LÚC CHẠY trước khi đọc ngược + so khớp.
 * Trình dựng lưu `zaloGroupNodeId` / `zaloGroupAccountNodeId` bằng mã khối trong `flow_json`; campaignRun đổi sang mã DB bằng
 * `buildFlowNodeIdMap` + `normalizeNodeReferenceConfig` (15 chiến dịch nhóm Zalo prod 17/10/2026).
 */
const mockGetCampaignById = jest.fn();

jest.unstable_mockModule('../campaignCrud.service.js', () => ({
  default: { getCampaignById: mockGetCampaignById, updateCampaign: jest.fn() },
}));
jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: { hasRunningRun: jest.fn(async () => false) },
}));
jest.unstable_mockModule('../../../repositories/campaign/campaignSchedule.repository.js', () => ({
  default: { findByCampaignId: jest.fn(async () => []) },
}));
jest.unstable_mockModule('../../ai/landingAudienceResolver.service.js', () => ({
  applyLandingAudienceResolution: jest.fn(async (intent) => intent),
  default: { applyLandingAudienceResolution: jest.fn(async (intent) => intent) },
}));
jest.unstable_mockModule('../../ai/aiCampaignDraft.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../ai/campaignConfirmation.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../readSheetAutoName.service.js', () => ({ fillReadSheetFirstTabNames: jest.fn() }));
jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({ checkUserResourceLimit: jest.fn() }));
jest.unstable_mockModule('../../../repositories/ai/aiCampaign.repository.js', () => ({
  default: { getFormIdsOwnedBy: jest.fn(async (_owner, ids) => ids) },
}));
jest.unstable_mockModule('../../../repositories/customer/customerRead.repository.js', () => ({
  default: { countWorkspaceCustomers: jest.fn() },
}));

const { normalizeSimpleBody, compileSimpleGraph } = await import('../campaignSimple.service.js');
const { getSimpleEditState } = await import('../campaignSimpleEdit.service.js');

const OWNER = 7;
const authUser = { id: OWNER };

/** Sơ đồ nhóm Zalo đã lưu (mã khối số như DB); tham chiếu khối để nguyên mã DB. */
async function storedGroupCampaign() {
  const input = await normalizeSimpleBody(
    { channel: 'zalo_group', senderId: 9, audience: { type: 'zalo_groups', groupIds: ['111', '222'] }, content: { mode: 'template', templateId: 31 } },
    { ownerId: OWNER, skipDbChecks: true },
  );
  const { nodes, connections } = await compileSimpleGraph(input, { ownerId: OWNER });
  const map = new Map(nodes.map((node, index) => [String(node.id), String(1000 + index)]));
  const remap = (value) => (map.has(String(value)) ? map.get(String(value)) : value);
  return {
    id: 55,
    campaignName: 'Đăng nhóm',
    campaignType: 'zalo_group',
    status: 'draft',
    workspaceOwnerId: OWNER,
    flowJson: null,
    nodes: nodes.map((node) => ({
      id: map.get(String(node.id)),
      nodeType: node.nodeType,
      nodeSubtype: node.nodeSubtype,
      nodeName: node.nodeName,
      config: Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(node.config || {})))
        .map(([key, value]) => [key, /NodeId$/.test(key) ? remap(value) : value])),
    })),
    connections: connections.map((conn, index) => ({
      id: index + 1,
      sourceNodeId: map.get(String(conn.sourceNodeId)),
      targetNodeId: map.get(String(conn.targetNodeId)),
      connectionType: 'custom',
    })),
  };
}

/** Đổi tham chiếu khối sang mã `flow_json` kiểu trình dựng; `withFlow` = có lưu flow_json để đổi ngược lại. */
function useFlowReferences(campaign, { withFlow }) {
  const select = campaign.nodes.find((node) => node.nodeSubtype === 'select_zalo_account');
  const groups = campaign.nodes.find((node) => node.nodeSubtype === 'get_all_groups');
  const send = campaign.nodes.find((node) => node.nodeSubtype === 'send_zalo_group');
  groups.config.zaloGroupAccountNodeId = 'flow_select';
  send.config.zaloGroupNodeId = 'flow_groups';
  if (withFlow) {
    campaign.flowJson = {
      nodes: [
        { id: 'flow_select', type: 'task', data: { nodeType: 'select_zalo_account', label: select.nodeName } },
        { id: 'flow_groups', type: 'task', data: { nodeType: 'get_all_groups', label: groups.nodeName } },
      ],
    };
  }
  return campaign;
}

beforeEach(() => {
  mockGetCampaignById.mockReset();
});

describe('getSimpleEditState — tham chiếu khối theo mã flow_json', () => {
  it('sơ đồ nhóm Zalo lưu bằng mã DB → sửa được', async () => {
    mockGetCampaignById.mockResolvedValue(await storedGroupCampaign());
    const state = await getSimpleEditState({ authUser, campaignId: 55 });
    expect(state.readOnlyReasons).toEqual([]);
    expect(state.editable).toBe(true);
  });

  it('tham chiếu bằng mã flow_json + có flow_json → đổi mã như lúc chạy → sửa được', async () => {
    mockGetCampaignById.mockResolvedValue(useFlowReferences(await storedGroupCampaign(), { withFlow: true }));
    const state = await getSimpleEditState({ authUser, campaignId: 55 });
    expect(state.diffs).toBeUndefined();
    expect(state.editable).toBe(true);
  });

  it('khối gửi trỏ mã không đổi được (không có flow_json) → lúc chạy không lấy được nhóm nào → vẫn chặn', async () => {
    mockGetCampaignById.mockResolvedValue(useFlowReferences(await storedGroupCampaign(), { withFlow: false }));
    const state = await getSimpleEditState({ authUser, campaignId: 55 });
    expect(state.editable).toBe(false);
    expect(state.diffs.join('\n')).toContain('zaloGroupNodeId');
  });
});

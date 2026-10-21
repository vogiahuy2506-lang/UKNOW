/**
 * PLAN_THAM_CHIEU_KHOI PR-1 Việc 1.2 — NHÂN BẢN chiến dịch phải đổi tham chiếu giữa các khối sang id khối MỚI.
 * Trước đây `config` chép nguyên văn → bản sao trỏ id khối của chiến dịch gốc (#424 → khối 4030 của #420), nguồn hụt, run "completed" 0/0.
 * Mock ranh giới đúng hình dạng thật: pg trả id BIGSERIAL dạng CHUỖI (cả id khối cũ lẫn id khối mới do insertNodeTx trả).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockGetClient = jest.fn(async () => ({ query: mockClientQuery, release: mockClientRelease }));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: mockGetClient, query: jest.fn() },
}));

const realResourceLimit = await import('../../../utils/userResourceLimit.util.js');
jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({
  ...realResourceLimit,
  enforceResourceLimitTx: jest.fn().mockResolvedValue(undefined),
}));

const repo = {
  insertCampaignTx: jest.fn(),
  insertNodeTx: jest.fn(),
  insertConnectionTx: jest.fn(),
  updateNodeConfigTx: jest.fn(),
  findCampaignByIdTx: jest.fn(),
  findNodesByCampaignIdTx: jest.fn(),
  findConnectionsByCampaignIdTx: jest.fn(),
};
jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({ default: repo }));

const { default: campaignCrudService } = await import('../campaignCrud.service.js');

const ownerUser = { id: 10, role: 'user' };

const sourceNode = (id, subtype, config, extra = {}) => ({
  id: String(id),
  node_type: subtype.includes('trigger') ? 'trigger' : 'action',
  node_subtype: subtype,
  node_name: subtype,
  node_description: '',
  position_x: 0,
  position_y: 0,
  config,
  execution_order: 1,
  ...extra,
});

const duplicate = () => campaignCrudService.duplicateCampaign({ authUser: ownerUser, campaignId: 7, campaignName: 'Bản sao' });

describe('duplicateCampaign — đổi tham chiếu khối sang id khối mới', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repo.insertCampaignTx.mockResolvedValue({ id: 99, campaign_name: 'Bản sao', campaign_type: 'zalo', status: 'draft' });
    repo.findCampaignByIdTx.mockResolvedValue({
      id: 7, status: 'draft', campaign_name: 'Gốc', workspace_owner_id: 10, id_user: 10, campaign_type: 'zalo', origin: 'builder', flow_json: { nodes: [] },
    });
    // id khối mới cấp theo thứ tự chèn, dạng CHUỖI như pg trả BIGSERIAL
    repo.insertNodeTx.mockResolvedValueOnce('110').mockResolvedValueOnce('111').mockResolvedValueOnce('112');
    repo.findConnectionsByCampaignIdTx.mockResolvedValue([
      { source_node_id: '10', target_node_id: '11', connection_type: null, connection_label: null, condition_config: null },
      { source_node_id: '11', target_node_id: '12', connection_type: null, connection_label: null, condition_config: null },
    ]);
  });

  const threeNodes = (sendConfig) => [
    sourceNode(10, 'manual_trigger', {}),
    sourceNode(11, 'get_all_groups', {}),
    sourceNode(12, 'send_zalo_group', sendConfig),
  ];

  it('khối gửi nhóm (12) trỏ get_all_groups (11) → khối mới 112 trỏ id mới của 11 (111); tham chiếu ngoại "999" giữ nguyên', async () => {
    repo.findNodesByCampaignIdTx.mockResolvedValue(threeNodes({
      zaloGroupSource: 'node',
      zaloGroupNodeId: '11',
      zaloGroupAccountNodeId: '999',
      zaloGroupTemplateSteps: [{ templateMappings: [{ nodeId: '11', key: 'ten' }] }],
    }));
    const result = await duplicate();
    expect(result.id).toBe(99);

    expect(repo.updateNodeConfigTx).toHaveBeenCalledTimes(1);
    const [, updatedNodeId, updatedConfig] = repo.updateNodeConfigTx.mock.calls[0];
    expect(updatedNodeId).toBe('112');
    expect(updatedConfig).toEqual({
      zaloGroupSource: 'node',
      zaloGroupNodeId: '111',
      zaloGroupAccountNodeId: '999',
      zaloGroupTemplateSteps: [{ templateMappings: [{ nodeId: '111', key: 'ten' }] }],
    });
    // chèn khối vẫn dùng config gốc (đổi id ở lượt 2, SAU khi có id mới), kết nối vẫn nối đúng id mới
    expect(repo.insertNodeTx.mock.calls[2][1].config.zaloGroupNodeId).toBe('11');
    expect(repo.insertConnectionTx.mock.calls.map((call) => [call[1].sourceNodeId, call[1].targetNodeId]))
      .toEqual([['110', '111'], ['111', '112']]);
  });

  it('config lưu tham chiếu dạng SỐ (11) vẫn đổi được sang id chuỗi mới', async () => {
    repo.findNodesByCampaignIdTx.mockResolvedValue(threeNodes({ zaloGroupSource: 'node', zaloGroupNodeId: 11 }));
    await duplicate();
    expect(repo.updateNodeConfigTx.mock.calls[0][2].zaloGroupNodeId).toBe('111');
  });

  it('config về dạng chuỗi JSON vẫn được đổi tham chiếu (không bị bỏ qua)', async () => {
    repo.findNodesByCampaignIdTx.mockResolvedValue(
      threeNodes(JSON.stringify({ zaloGroupSource: 'node', zaloGroupNodeId: '11' }))
    );
    await duplicate();
    expect(repo.updateNodeConfigTx).toHaveBeenCalledTimes(1);
    expect(repo.updateNodeConfigTx.mock.calls[0][1]).toBe('112');
    expect(repo.updateNodeConfigTx.mock.calls[0][2].zaloGroupNodeId).toBe('111');
  });

  it('chiến dịch không có tham chiếu nào đổi → không UPDATE thêm lần nào', async () => {
    repo.findNodesByCampaignIdTx.mockResolvedValue(threeNodes({ zaloGroupSource: 'manual', zaloGroupIds: 'g1', zaloGroupNodeId: '999' }));
    await duplicate();
    expect(repo.updateNodeConfigTx).not.toHaveBeenCalled();
  });

  it('lượt 2 chạy trong CÙNG giao dịch: UPDATE dùng đúng client của giao dịch và COMMIT sau cùng', async () => {
    repo.findNodesByCampaignIdTx.mockResolvedValue(threeNodes({ zaloGroupSource: 'node', zaloGroupNodeId: '11' }));
    await duplicate();
    const client = await mockGetClient.mock.results[0].value;
    expect(repo.updateNodeConfigTx.mock.calls[0][0]).toBe(client);
    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockClientQuery).toHaveBeenLastCalledWith('COMMIT');
  });
});

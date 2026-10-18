/**
 * PLAN_THU_CONG_GOP_4_KENH — campaign_type SUY từ sơ đồ khi tạo/sửa; đổi loại phải qua hạn mức của loại MỚI.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockGetClient = jest.fn(async () => ({ query: mockClientQuery, release: mockClientRelease }));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: mockGetClient, query: jest.fn() },
}));

const mockEnforce = jest.fn();
const realResourceLimit = await import('../../../utils/userResourceLimit.util.js');
jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({
  ...realResourceLimit,
  enforceResourceLimitTx: mockEnforce,
}));

const repo = {
  insertCampaignTx: jest.fn(),
  insertNodeTx: jest.fn(),
  insertConnectionTx: jest.fn(),
  updateNodeConfigTx: jest.fn(),
  findCampaignByIdTx: jest.fn(),
  hasRunningRunTx: jest.fn(),
  updateCampaignFieldsTx: jest.fn(),
  deleteConnectionsByCampaignTx: jest.fn(),
  deleteNodesByCampaignTx: jest.fn(),
  countNodesByCampaignTx: jest.fn(),
};
jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({ default: repo }));

const { default: campaignCrudService } = await import('../campaignCrud.service.js');

const owner = { id: 10, role: 'user' };
const node = (tempId, subtype, config = {}) => ({ tempId, nodeType: 'action', nodeSubtype: subtype, nodeName: subtype, config });
const limitError = () => Object.assign(new Error('Đã đạt giới hạn số chiến dịch Zalo nhóm'), {
  code: 'RESOURCE_LIMIT_EXCEEDED', statusCode: 400, limitReached: true,
});

describe('campaignCrud — suy campaign_type từ sơ đồ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnforce.mockResolvedValue(undefined);
    repo.insertCampaignTx.mockResolvedValue({ id: 99, campaign_name: 'C', campaign_type: 'zalo', status: 'draft' });
    repo.insertNodeTx.mockResolvedValue(501);
    repo.hasRunningRunTx.mockResolvedValue(false);
    repo.updateCampaignFieldsTx.mockImplementation(async (_c, args) => ({
      id: 7, campaign_name: 'C', status: 'draft', campaign_type: args.campaignType ?? 'zalo',
    }));
    repo.countNodesByCampaignTx.mockResolvedValue(1);
  });

  describe('createCampaign', () => {
    const create = (campaignType, nodes) => campaignCrudService.createCampaign({
      authUser: owner, campaignName: 'C', campaignType, nodes, connections: [],
    });

    it('khai báo zalo nhưng sơ đồ chỉ có khối gửi nhóm -> lưu zalo_group và kiểm hạn mức zalo nhóm', async () => {
      await create('zalo', [node('a', 'send_zalo_group')]);
      expect(repo.insertCampaignTx.mock.calls[0][1].campaignType).toBe('zalo_group');
      expect(mockEnforce.mock.calls.map((c) => c[1].resourceKey)).toEqual(['campaigns', 'zaloGroupCampaigns']);
    });

    it('tạo trống (chưa có khối) -> giữ loại mặc định của kênh', async () => {
      await create('zalo', []);
      expect(repo.insertCampaignTx.mock.calls[0][1].campaignType).toBe('zalo');
      await create('telegram', []);
      expect(repo.insertCampaignTx.mock.calls[1][1].campaignType).toBe('telegram');
    });

    it('tạo vượt hạn mức loại suy ra -> ném lỗi, không ghi chiến dịch', async () => {
      mockEnforce.mockImplementation(async (_c, { resourceKey }) => {
        if (resourceKey === 'zaloGroupCampaigns') throw limitError();
      });
      await expect(create('zalo', [node('a', 'send_zalo_group')])).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
      expect(repo.insertCampaignTx).not.toHaveBeenCalled();
    });
  });

  describe('updateCampaign', () => {
    const update = (extra) => campaignCrudService.updateCampaign({
      campaignId: 7, authUser: owner, isContentUpdate: false, connections: [], ...extra,
    });
    const existing = (type) => repo.findCampaignByIdTx.mockResolvedValue({
      id: 7, status: 'draft', campaign_name: 'C', workspace_owner_id: 10, id_user: 10, campaign_type: type,
    });

    it('thay sơ đồ từ zalo sang chỉ khối nhóm -> loại đổi zalo_group, kiểm hạn mức zalo nhóm, trả về loại mới', async () => {
      existing('zalo');
      const result = await update({ campaignType: 'zalo', nodes: [node('a', 'send_zalo_group')] });
      expect(mockEnforce.mock.calls.map((c) => c[1].resourceKey)).toEqual(['zaloGroupCampaigns']);
      expect(repo.updateCampaignFieldsTx.mock.calls[0][1].campaignType).toBe('zalo_group');
      expect(result.campaignType).toBe('zalo_group');
    });

    it('đổi loại vượt hạn mức -> ném lỗi, ROLLBACK, KHÔNG xoá/ghi node, KHÔNG cập nhật chiến dịch', async () => {
      existing('zalo');
      mockEnforce.mockRejectedValue(limitError());
      await expect(update({ campaignType: 'zalo', nodes: [node('a', 'send_zalo_group')] }))
        .rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED', limitReached: true });
      expect(repo.updateCampaignFieldsTx).not.toHaveBeenCalled();
      expect(repo.deleteNodesByCampaignTx).not.toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('sơ đồ không đổi loại (zalo_group cũ vẫn chỉ khối nhóm) -> KHÔNG kiểm hạn mức, giữ zalo_group', async () => {
      existing('zalo_group');
      await update({ campaignType: 'zalo_group', nodes: [node('a', 'send_zalo_group')] });
      expect(mockEnforce).not.toHaveBeenCalled();
      expect(repo.updateCampaignFieldsTx.mock.calls[0][1].campaignType).toBe('zalo_group');
    });

    it('client KHÔNG khai báo loại: lấy loại đang lưu làm gốc (telegram_group + khối thiếu nguồn vẫn telegram_group)', async () => {
      existing('telegram_group');
      await update({ nodes: [node('a', 'send_telegram')] });
      expect(repo.updateCampaignFieldsTx.mock.calls[0][1].campaignType).toBe('telegram_group');
      expect(mockEnforce).not.toHaveBeenCalled();
    });

    it('không gửi nodes (chỉ đổi tên) -> không suy loại, không kiểm hạn mức', async () => {
      existing('zalo');
      await update({ campaignName: 'Tên mới' });
      expect(mockEnforce).not.toHaveBeenCalled();
      expect(repo.updateCampaignFieldsTx.mock.calls[0][1].campaignType).toBeUndefined();
    });

    it('client khai báo loại khác bản đang lưu (email -> zalo) -> cũng phải qua hạn mức loại mới (không lách)', async () => {
      existing('email');
      await update({ campaignType: 'zalo', campaignName: 'X' });
      expect(mockEnforce.mock.calls.map((c) => c[1].resourceKey)).toEqual(['zaloCampaigns']);
    });

    it('Telegram: đổi nguồn sang nhóm -> telegram_group, không có hạn mức riêng nên không gọi kiểm', async () => {
      existing('telegram');
      await update({ campaignType: 'telegram', nodes: [node('a', 'send_telegram', { recipientSource: 'telegram_groups' })] });
      expect(repo.updateCampaignFieldsTx.mock.calls[0][1].campaignType).toBe('telegram_group');
      expect(mockEnforce).not.toHaveBeenCalled();
    });
  });
});

/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — LƯU / SỬA / NHÂN BẢN chiến dịch: nhân viên chỉ được dùng tài khoản Zalo
 * ĐƯỢC GIAO ở mọi node (kể cả get_all_friends / get_all_groups). Kiểm TRƯỚC khi mở giao dịch, nên chiến dịch không được
 * ghi dở. Chủ / super admin luôn qua; lỗi đọc việc giao → chặn.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockGetClient = jest.fn(async () => ({ query: mockClientQuery, release: mockClientRelease }));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: mockGetClient, query: jest.fn() },
}));

const mockFindAssigned = jest.fn();
const realMemberRepo = await import('../../../repositories/user/memberChannelAccount.repository.js');
jest.unstable_mockModule('../../../repositories/user/memberChannelAccount.repository.js', () => ({
  ...realMemberRepo,
  findAssignedZaloAccountIds: mockFindAssigned,
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
  hasRunningRunTx: jest.fn(),
  updateCampaignFieldsTx: jest.fn(),
  deleteConnectionsByCampaignTx: jest.fn(),
  deleteNodesByCampaignTx: jest.fn(),
  countNodesByCampaignTx: jest.fn(),
  findNodesByCampaignIdTx: jest.fn(),
  findConnectionsByCampaignIdTx: jest.fn(),
};
jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({ default: repo }));

const { default: campaignCrudService } = await import('../campaignCrud.service.js');

const ownerUser = { id: 10, role: 'user' };
const employeeUser = {
  id: 20,
  role: 'user',
  activeContext: { type: 'employee', ownerId: 10, membershipId: 3, permissions: { campaigns_create: true } },
};
const superAdminUser = { id: 1, role: 'admin' };

const node = (tempId, subtype, config) => ({ tempId, nodeType: 'action', nodeSubtype: subtype, nodeName: subtype, config });

describe('campaignCrud — tài khoản Zalo được giao (G3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFindAssigned.mockResolvedValue([5]);
    repo.insertCampaignTx.mockResolvedValue({ id: 99, campaign_name: 'C', campaign_type: 'zalo', status: 'draft' });
    repo.insertNodeTx.mockResolvedValue(501);
    repo.findCampaignByIdTx.mockResolvedValue({
      id: 7, status: 'draft', campaign_name: 'C', workspace_owner_id: 10, id_user: 10, campaign_type: 'zalo', origin: 'builder',
    });
    repo.hasRunningRunTx.mockResolvedValue(false);
    repo.updateCampaignFieldsTx.mockResolvedValue({ id: 7, campaign_name: 'C', status: 'draft' });
    repo.countNodesByCampaignTx.mockResolvedValue(1);
    repo.findNodesByCampaignIdTx.mockResolvedValue([]);
    repo.findConnectionsByCampaignIdTx.mockResolvedValue([]);
  });

  describe('createCampaign', () => {
    const create = (authUser, nodes) => campaignCrudService.createCampaign({
      authUser, campaignName: 'C', campaignType: 'zalo', nodes, connections: [],
    });

    it('nhân viên dùng tài khoản CHƯA giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED, chưa mở giao dịch, chưa ghi gì', async () => {
      await expect(create(employeeUser, [node('a', 'send_zalo_personal', { zaloAccountId: 9 })]))
        .rejects.toMatchObject({ statusCode: 403, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expect(mockGetClient).not.toHaveBeenCalled();
      expect(repo.insertCampaignTx).not.toHaveBeenCalled();
      expect(repo.insertNodeTx).not.toHaveBeenCalled();
    });

    it.each([
      ['get_all_friends', { zaloAccountId: 9 }],
      ['get_all_groups', { zaloAccountId: '9' }],
      ['select_zalo_account', { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: [5, 9] }],
    ])('node %s chứa tài khoản chưa giao → 403', async (subtype, config) => {
      await expect(create(employeeUser, [node('a', subtype, config)]))
        .rejects.toMatchObject({ statusCode: 403, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expect(repo.insertCampaignTx).not.toHaveBeenCalled();
    });

    it('nhân viên dùng tài khoản được giao → lưu bình thường', async () => {
      const result = await create(employeeUser, [
        node('a', 'select_zalo_account', { zaloAccountId: 5 }),
        node('b', 'send_zalo_personal', { zaloAccountId: '5' }),
      ]);
      expect(result.id).toBe(99);
      expect(repo.insertCampaignTx).toHaveBeenCalledTimes(1);
      expect(repo.insertNodeTx).toHaveBeenCalledTimes(2);
    });

    it('CHỦ lưu chiến dịch dùng bất kỳ tài khoản nào → lưu, KHÔNG đọc bảng giao', async () => {
      const result = await create(ownerUser, [node('a', 'send_zalo_personal', { zaloAccountId: 9 })]);
      expect(result.id).toBe(99);
      expect(mockFindAssigned).not.toHaveBeenCalled();
    });

    it('super admin lưu → qua', async () => {
      await create(superAdminUser, [node('a', 'send_zalo_personal', { zaloAccountId: 9 })]);
      expect(repo.insertCampaignTx).toHaveBeenCalledTimes(1);
    });

    it('chiến dịch không có node Zalo → nhân viên lưu được, không đọc bảng giao', async () => {
      await create(employeeUser, [node('a', 'send_email', { fromEmailId: 3 })]);
      expect(repo.insertCampaignTx).toHaveBeenCalledTimes(1);
      expect(mockFindAssigned).not.toHaveBeenCalled();
    });

    it('FAIL-CLOSED: đọc bảng giao lỗi → nhân viên bị chặn', async () => {
      mockFindAssigned.mockRejectedValue(new Error('db down'));
      await expect(create(employeeUser, [node('a', 'send_zalo_personal', { zaloAccountId: 5 })]))
        .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expect(repo.insertCampaignTx).not.toHaveBeenCalled();
    });
  });

  describe('updateCampaign', () => {
    const update = (authUser, extra) => campaignCrudService.updateCampaign({
      campaignId: 7, authUser, isContentUpdate: false, connections: [], ...extra,
    });

    it('nhân viên THAY node bằng tài khoản chưa giao → 403, chưa xoá node cũ', async () => {
      await expect(update(employeeUser, { nodes: [node('a', 'send_zalo_group', { zaloAccountId: 9 })] }))
        .rejects.toMatchObject({ statusCode: 403, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expect(mockGetClient).not.toHaveBeenCalled();
      expect(repo.deleteNodesByCampaignTx).not.toHaveBeenCalled();
    });

    it('nhân viên thay node bằng tài khoản được giao → sửa bình thường', async () => {
      await update(employeeUser, { nodes: [node('a', 'send_zalo_group', { zaloAccountId: 5 })] });
      expect(repo.deleteNodesByCampaignTx).toHaveBeenCalledTimes(1);
      expect(repo.insertNodeTx).toHaveBeenCalledTimes(1);
    });

    it('chỉ đổi tên / mô tả (không gửi nodes) → không kiểm tài khoản, không đọc bảng giao', async () => {
      await update(employeeUser, { campaignName: 'Tên mới' });
      expect(mockFindAssigned).not.toHaveBeenCalled();
      expect(repo.deleteNodesByCampaignTx).not.toHaveBeenCalled();
      expect(repo.updateCampaignFieldsTx).toHaveBeenCalledTimes(1);
    });

    it('CHỦ thay node bằng tài khoản bất kỳ → qua, KHÔNG đọc bảng giao', async () => {
      await update(ownerUser, { nodes: [node('a', 'send_zalo_group', { zaloAccountId: 9 })] });
      expect(repo.insertNodeTx).toHaveBeenCalledTimes(1);
      expect(mockFindAssigned).not.toHaveBeenCalled();
    });

    it('FAIL-CLOSED: đọc bảng giao lỗi → nhân viên bị chặn', async () => {
      mockFindAssigned.mockRejectedValue(new Error('db down'));
      await expect(update(employeeUser, { nodes: [node('a', 'send_zalo_group', { zaloAccountId: 5 })] }))
        .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    });
  });

  describe('duplicateCampaign', () => {
    const originalNodes = (zaloAccountId) => [
      { id: 1, node_type: 'action', node_subtype: 'send_zalo_personal', node_name: 'Gửi', node_description: '', position_x: 0, position_y: 0, config: { zaloAccountId }, execution_order: 1 },
    ];
    const duplicate = (authUser) => campaignCrudService.duplicateCampaign({ authUser, campaignId: 7, campaignName: 'Bản sao' });

    it('nhân viên nhân bản chiến dịch có tài khoản CHƯA giao → 403, không tạo bản sao, ROLLBACK', async () => {
      repo.findNodesByCampaignIdTx.mockResolvedValue(originalNodes(9));
      await expect(duplicate(employeeUser)).rejects.toMatchObject({ statusCode: 403, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expect(repo.insertCampaignTx).not.toHaveBeenCalled();
      expect(repo.insertNodeTx).not.toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    });

    it('nhân viên nhân bản chiến dịch toàn tài khoản được giao → tạo bản sao với đúng node', async () => {
      repo.findNodesByCampaignIdTx.mockResolvedValue(originalNodes(5));
      const result = await duplicate(employeeUser);
      expect(result.id).toBe(99);
      expect(repo.insertNodeTx).toHaveBeenCalledTimes(1);
      expect(repo.insertNodeTx.mock.calls[0][1].config).toEqual({ zaloAccountId: 5 });
    });

    it('config đọc ra dạng CHUỖI JSON vẫn được kiểm (không bị bỏ qua)', async () => {
      repo.findNodesByCampaignIdTx.mockResolvedValue(originalNodes(9).map((row) => ({ ...row, config: JSON.stringify(row.config) })));
      await expect(duplicate(employeeUser)).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    });

    it('CHỦ nhân bản chiến dịch có tài khoản bất kỳ → qua, không đọc bảng giao', async () => {
      repo.findNodesByCampaignIdTx.mockResolvedValue(originalNodes(9));
      const result = await duplicate(ownerUser);
      expect(result.id).toBe(99);
      expect(mockFindAssigned).not.toHaveBeenCalled();
    });

    it('FAIL-CLOSED: đọc bảng giao lỗi → nhân viên bị chặn', async () => {
      mockFindAssigned.mockRejectedValue(new Error('db down'));
      repo.findNodesByCampaignIdTx.mockResolvedValue(originalNodes(5));
      await expect(duplicate(employeeUser)).rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expect(repo.insertCampaignTx).not.toHaveBeenCalled();
    });
  });
});

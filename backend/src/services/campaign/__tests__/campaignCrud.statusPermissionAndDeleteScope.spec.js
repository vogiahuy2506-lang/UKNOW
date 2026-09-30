import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockGetClient = jest.fn(async () => ({
  query: mockClientQuery,
  release: mockClientRelease,
}));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {
    getClient: mockGetClient,
    query: jest.fn(),
  },
}));

const mockFindCampaignByIdTx = jest.fn();
const mockHasRunningRunTx = jest.fn();
const mockUpdateCampaignFieldsTx = jest.fn();
const mockCountNodesByCampaignTx = jest.fn();
const mockFindNodesByCampaignIdTx = jest.fn();
const mockFindEmailTemplateAttachmentsTx = jest.fn();
const mockDeleteCampaignTx = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignByIdTx: mockFindCampaignByIdTx,
    hasRunningRunTx: mockHasRunningRunTx,
    updateCampaignFieldsTx: mockUpdateCampaignFieldsTx,
    countNodesByCampaignTx: mockCountNodesByCampaignTx,
    findNodesByCampaignIdTx: mockFindNodesByCampaignIdTx,
    findEmailTemplateAttachmentsTx: mockFindEmailTemplateAttachmentsTx,
    deleteCampaignTx: mockDeleteCampaignTx,
  },
}));

const { default: campaignCrudService } = await import('../campaignCrud.service.js');

const OWNER = { id: 10, role: 'user' };
const SUPER_ADMIN = { id: 1, role: 'admin' };

function employee(permissions) {
  return {
    id: 20,
    role: 'user',
    activeContext: { type: 'employee', ownerId: 10, membershipId: 5, permissions },
  };
}

describe('campaignCrudService.updateCampaign — đổi status cần campaigns_run với nhân viên', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindCampaignByIdTx.mockResolvedValue({ id: 7, status: 'draft', workspace_owner_id: 10 });
    mockHasRunningRunTx.mockResolvedValue(false);
    mockCountNodesByCampaignTx.mockResolvedValue(3);
    mockUpdateCampaignFieldsTx.mockImplementation(async (_client, { status }) => ({
      id: 7,
      campaign_name: 'C',
      status: status ?? 'draft',
    }));
  });

  it('nhân viên thiếu campaigns_run đặt status active → 403 PERMISSION_DENIED, không ghi DB', async () => {
    await expect(
      campaignCrudService.updateCampaign({
        campaignId: 7,
        authUser: employee({ campaigns_view: true, campaigns_create: true }),
        isContentUpdate: false,
        status: 'active',
      })
    ).rejects.toMatchObject({ statusCode: 403, code: 'PERMISSION_DENIED' });

    expect(mockUpdateCampaignFieldsTx).not.toHaveBeenCalled();
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
  });

  it('nhân viên thiếu campaigns_run đặt status lạ (không phải draft/paused) → 403', async () => {
    await expect(
      campaignCrudService.updateCampaign({
        campaignId: 7,
        authUser: employee({ campaigns_create: true }),
        isContentUpdate: false,
        status: 'pending_owner_approval',
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockUpdateCampaignFieldsTx).not.toHaveBeenCalled();
  });

  it('nhân viên CÓ campaigns_run đặt status active → được', async () => {
    const result = await campaignCrudService.updateCampaign({
      campaignId: 7,
      authUser: employee({ campaigns_create: true, campaigns_run: true }),
      isContentUpdate: false,
      status: 'active',
    });

    expect(result.status).toBe('active');
    expect(mockUpdateCampaignFieldsTx).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'active' }));
  });

  it.each([
    ['chủ workspace', OWNER],
    ['super admin', SUPER_ADMIN],
  ])('%s đặt status active → được', async (_label, authUser) => {
    const result = await campaignCrudService.updateCampaign({
      campaignId: 7,
      authUser,
      isContentUpdate: false,
      status: 'active',
    });
    expect(result.status).toBe('active');
  });

  it('nhân viên thiếu campaigns_run: sửa nội dung không kèm status, hoặc chuyển về draft/paused → được', async () => {
    const authUser = employee({ campaigns_create: true });

    await campaignCrudService.updateCampaign({ campaignId: 7, authUser, isContentUpdate: true, campaignName: 'Tên mới' });
    await campaignCrudService.updateCampaign({ campaignId: 7, authUser, isContentUpdate: false, status: 'paused' });
    await campaignCrudService.updateCampaign({ campaignId: 7, authUser, isContentUpdate: false, status: 'draft' });

    expect(mockUpdateCampaignFieldsTx).toHaveBeenCalledTimes(3);
  });

  it('nhân viên thiếu campaigns_run gửi lại đúng status hiện tại (active) → không coi là đổi trạng thái', async () => {
    mockFindCampaignByIdTx.mockResolvedValue({ id: 7, status: 'active', workspace_owner_id: 10 });

    await campaignCrudService.updateCampaign({
      campaignId: 7,
      authUser: employee({ campaigns_create: true }),
      isContentUpdate: false,
      status: 'active',
      campaignName: 'Đổi tên',
    });

    expect(mockUpdateCampaignFieldsTx).toHaveBeenCalled();
  });
});

describe('campaignCrudService.deleteCampaign — chỉ trả key trong không gian chủ chiến dịch', () => {
  let warnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockDeleteCampaignTx.mockResolvedValue(undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('bỏ key workspace khác trong config.attachments, trả ownerUserId của chiến dịch', async () => {
    mockFindCampaignByIdTx.mockResolvedValue({ id: 7, id_user: 10, workspace_owner_id: 10, status: 'draft' });
    mockFindNodesByCampaignIdTx.mockResolvedValue([
      {
        id: 1,
        config: {
          emailTemplateId: 3,
          attachments: [
            { key: 'uploads/10/quick-send/a.pdf' },
            { key: 'uploads/999/email_template/nan-nhan.pdf' },
            'https://app.example.com/uploads/999/khac.png',
          ],
        },
      },
    ]);
    mockFindEmailTemplateAttachmentsTx.mockResolvedValue([{ key: 'uploads/10/email_template/t.pdf' }]);

    const result = await campaignCrudService.deleteCampaign({ campaignId: 7, authUser: OWNER });

    expect(result).toEqual({
      fileKeysToDelete: ['uploads/10/email_template/t.pdf', 'uploads/10/quick-send/a.pdf'],
      ownerUserId: 10,
    });
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('super admin xoá chiến dịch của workspace khác → ownerUserId là chủ chiến dịch', async () => {
    mockFindCampaignByIdTx.mockResolvedValue({ id: 8, id_user: 77, workspace_owner_id: 77, status: 'draft' });
    mockFindNodesByCampaignIdTx.mockResolvedValue([
      { id: 2, config: { attachments: [{ key: 'uploads/77/a.pdf' }, { key: 'uploads/1/cua-admin.pdf' }] } },
    ]);

    const result = await campaignCrudService.deleteCampaign({ campaignId: 8, authUser: SUPER_ADMIN });

    expect(result).toEqual({ fileKeysToDelete: ['uploads/77/a.pdf'], ownerUserId: 77 });
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16.md — PR-3, Việc 1.
 *
 * createCampaignRunRecord nhận cờ autoActivate: khi chiến dịch 'draft'/'paused' VÀ
 * source !== 'schedule' VÀ autoActivate → tự chuyển sang 'active' trong CÙNG giao dịch chạy rồi
 * chạy tiếp, dùng khuôn giống activatePendingApprovalCampaignTx.
 *
 * Ràng buộc quan trọng nhất: lượt chạy từ LỊCH (source: 'schedule') không bao giờ được tự kích
 * hoạt — nếu không, chiến dịch vừa "Tạm dừng" sẽ bị chính lịch của nó bật lại, nút "Tạm dừng"
 * mất nghĩa. Test ca này canh kỹ nhất.
 */

const mockGetClient = jest.fn();
const mockFindCampaignForRunTx = jest.fn();
const mockHasActiveRunForCampaignTx = jest.fn();
const mockActivatePendingApprovalCampaignTx = jest.fn();
const mockActivateDraftOrPausedCampaignTx = jest.fn();
const mockInsertRunTx = jest.fn();
const mockUpdateRunName = jest.fn();
const mockValidateCampaignPreflight = jest.fn();

function buildStubClient() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
}

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: mockGetClient },
  isConnectionError: jest.fn(() => false),
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    findCampaignForRunTx: mockFindCampaignForRunTx,
    hasActiveRunForCampaignTx: mockHasActiveRunForCampaignTx,
    activatePendingApprovalCampaignTx: mockActivatePendingApprovalCampaignTx,
    activateDraftOrPausedCampaignTx: mockActivateDraftOrPausedCampaignTx,
    insertRunTx: mockInsertRunTx,
    updateRunName: mockUpdateRunName,
    findResumeSourceRunTx: jest.fn(),
  },
}));

jest.unstable_mockModule('../campaignPreflight.service.js', () => ({
  validateCampaignPreflight: mockValidateCampaignPreflight,
}));

// Phần còn lại của module không được createCampaignRunRecord dùng tới — stub rỗng để tránh nạp
// thật (kết nối DB/Redis/API bên ngoài) trong lúc chỉ test một hàm.
jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignFlow.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignNodeData.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/email/emailSettings.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/customer/customerMutation.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/customer/customerZaloTracking.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/zalo/zaloSetting.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../repositories/sendQuota.repository.js', () => ({ findStaleCampaignRunReservations: jest.fn() }));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({ checkSendQuota: jest.fn() }));
jest.unstable_mockModule('../../payment/topupWallet.service.js', () => ({ maybeDebitWalletForSend: jest.fn() }));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('campaignRunService.createCampaignRunRecord — autoActivate (PR-3)', () => {
  let stubClient;

  beforeEach(() => {
    jest.clearAllMocks();
    stubClient = buildStubClient();
    mockGetClient.mockResolvedValue(stubClient);
    mockHasActiveRunForCampaignTx.mockResolvedValue(false);
    mockValidateCampaignPreflight.mockResolvedValue({ valid: true });
    mockInsertRunTx.mockResolvedValue({ id: 555, status: 'running' });
    mockUpdateRunName.mockResolvedValue(undefined);
  });

  it("chiến dịch 'draft' + autoActivate + source người dùng ('campaign_run') → chạy được, campaign chuyển active", async () => {
    mockFindCampaignForRunTx.mockResolvedValue({
      id: 10,
      status: 'draft',
      workspace_owner_id: 1,
      campaign_name: 'Chiến dịch nháp',
    });
    mockActivateDraftOrPausedCampaignTx.mockResolvedValue({ id: 10, status: 'active' });

    const result = await campaignRunService.createCampaignRunRecord({
      campaignId: 10,
      workspaceOwnerId: 1,
      actorUserId: 1,
      isAdmin: false,
      source: 'campaign_run',
      autoActivate: true,
    });

    expect(result).toEqual(expect.objectContaining({ id: 555 }));
    expect(mockActivateDraftOrPausedCampaignTx).toHaveBeenCalledWith(stubClient, {
      campaignId: 10,
      isAdmin: false,
      workspaceOwnerId: 1,
    });
    expect(mockActivatePendingApprovalCampaignTx).not.toHaveBeenCalled();
    expect(mockInsertRunTx).toHaveBeenCalledTimes(1);
    expect(stubClient.query).toHaveBeenCalledWith('COMMIT');
    expect(stubClient.query).not.toHaveBeenCalledWith('ROLLBACK');
  });

  // Ca quan trọng nhất: lịch KHÔNG BAO GIỜ được tự kích hoạt — nếu không, "Tạm dừng" mất nghĩa.
  it("chiến dịch 'paused' + source 'schedule' + autoActivate=true → VẪN 400, KHÔNG tự kích hoạt", async () => {
    mockFindCampaignForRunTx.mockResolvedValue({
      id: 20,
      status: 'paused',
      workspace_owner_id: 1,
      campaign_name: 'Chiến dịch tạm dừng',
    });

    await expect(
      campaignRunService.createCampaignRunRecord({
        campaignId: 20,
        workspaceOwnerId: 1,
        actorUserId: 1,
        isAdmin: false,
        source: 'schedule',
        autoActivate: true,
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Chỉ có thể chạy chiến dịch đang hoạt động',
    });

    expect(mockActivateDraftOrPausedCampaignTx).not.toHaveBeenCalled();
    expect(mockInsertRunTx).not.toHaveBeenCalled();
    expect(stubClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it("autoActivate không truyền → giữ nguyên hành vi cũ, chiến dịch 'draft' vẫn 400", async () => {
    mockFindCampaignForRunTx.mockResolvedValue({
      id: 30,
      status: 'draft',
      workspace_owner_id: 1,
      campaign_name: 'Chiến dịch nháp cũ',
    });

    await expect(
      campaignRunService.createCampaignRunRecord({
        campaignId: 30,
        workspaceOwnerId: 1,
        actorUserId: 1,
        isAdmin: false,
        source: 'campaign_run',
        // autoActivate omitted — mặc định false
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Chỉ có thể chạy chiến dịch đang hoạt động',
    });

    expect(mockActivateDraftOrPausedCampaignTx).not.toHaveBeenCalled();
    expect(mockInsertRunTx).not.toHaveBeenCalled();
  });

  it("chiến dịch 'paused' + autoActivate + source người dùng → chạy được (không chỉ riêng draft)", async () => {
    mockFindCampaignForRunTx.mockResolvedValue({
      id: 40,
      status: 'paused',
      workspace_owner_id: 1,
      campaign_name: 'Chiến dịch tạm dừng',
    });
    mockActivateDraftOrPausedCampaignTx.mockResolvedValue({ id: 40, status: 'active' });

    const result = await campaignRunService.createCampaignRunRecord({
      campaignId: 40,
      workspaceOwnerId: 1,
      actorUserId: 1,
      isAdmin: false,
      source: 'campaign_run',
      autoActivate: true,
    });

    expect(result).toEqual(expect.objectContaining({ id: 555 }));
    expect(mockActivateDraftOrPausedCampaignTx).toHaveBeenCalledTimes(1);
  });

  it('chiến dịch đã active + autoActivate=true → không gọi activateDraftOrPausedCampaignTx (không cần)', async () => {
    mockFindCampaignForRunTx.mockResolvedValue({
      id: 50,
      status: 'active',
      workspace_owner_id: 1,
      campaign_name: 'Chiến dịch đang chạy được',
    });

    const result = await campaignRunService.createCampaignRunRecord({
      campaignId: 50,
      workspaceOwnerId: 1,
      actorUserId: 1,
      isAdmin: false,
      source: 'campaign_run',
      autoActivate: true,
    });

    expect(result).toEqual(expect.objectContaining({ id: 555 }));
    expect(mockActivateDraftOrPausedCampaignTx).not.toHaveBeenCalled();
  });
});

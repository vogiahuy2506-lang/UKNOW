import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26 PR-9 Việc 1 — pickFirstUsableZaloAccount() là helper
// dùng chung cho cả 3 chỗ (select_zalo_account pool, send_zalo_personal/send_zalo_friend_request
// nhiều tài khoản). Test trực tiếp method này, không dựng lại toàn bộ scaffold của
// campaignRunFailureNotifyEngine.spec.js — method không đụng DB/rate limiter, chỉ gọi
// getCampaignZaloAccount (đã mock) + resourceIsLocked (đã mock).

const mockGetCampaignZaloAccount = jest.fn();
const mockResourceIsLocked = jest.fn().mockResolvedValue(false);

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    getCampaignZaloAccount: mockGetCampaignZaloAccount,
  },
}));

jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: mockResourceIsLocked,
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('CampaignRunService.pickFirstUsableZaloAccount — PR-9 Việc 1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResourceIsLocked.mockResolvedValue(false);
  });

  it('[chết, sống] → bỏ qua id chết, trả về id sống', async () => {
    mockGetCampaignZaloAccount.mockImplementation(async ({ accountId }) => {
      if (accountId === '201') {
        throw new Error('Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng');
      }
      return { id: accountId, displayName: `Acc ${accountId}` };
    });

    const result = await campaignRunService.pickFirstUsableZaloAccount({
      ids: [201, 202],
      userId: 10,
      roleCode: 'user',
    });

    expect(result.id).toBe('202');
    expect(result.account).toEqual({ id: '202', displayName: 'Acc 202' });
    expect(mockGetCampaignZaloAccount).toHaveBeenCalledTimes(2);
  });

  it('[sống, chết] → dùng ngay id đầu, KHÔNG thử id thứ hai (giữ hành vi cũ khi tài khoản đầu vẫn sống)', async () => {
    mockGetCampaignZaloAccount.mockImplementation(async ({ accountId }) => {
      if (accountId === '201') return { id: '201', displayName: 'Acc 201' };
      throw new Error('Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng');
    });

    const result = await campaignRunService.pickFirstUsableZaloAccount({
      ids: [201, 202],
      userId: 10,
      roleCode: 'user',
    });

    expect(result.id).toBe('201');
    expect(mockGetCampaignZaloAccount).toHaveBeenCalledTimes(1);
  });

  it('[chết, chết] → ném lỗi của id ĐẦU TIÊN (giữ nguyên thông điệp hôm nay)', async () => {
    mockGetCampaignZaloAccount.mockImplementation(async ({ accountId }) => {
      throw new Error(`lỗi tài khoản ${accountId}`);
    });

    await expect(
      campaignRunService.pickFirstUsableZaloAccount({ ids: [201, 202], userId: 10, roleCode: 'user' })
    ).rejects.toThrow('lỗi tài khoản 201');
  });

  it('[khoá top-up, sống] → bỏ qua id bị khoá, dùng tài khoản sống', async () => {
    mockResourceIsLocked.mockImplementation(async (key, id) => key === 'zalo_accounts' && String(id) === '201');
    mockGetCampaignZaloAccount.mockImplementation(async ({ accountId }) => ({ id: accountId, displayName: `Acc ${accountId}` }));

    const result = await campaignRunService.pickFirstUsableZaloAccount({
      ids: [201, 202],
      userId: 10,
      roleCode: 'user',
    });

    expect(result.id).toBe('202');
    // Id bị khoá không được gọi getCampaignZaloAccount (bỏ qua sớm hơn).
    expect(mockGetCampaignZaloAccount).toHaveBeenCalledTimes(1);
    expect(mockGetCampaignZaloAccount).toHaveBeenCalledWith(expect.objectContaining({ accountId: '202' }));
  });

  it('danh sách rỗng → ném lỗi rõ ràng, không gọi getCampaignZaloAccount', async () => {
    await expect(
      campaignRunService.pickFirstUsableZaloAccount({ ids: [], userId: 10, roleCode: 'user' })
    ).rejects.toThrow('Chưa chọn tài khoản Zalo gửi');
    expect(mockGetCampaignZaloAccount).not.toHaveBeenCalled();
  });
});

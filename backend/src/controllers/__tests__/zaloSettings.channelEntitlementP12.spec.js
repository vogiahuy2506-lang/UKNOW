/**
 * P12 (PLAN_TG_WA_DAY_DU mục 19) — gửi nhanh Zalo (3 đường preview: cá nhân, nhóm, kết bạn) và gửi thử nghiệm Gửi nhanh
 * trả 403 CHANNEL_NOT_IN_PLAN khi gói của chủ workspace không có kênh Zalo; gói có Zalo (limit=1) đi tiếp như cũ.
 * Cổng chạy TRƯỚC hạn mức/tài khoản: các ca đỏ nếu ai đó đưa cổng ra sau `assertPreviewSendQuota`.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockAssertChannelEntitled = jest.fn();
const mockCheckSendQuota = jest.fn();

jest.unstable_mockModule('../../services/campaign/channelEntitlement.service.js', () => ({
  assertChannelEntitled: mockAssertChannelEntitled,
  default: { assertChannelEntitled: mockAssertChannelEntitled },
}));

const realSendLimit = await import('../../utils/userSendLimit.util.js');
jest.unstable_mockModule('../../utils/userSendLimit.util.js', () => ({
  ...realSendLimit,
  checkSendQuota: mockCheckSendQuota,
}));

const zaloSettingsController = (await import('../zaloSettings.controller.js')).default;
const campaignQuickSendService = (await import('../../services/campaign/campaignQuickSend.service.js')).default;

const planError = () => Object.assign(new Error('Gói của bạn không có kênh Zalo — mua thêm slot ở mục Nạp thêm hoặc nâng gói.'), {
  status: 403, statusCode: 403, code: 'CHANNEL_NOT_IN_PLAN',
});

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('P12 — 403 CHANNEL_NOT_IN_PLAN ở gửi nhanh Zalo', () => {
  let resolveSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    resolveSpy = jest.spyOn(zaloSettingsController, 'resolvePreviewAccountAndApi').mockRejectedValue(new Error('stop-after-gate'));
  });

  const cases = [
    ['previewSendPersonalMessage', { accountId: 5, recipients: ['0900000001'], message: 'hi' }],
    ['previewSendGroupMessage', { accountId: 5, groupIds: ['g1'], message: 'hi' }],
    ['previewSendFriendRequest', { accountId: 5, recipients: ['0900000001'], message: 'hi' }],
  ];

  it.each(cases)('%s: gói không có Zalo -> 403 + code, không chạm hạn mức/tài khoản', async (method, body) => {
    mockAssertChannelEntitled.mockRejectedValueOnce(planError());
    const res = makeRes();
    await zaloSettingsController[method]({ user: { id: 7, role: 'user' }, body, headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'CHANNEL_NOT_IN_PLAN' }));
    expect(mockAssertChannelEntitled).toHaveBeenCalledWith(expect.objectContaining({ channel: 'zalo', ownerUserId: 7 }));
    expect(mockCheckSendQuota).not.toHaveBeenCalled();
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it.each(cases)('%s: gói có Zalo (limit=1 -> cổng qua) -> đi tiếp tới hạn mức/tài khoản', async (method, body) => {
    mockAssertChannelEntitled.mockResolvedValueOnce(undefined);
    const res = makeRes();
    await zaloSettingsController[method]({ user: { id: 7, role: 'user' }, body, headers: {} }, res);
    expect(resolveSpy).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('nhân viên: cổng tính theo CHỦ workspace (ownerUserId = chủ, role để trống cho service tự tra)', async () => {
    mockAssertChannelEntitled.mockRejectedValueOnce(planError());
    const employee = { id: 90, role: 'admin', activeContext: { type: 'employee', ownerId: 12, membershipId: 4 } };
    await zaloSettingsController.previewSendPersonalMessage(
      { user: employee, body: cases[0][1], headers: {} }, makeRes()
    );
    expect(mockAssertChannelEntitled).toHaveBeenCalledWith({ channel: 'zalo', ownerUserId: 12, roleCode: undefined });
  });

  it('gửi thử nghiệm Gửi nhanh (test-send) kênh zalo: gói không có Zalo -> ném 403 CHANNEL_NOT_IN_PLAN trước giờ yên lặng/tài khoản', async () => {
    mockAssertChannelEntitled.mockRejectedValueOnce(planError());
    await expect(campaignQuickSendService.sendQuickTestMessage({
      actorUserId: 7, workspaceOwnerId: 7, roleCode: 'user', channel: 'zalo_personal', recipient: '0900000001', message: 'hi', accountId: 5,
    })).rejects.toMatchObject({ status: 403, code: 'CHANNEL_NOT_IN_PLAN' });
    expect(resolveSpy).not.toHaveBeenCalled();
  });
});

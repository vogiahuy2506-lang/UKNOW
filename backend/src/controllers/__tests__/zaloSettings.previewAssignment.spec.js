/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — 5 route `/api/zalo/preview/*` và gửi thử Gửi nhanh chỉ dùng tài khoản
 * Zalo ĐƯỢC GIAO cho người bấm. Chạy controller + `getCampaignZaloAccount` THẬT; chỉ mock bảng giao, repo tài khoản và
 * tầng gửi. Mỗi route: nhân viên chưa giao → 403 + code, KHÔNG chạm repo tài khoản / phiên Zalo; được giao → đi tiếp;
 * CHỦ luôn đi tiếp (không đọc việc giao); lỗi đọc việc giao → chặn.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindAssigned = jest.fn();
const mockCheckSendQuota = jest.fn();

const realMemberRepo = await import('../../repositories/user/memberChannelAccount.repository.js');
jest.unstable_mockModule('../../repositories/user/memberChannelAccount.repository.js', () => ({
  ...realMemberRepo,
  findAssignedZaloAccountIds: mockFindAssigned,
}));

const realEntitlement = await import('../../services/campaign/channelEntitlement.service.js');
jest.unstable_mockModule('../../services/campaign/channelEntitlement.service.js', () => ({
  ...realEntitlement,
  assertChannelEntitled: jest.fn().mockResolvedValue(undefined),
  default: { ...realEntitlement.default, assertChannelEntitled: jest.fn().mockResolvedValue(undefined) },
}));

const realSendLimit = await import('../../utils/userSendLimit.util.js');
jest.unstable_mockModule('../../utils/userSendLimit.util.js', () => ({
  ...realSendLimit,
  checkSendQuota: mockCheckSendQuota,
}));

const campaignZaloSenderRepository = (await import('../../repositories/campaign/campaignZaloSender.repository.js')).default;
const campaignZaloSenderService = (await import('../../services/campaign/campaignZaloSender.service.js')).default;
const campaignQuickSendService = (await import('../../services/campaign/campaignQuickSend.service.js')).default;
const campaignRunService = (await import('../../services/campaign/campaignRun.service.js')).default;
const zaloSettingsController = (await import('../zaloSettings.controller.js')).default;

const owner = { id: 10, role: 'user' };
const employee = {
  id: 20,
  role: 'user',
  activeContext: { type: 'employee', ownerId: 10, membershipId: 3, permissions: { zalo_settings: true, campaigns_create: true } },
};
const superAdmin = { id: 1, role: 'admin' };
const READY_ROW = { id: 5, id_user: 10, display_name: 'Nick 5', status: 'connected', is_active: true, is_default: false };

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
const jsonOf = (res) => res.json.mock.calls[0][0];

const ROUTES = [
  ['previewSendPersonalMessage', 'body', { accountId: 5, recipients: ['0900000001'], message: 'hi' }],
  ['previewSendFriendRequest', 'body', { accountId: 5, recipients: ['0900000001'], message: 'hi' }],
  ['previewSendGroupMessage', 'body', { accountId: 5, groupIds: ['g1'], message: 'hi' }],
  ['previewGetAllFriends', 'query', { accountId: 5 }],
  ['previewGetAllGroups', 'query', { accountId: 5 }],
];

const buildReq = (user, slot, payload) => ({ user, headers: {}, body: slot === 'body' ? payload : {}, query: slot === 'query' ? payload : {} });

describe('preview Zalo + gửi thử Gửi nhanh — tài khoản được giao (G3)', () => {
  let findAccountSpy;
  let apiSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockFindAssigned.mockResolvedValue([5]);
    findAccountSpy = jest.spyOn(campaignZaloSenderRepository, 'findCampaignZaloAccount').mockResolvedValue(READY_ROW);
    // Dừng ngay sau cổng tài khoản: "đi tiếp" nghĩa là tới được bước mở phiên Zalo.
    apiSpy = jest.spyOn(campaignZaloSenderService, 'getConnectedApiOrSyncStatus').mockRejectedValue(new Error('stop-after-gate'));
  });

  describe.each(ROUTES)('%s', (method, slot, payload) => {
    it('nhân viên CHƯA được giao tài khoản → 403 ZALO_ACCOUNT_NOT_ASSIGNED, không chạm repo tài khoản / phiên Zalo', async () => {
      mockFindAssigned.mockResolvedValue([6, 7]);
      const res = makeRes();
      await zaloSettingsController[method](buildReq(employee, slot, payload), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(jsonOf(res)).toEqual(expect.objectContaining({
        success: false,
        code: 'ZALO_ACCOUNT_NOT_ASSIGNED',
        message: 'Tài khoản Zalo này chưa được giao cho bạn.',
      }));
      expect(mockFindAssigned).toHaveBeenCalledWith(10, 20);
      expect(findAccountSpy).not.toHaveBeenCalled();
      expect(apiSpy).not.toHaveBeenCalled();
    });

    it('nhân viên chưa được giao tài khoản NÀO ([]) → 403', async () => {
      mockFindAssigned.mockResolvedValue([]);
      const res = makeRes();
      await zaloSettingsController[method](buildReq(employee, slot, payload), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(jsonOf(res).code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
      expect(apiSpy).not.toHaveBeenCalled();
    });

    it('FAIL-CLOSED: đọc bảng giao lỗi → 403, không chạm phiên Zalo', async () => {
      mockFindAssigned.mockRejectedValue(new Error('db down'));
      const res = makeRes();
      await zaloSettingsController[method](buildReq(employee, slot, payload), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(jsonOf(res).code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
      expect(apiSpy).not.toHaveBeenCalled();
    });

    it('nhân viên ĐƯỢC giao tài khoản 5 → đi tiếp tới bước mở phiên Zalo (repo tra theo id CHỦ)', async () => {
      const res = makeRes();
      await zaloSettingsController[method](buildReq(employee, slot, payload), res);

      expect(findAccountSpy).toHaveBeenCalledWith(5, 10, false);
      expect(apiSpy).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it('CHỦ thấy hết: đi tiếp, KHÔNG đọc bảng giao', async () => {
      mockFindAssigned.mockResolvedValue([]);
      const res = makeRes();
      await zaloSettingsController[method](buildReq(owner, slot, payload), res);

      expect(mockFindAssigned).not.toHaveBeenCalled();
      expect(findAccountSpy).toHaveBeenCalledWith(5, 10, false);
      expect(apiSpy).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it('super admin: đi tiếp, không bị lọc', async () => {
      const res = makeRes();
      await zaloSettingsController[method](buildReq(superAdmin, slot, payload), res);
      expect(mockFindAssigned).not.toHaveBeenCalled();
      expect(apiSpy).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(403);
    });
  });

  describe('previewSendPersonalMessage — thứ tự báo lỗi: tài khoản được giao TRƯỚC hạn mức', () => {
    const body = { accountId: 5, recipients: ['0900000001'], message: 'hi' };
    const quotaExceeded = { allowed: false, message: 'Đã vượt hạn mức gửi Zalo' };

    it('nhân viên dùng TK KHÔNG được giao lúc HẾT hạn mức → 403 ZALO_ACCOUNT_NOT_ASSIGNED (không phải SEND_QUOTA_EXCEEDED)', async () => {
      mockFindAssigned.mockResolvedValue([6]);
      mockCheckSendQuota.mockResolvedValue(quotaExceeded);
      const res = makeRes();
      await zaloSettingsController.previewSendPersonalMessage(buildReq(employee, 'body', body), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(jsonOf(res).code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
      expect(mockCheckSendQuota).not.toHaveBeenCalled();
    });

    it('ĐỐI CHỨNG: chủ dùng TK hợp lệ lúc hết hạn mức vẫn nhận SEND_QUOTA_EXCEEDED', async () => {
      apiSpy.mockResolvedValue({});
      mockCheckSendQuota.mockResolvedValue(quotaExceeded);
      const res = makeRes();
      await zaloSettingsController.previewSendPersonalMessage(buildReq(owner, 'body', body), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(jsonOf(res).code).toBe('SEND_QUOTA_EXCEEDED');
    });
  });

  describe('resolvePreviewAccountAndApi — người gọi quên truyền ngữ cảnh', () => {
    it('FAIL-CLOSED: thiếu workspaceContext và accessibleAccountIds → chặn (không phải "không lọc")', async () => {
      await expect(zaloSettingsController.resolvePreviewAccountAndApi({ userId: 10, roleCode: 'user', accountId: 5 }))
        .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED', statusCode: 403 });
      expect(findAccountSpy).not.toHaveBeenCalled();
    });

    it('accessibleAccountIds đã tính sẵn (null) thắng ngữ cảnh: không đọc bảng giao', async () => {
      apiSpy.mockResolvedValue({});
      const result = await zaloSettingsController.resolvePreviewAccountAndApi({
        userId: 10, roleCode: 'user', accountId: 5, accessibleAccountIds: null,
      });
      expect(String(result.account.id)).toBe('5');
      expect(mockFindAssigned).not.toHaveBeenCalled();
    });
  });

  describe('gửi thử Gửi nhanh (campaignQuickSendService.sendQuickTestMessage, kênh Zalo)', () => {
    const employeeCtx = { actorUserId: 20, workspaceOwnerId: 10, contextType: 'employee', isSuperAdmin: false, roleCode: 'user' };
    const ownerCtx = { actorUserId: 10, workspaceOwnerId: 10, contextType: 'self', isSuperAdmin: false, roleCode: 'user' };
    const base = { actorUserId: 20, workspaceOwnerId: 10, roleCode: 'user', channel: 'zalo_personal', recipient: '0900000001', message: 'hi' };
    let resolveSpy;
    beforeEach(() => {
      jest.spyOn(campaignRunService.zaloRateLimiter, 'computeNextAllowedSendAtByQuietHours').mockReturnValue(null);
      resolveSpy = jest.spyOn(zaloSettingsController, 'resolvePreviewAccountAndApi').mockRejectedValue(new Error('stop-after-gate'));
    });

    it('nhân viên CHƯA được giao → ném 403 ZALO_ACCOUNT_NOT_ASSIGNED, không tới bước tài khoản', async () => {
      mockFindAssigned.mockResolvedValue([6]);
      await expect(campaignQuickSendService.sendQuickTestMessage({ ...base, accountId: 5, workspaceContext: employeeCtx }))
        .rejects.toMatchObject({ status: 403, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expect(resolveSpy).not.toHaveBeenCalled();
    });

    it('nhân viên ĐƯỢC giao → qua cổng, resolver nhận đúng danh sách đã tính', async () => {
      await expect(campaignQuickSendService.sendQuickTestMessage({ ...base, accountId: 5, workspaceContext: employeeCtx }))
        .rejects.toThrow('stop-after-gate');
      expect(resolveSpy).toHaveBeenCalledWith(expect.objectContaining({ accountId: 5, accessibleAccountIds: [5] }));
    });

    it('CHỦ → qua cổng với accessibleAccountIds = null, không đọc bảng giao', async () => {
      await expect(campaignQuickSendService.sendQuickTestMessage({
        ...base, actorUserId: 10, accountId: 5, workspaceContext: ownerCtx,
      })).rejects.toThrow('stop-after-gate');
      expect(mockFindAssigned).not.toHaveBeenCalled();
      expect(resolveSpy).toHaveBeenCalledWith(expect.objectContaining({ accessibleAccountIds: null }));
    });

    it('FAIL-CLOSED: gọi nội bộ quên truyền workspaceContext → chặn, kể cả khi người gọi là chủ', async () => {
      await expect(campaignQuickSendService.sendQuickTestMessage({ ...base, actorUserId: 10, accountId: 5 }))
        .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expect(resolveSpy).not.toHaveBeenCalled();
    });

    it('FAIL-CLOSED: đọc bảng giao lỗi → nhân viên bị chặn', async () => {
      mockFindAssigned.mockRejectedValue(new Error('db down'));
      await expect(campaignQuickSendService.sendQuickTestMessage({ ...base, accountId: 5, workspaceContext: employeeCtx }))
        .rejects.toMatchObject({ code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    });

    it('endpoint POST /campaigns/quick-send/test-send: nhân viên chưa giao → 403 + code (controller truyền workspaceContext)', async () => {
      mockFindAssigned.mockResolvedValue([6]);
      const campaignController = (await import('../campaign.controller.js')).default;
      const res = makeRes();
      await campaignController.testSendQuickCampaign({
        user: employee, headers: {}, body: { channel: 'zalo_personal', recipient: '0900000001', message: 'hi', accountId: 5 },
      }, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(jsonOf(res)).toEqual(expect.objectContaining({ success: false, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' }));
      expect(resolveSpy).not.toHaveBeenCalled();
    });

    it('endpoint test-send: CHỦ qua cổng, tới bước tài khoản', async () => {
      const campaignController = (await import('../campaign.controller.js')).default;
      const res = makeRes();
      await campaignController.testSendQuickCampaign({
        user: owner, headers: {}, body: { channel: 'zalo_personal', recipient: '0900000001', message: 'hi', accountId: 5 },
      }, res);
      expect(mockFindAssigned).not.toHaveBeenCalled();
      expect(resolveSpy).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it('kênh EMAIL không đụng tới bảng giao (không đổi hành vi email)', async () => {
      // Email đi nhánh riêng, không có workspaceContext cũng không bị chặn bởi cổng Zalo.
      const emailSmtp = (await import('../../services/email/emailSettingsSmtp.service.js')).default;
      const sendSpy = jest.spyOn(emailSmtp, 'sendCustomEmail').mockResolvedValue({ to: 'a@b.c' });
      await campaignQuickSendService.sendQuickTestMessage({
        actorUserId: 20, workspaceOwnerId: 10, roleCode: 'user', channel: 'email', recipient: 'a@b.c', message: 'hi', accountId: 3,
      });
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(mockFindAssigned).not.toHaveBeenCalled();
    });
  });
});

/**
 * PLAN_ZALO_TU_DONG_DONG_Y_KET_BAN_2026-10-17 Việc 6 — PATCH /api/zalo/accounts/:id/auto-accept-friends.
 *
 * `sweepAccount` được mock: nếu để chạy thật thì lượt quét (chờ giãn cách, ghi DB) trôi nổi sang bài test sau
 * (memory feedback_fire_and_forget_lam_ban_test_sau).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindAssigned = jest.fn();

const realMemberRepo = await import('../../repositories/user/memberChannelAccount.repository.js');
jest.unstable_mockModule('../../repositories/user/memberChannelAccount.repository.js', () => ({
  ...realMemberRepo,
  findAssignedZaloAccountIds: mockFindAssigned,
}));

const zaloSettingRepository = (await import('../../repositories/zalo/zaloSetting.repository.js')).default;
const auditService = (await import('../../services/audit.service.js')).default;
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = await import('../../services/audit.service.js');
const zaloFriendAutoAcceptService = (await import('../../services/zalo/zaloFriendAutoAccept.service.js')).default;
const controller = (await import('../zaloSettings.controller.js')).default;

const owner = { id: 10, role: 'user' };
const employee = { id: 20, role: 'user', activeContext: { type: 'employee', ownerId: 10, membershipId: 3, permissions: { zalo_settings: true } } };
const superAdmin = { id: 1, role: 'admin' };

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
const jsonOf = (res) => res.json.mock.calls[0][0];
const reqOf = (user, id, body) => ({ user, params: { id: String(id) }, body, ip: '1.1.1.1', get: () => 'jest' });

function row(id, extra = {}) {
  return {
    id, id_user: 10, display_name: `Zalo ${id}`, zalo_user_id: `u${id}`, zalo_name: '', zalo_phone: '',
    login_method: 'qr', status: 'connected', is_active: true, is_default: false, notes: null,
    updated_at: null, last_connected_at: null, restore_fail_count: 0, auto_accept_friend_requests: false, ...extra,
  };
}

describe('zaloSettings.controller — updateAutoAcceptFriendRequests', () => {
  let updateSpy;
  let previousSpy;
  let auditSpy;
  let sweepSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFindAssigned.mockResolvedValue([5]);
    updateSpy = jest.spyOn(zaloSettingRepository, 'updateAutoAcceptFriendRequests')
      .mockImplementation(async (accountId, _isAdmin, _userId, enabled) => row(accountId, { auto_accept_friend_requests: enabled }));
    previousSpy = jest.spyOn(zaloSettingRepository, 'isAutoAcceptEnabled').mockResolvedValue(false);
    auditSpy = jest.spyOn(auditService, 'log').mockResolvedValue(undefined);
    sweepSpy = jest.spyOn(zaloFriendAutoAcceptService, 'sweepAccount').mockResolvedValue({ accepted: 0 });
  });

  it('BẬT -> 200, trả autoAcceptFriendRequests: true, repo nhận (id, isAdmin, chủ, true)', async () => {
    const res = makeRes();
    await controller.updateAutoAcceptFriendRequests(reqOf(owner, 5, { enabled: true }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledWith(5, false, 10, true);
    const body = jsonOf(res);
    expect(body.success).toBe(true);
    expect(body.data.autoAcceptFriendRequests).toBe(true);
    expect(body.data.id).toBe(5);
  });

  it('BẬT -> kích sweepAccount NGAY (reason "enabled") mà không đợi nó xong', async () => {
    let finishSweep;
    sweepSpy.mockImplementation(() => new Promise((resolve) => { finishSweep = resolve; }));
    const res = makeRes();

    await controller.updateAutoAcceptFriendRequests(reqOf(owner, 5, { enabled: true }), res);

    expect(sweepSpy).toHaveBeenCalledTimes(1);
    expect(sweepSpy).toHaveBeenCalledWith(5, { reason: 'enabled' });
    // Response đã trả trong khi sweep còn treo -> không await.
    expect(jsonOf(res).success).toBe(true);
    finishSweep({ accepted: 0 });
  });

  it('TẮT -> 200, autoAcceptFriendRequests: false, KHÔNG gọi sweepAccount', async () => {
    previousSpy.mockResolvedValue(true);
    const res = makeRes();
    await controller.updateAutoAcceptFriendRequests(reqOf(owner, 5, { enabled: false }), res);

    expect(updateSpy).toHaveBeenCalledWith(5, false, 10, false);
    expect(jsonOf(res).data.autoAcceptFriendRequests).toBe(false);
    expect(sweepSpy).not.toHaveBeenCalled();
  });

  it('sweepAccount từ chối (hoặc mock trả undefined) -> request vẫn 200, lỗi chỉ ghi log', async () => {
    sweepSpy.mockRejectedValueOnce(new Error('Zalo down'));
    const res = makeRes();
    await controller.updateAutoAcceptFriendRequests(reqOf(owner, 5, { enabled: true }), res);
    await new Promise((resolve) => { setImmediate(resolve); });

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(jsonOf(res).success).toBe(true);
    expect(console.error).toHaveBeenCalledWith('[ZaloAutoAccept] sweep sau khi bật công tắc lỗi:', 'Zalo down');

    sweepSpy.mockReturnValueOnce(undefined);
    const res2 = makeRes();
    await controller.updateAutoAcceptFriendRequests(reqOf(owner, 5, { enabled: true }), res2);
    expect(res2.status).not.toHaveBeenCalledWith(500);
  });

  it.each([
    ['thiếu enabled', {}],
    ['enabled null', { enabled: null }],
    ['enabled là chuỗi "true"', { enabled: 'true' }],
    ['enabled là số 1', { enabled: 1 }],
  ])('%s -> 400, repo/audit/sweep không bị gọi', async (_label, body) => {
    const res = makeRes();
    await controller.updateAutoAcceptFriendRequests(reqOf(owner, 5, body), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(auditSpy).not.toHaveBeenCalled();
    expect(sweepSpy).not.toHaveBeenCalled();
  });

  it('nick của người khác / không tồn tại (repo trả null) -> 404, không audit, không sweep', async () => {
    updateSpy.mockResolvedValue(null);
    const res = makeRes();
    await controller.updateAutoAcceptFriendRequests(reqOf(owner, 999, { enabled: true }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(jsonOf(res)).toEqual({ success: false, message: 'Không tìm thấy tài khoản Zalo' });
    expect(auditSpy).not.toHaveBeenCalled();
    expect(sweepSpy).not.toHaveBeenCalled();
  });

  it('ghi audit ZALO_ACCOUNT_AUTO_ACCEPT_FRIENDS_UPDATED với previous/next', async () => {
    previousSpy.mockResolvedValue(false);
    await controller.updateAutoAcceptFriendRequests(reqOf(owner, 5, { enabled: true }), makeRes());

    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      userId: 10,
      ownerId: 10,
      category: 'workspace',
      action: AUDIT_ACTIONS.ZALO_ACCOUNT_AUTO_ACCEPT_FRIENDS_UPDATED,
      entityType: AUDIT_ENTITY_TYPES.ZALO_SETTING,
      entityId: 5,
      details: { previous: false, next: true },
    }));
    expect(AUDIT_ACTIONS.ZALO_ACCOUNT_AUTO_ACCEPT_FRIENDS_UPDATED).toBe('ZALO_ACCOUNT_AUTO_ACCEPT_FRIENDS_UPDATED');
  });

  it('super admin: repo nhận isAdmin = true', async () => {
    await controller.updateAutoAcceptFriendRequests(reqOf(superAdmin, 5, { enabled: true }), makeRes());
    expect(updateSpy).toHaveBeenCalledWith(5, true, 1, true);
  });

  it('nhân viên CHƯA được giao nick -> 403 ZALO_ACCOUNT_NOT_ASSIGNED, không đụng repo', async () => {
    const res = makeRes();
    await controller.updateAutoAcceptFriendRequests(reqOf(employee, 9, { enabled: true }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(jsonOf(res).code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    expect(updateSpy).not.toHaveBeenCalled();
    expect(sweepSpy).not.toHaveBeenCalled();
  });

  it('nhân viên ĐƯỢC giao nick -> qua cổng, repo nhận chủ không gian (10) chứ không phải nhân viên (20)', async () => {
    const res = makeRes();
    await controller.updateAutoAcceptFriendRequests(reqOf(employee, 5, { enabled: true }), res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(updateSpy).toHaveBeenCalledWith(5, false, 10, true);
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: 20, ownerId: 10 }));
  });

  it('lỗi DB bất ngờ -> 500 và KHÔNG kích sweep', async () => {
    updateSpy.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    await controller.updateAutoAcceptFriendRequests(reqOf(owner, 5, { enabled: true }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(sweepSpy).not.toHaveBeenCalled();
  });
});

describe('zaloSettings.controller — mapRow trả autoAcceptFriendRequests', () => {
  it('cột true -> true; false / thiếu cột (RETURNING cũ) -> false, luôn là boolean', () => {
    expect(controller.mapRow(row(5, { auto_accept_friend_requests: true })).autoAcceptFriendRequests).toBe(true);
    expect(controller.mapRow(row(5, { auto_accept_friend_requests: false })).autoAcceptFriendRequests).toBe(false);
    const legacy = row(5);
    delete legacy.auto_accept_friend_requests;
    expect(controller.mapRow(legacy).autoAcceptFriendRequests).toBe(false);
  });
});

/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G1 — nhân viên chỉ thấy / đụng được tài khoản Zalo được giao.
 * Mỗi endpoint nhận `:id` tài khoản có ca "nhân viên chưa được giao → 403, repo KHÔNG bị gọi" và ca "chủ qua".
 * Ca nào cũng có "chủ thấy hết" để không phá chủ.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindAssigned = jest.fn();
const mockInsertSelfLogin = jest.fn();
const mockCountAssigned = jest.fn();

const realMemberRepo = await import('../../repositories/user/memberChannelAccount.repository.js');
jest.unstable_mockModule('../../repositories/user/memberChannelAccount.repository.js', () => ({
  ...realMemberRepo,
  findAssignedZaloAccountIds: mockFindAssigned,
  insertSelfLoginZaloAssignment: mockInsertSelfLogin,
  countAssignedEmployeesByZaloAccount: mockCountAssigned,
}));

const realResourceLimit = await import('../../utils/userResourceLimit.util.js');
jest.unstable_mockModule('../../utils/userResourceLimit.util.js', () => ({
  ...realResourceLimit,
  enforceResourceLimitTx: jest.fn().mockResolvedValue(undefined),
}));

const db = (await import('../../config/database.js')).default;
const zaloSettingRepository = (await import('../../repositories/zalo/zaloSetting.repository.js')).default;
const campaignZaloSenderService = (await import('../../services/campaign/campaignZaloSender.service.js')).default;
const zaloOneWorkspaceService = (await import('../../services/zalo/zaloOneWorkspace.service.js')).default;
const zaloAccountSessionService = (await import('../../services/zalo/zaloAccountSession.service.js')).default;
const zaloPersonalAdapter = (await import('../../services/chatbot/channelAdapters/zaloPersonal.adapter.js')).default;
const zaloPersonalInboxService = (await import('../../services/chatbot/zaloInbox.service.js')).default;
const controller = (await import('../zaloSettings.controller.js')).default;

const owner = { id: 10, role: 'user' };
const employee = { id: 20, role: 'user', activeContext: { type: 'employee', ownerId: 10, membershipId: 3, permissions: { zalo_settings: true } } };
const superAdmin = { id: 1, role: 'admin' };

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}
const jsonOf = (res) => res.json.mock.calls[0][0];

function row(id, extra = {}) {
  return {
    id, id_user: 10, display_name: `Zalo ${id}`, zalo_user_id: `u${id}`, zalo_name: '', zalo_phone: '',
    login_method: 'qr', status: 'connected', is_active: true, is_default: false, notes: null,
    updated_at: null, last_connected_at: null, restore_fail_count: 0, ...extra,
  };
}

describe('zaloSettings.controller — giao tài khoản Zalo cho nhân viên (G1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFindAssigned.mockResolvedValue([5]);
    mockCountAssigned.mockResolvedValue(new Map());
    jest.spyOn(campaignZaloSenderService, 'findAccountsMissingLiveSession').mockReturnValue(new Set());
    jest.spyOn(zaloAccountSessionService, 'clearAccountApi').mockImplementation(() => {});
    jest.spyOn(zaloPersonalAdapter, 'removeMessageHandler').mockImplementation(() => {});
    jest.spyOn(zaloPersonalInboxService, 'forgetAccount').mockImplementation(() => {});
  });

  describe('GET /accounts (getAccounts)', () => {
    it('nhân viên: repo nhận đúng mảng id được giao; số nhân viên được giao bị ẩn (null)', async () => {
      const listSpy = jest.spyOn(zaloSettingRepository, 'findAccountsList').mockResolvedValue([row(5)]);
      mockCountAssigned.mockResolvedValue(new Map([[5, 3]]));
      const res = makeRes();
      await controller.getAccounts({ user: employee }, res);

      expect(listSpy).toHaveBeenCalledWith(false, 10, [5]);
      expect(mockCountAssigned).not.toHaveBeenCalled();
      const items = jsonOf(res).data.items;
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe(5);
      expect(items[0].assignedEmployeeCount).toBeNull();
    });

    it('nhân viên chưa được giao gì: repo nhận [] (không phải null)', async () => {
      mockFindAssigned.mockResolvedValue([]);
      const listSpy = jest.spyOn(zaloSettingRepository, 'findAccountsList').mockResolvedValue([]);
      await controller.getAccounts({ user: employee }, makeRes());
      expect(listSpy).toHaveBeenCalledWith(false, 10, []);
    });

    it('FAIL-CLOSED: lỗi đọc bảng giao → repo nhận [] (không bao giờ null)', async () => {
      mockFindAssigned.mockRejectedValue(new Error('db down'));
      const listSpy = jest.spyOn(zaloSettingRepository, 'findAccountsList').mockResolvedValue([]);
      await controller.getAccounts({ user: employee }, makeRes());
      expect(listSpy).toHaveBeenCalledWith(false, 10, []);
    });

    it('CHỦ thấy hết: repo nhận null, giữ số nhân viên được giao', async () => {
      const listSpy = jest.spyOn(zaloSettingRepository, 'findAccountsList').mockResolvedValue([row(5), row(6)]);
      mockCountAssigned.mockResolvedValue(new Map([[5, 2]]));
      const res = makeRes();
      await controller.getAccounts({ user: owner }, res);

      expect(listSpy).toHaveBeenCalledWith(false, 10, null);
      expect(mockFindAssigned).not.toHaveBeenCalled();
      const items = jsonOf(res).data.items;
      expect(items.map((i) => i.id)).toEqual([5, 6]);
      expect(items.map((i) => i.assignedEmployeeCount)).toEqual([2, 0]);
    });

    it('CHỦ: đếm nhân viên được giao lỗi → vẫn trả đủ danh sách, số nhân viên null (không làm hỏng danh sách)', async () => {
      jest.spyOn(zaloSettingRepository, 'findAccountsList').mockResolvedValue([row(5), row(6)]);
      mockCountAssigned.mockRejectedValue(new Error('relation does not exist'));
      const res = makeRes();
      await controller.getAccounts({ user: owner }, res);

      expect(res.status).not.toHaveBeenCalled();
      const items = jsonOf(res).data.items;
      expect(items.map((i) => i.id)).toEqual([5, 6]);
      expect(items.map((i) => i.assignedEmployeeCount)).toEqual([null, null]);
    });

    it('super admin thấy hết: isAdmin=true, null', async () => {
      const listSpy = jest.spyOn(zaloSettingRepository, 'findAccountsList').mockResolvedValue([]);
      await controller.getAccounts({ user: superAdmin }, makeRes());
      expect(listSpy).toHaveBeenCalledWith(true, 1, null);
    });
  });

  describe('endpoint nhận :id tài khoản — nhân viên chưa được giao bị 403, repo không bị gọi', () => {
    const body = { userDailySendLimit: 50, sendSpeed: 'safe' };
    const cases = [
      ['deleteAccount (DELETE /accounts/:id)', 'deleteAccount', 'deleteAccount'],
      ['updateSendLimit (PATCH /accounts/:id/send-limit)', 'updateSendLimit', 'updateSendLimit'],
      ['updateSendSpeed (PATCH /accounts/:id/send-speed)', 'updateSendSpeed', 'updateSendSpeed'],
      ['retryRestore (POST /accounts/:id/retry-restore)', 'retryRestore', 'findAccountForRestore'],
      ['restoreAccountSessionByCookie (POST /accounts/:id/restore-session, /restore-session-by-cookie)', 'restoreAccountSessionByCookie', 'findAccountForRestore'],
    ];

    it.each(cases)('%s: nhân viên chưa được giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED', async (_label, method, repoMethod) => {
      const repoSpy = jest.spyOn(zaloSettingRepository, repoMethod).mockResolvedValue(null);
      const sideSpy = jest.spyOn(zaloSettingRepository, 'findUserDailySendLimitById').mockResolvedValue(null);
      const res = makeRes();
      await controller[method]({ user: employee, params: { id: '9' }, body, ip: '1.1.1.1', get: () => null }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(jsonOf(res)).toEqual({ success: false, message: 'Tài khoản Zalo này chưa được giao cho bạn.', code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
      expect(repoSpy).not.toHaveBeenCalled();
      expect(sideSpy).not.toHaveBeenCalled();
    });

    it.each(cases)('%s: id không tồn tại cũng 403 như id chưa giao (không lộ id nào có thật)', async (_label, method, repoMethod) => {
      const repoSpy = jest.spyOn(zaloSettingRepository, repoMethod).mockResolvedValue(null);
      const res = makeRes();
      await controller[method]({ user: employee, params: { id: '999999' }, body, ip: '1.1.1.1', get: () => null }, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(repoSpy).not.toHaveBeenCalled();
    });

    it.each(cases)('%s: nhân viên ĐƯỢC giao → qua cổng, repo được gọi', async (_label, method, repoMethod) => {
      const repoSpy = jest.spyOn(zaloSettingRepository, repoMethod).mockResolvedValue(null);
      jest.spyOn(zaloSettingRepository, 'findUserDailySendLimitById').mockResolvedValue(null);
      jest.spyOn(zaloSettingRepository, 'findUserSendSpeedById').mockResolvedValue(null);
      const res = makeRes();
      await controller[method]({ user: employee, params: { id: '5' }, body, ip: '1.1.1.1', get: () => null }, res);

      expect(repoSpy).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it.each(cases)('%s: CHỦ qua cổng, không đọc bảng giao', async (_label, method, repoMethod) => {
      const repoSpy = jest.spyOn(zaloSettingRepository, repoMethod).mockResolvedValue(null);
      jest.spyOn(zaloSettingRepository, 'findUserDailySendLimitById').mockResolvedValue(null);
      jest.spyOn(zaloSettingRepository, 'findUserSendSpeedById').mockResolvedValue(null);
      const res = makeRes();
      await controller[method]({ user: owner, params: { id: '9' }, body, ip: '1.1.1.1', get: () => null }, res);

      expect(repoSpy).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(mockFindAssigned).not.toHaveBeenCalled();
    });

    it.each(cases)('%s: FAIL-CLOSED — lỗi đọc bảng giao → nhân viên bị 403, repo không bị gọi', async (_label, method, repoMethod) => {
      mockFindAssigned.mockRejectedValue(new Error('db down'));
      const repoSpy = jest.spyOn(zaloSettingRepository, repoMethod).mockResolvedValue(null);
      const res = makeRes();
      await controller[method]({ user: employee, params: { id: '5' }, body, ip: '1.1.1.1', get: () => null }, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(repoSpy).not.toHaveBeenCalled();
    });

    it('deleteAccount: nhân viên được giao xoá được tài khoản đó (repo nhận id + chủ)', async () => {
      const delSpy = jest.spyOn(zaloSettingRepository, 'deleteAccount').mockResolvedValue({ id: 5, id_user: 10, is_default: false });
      const res = makeRes();
      await controller.deleteAccount({ user: employee, params: { id: '5' } }, res);
      expect(delSpy).toHaveBeenCalledWith(5, false, 10);
      expect(jsonOf(res)).toEqual(expect.objectContaining({ success: true }));
    });
  });

  describe('PATCH /accounts/:id/default (setDefaultAccount) — chỉ chủ', () => {
    it('nhân viên (kể cả được giao tài khoản đó) → 403 WORKSPACE_OWNER_ONLY, không mở giao dịch', async () => {
      const getClientSpy = jest.spyOn(db, 'getClient');
      const res = makeRes();
      await controller.setDefaultAccount({ user: employee, params: { id: '5' } }, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(jsonOf(res).code).toBe('WORKSPACE_OWNER_ONLY');
      expect(getClientSpy).not.toHaveBeenCalled();
    });

    it('CHỦ đổi được mặc định (giao dịch được mở và truy vấn theo chủ)', async () => {
      const query = jest.fn().mockImplementation(async (sql) => (String(sql).includes('SELECT id, id_user') ? { rows: [{ id: 5, id_user: 10 }] } : { rows: [] }));
      jest.spyOn(db, 'getClient').mockResolvedValue({ query, release: jest.fn() });
      const res = makeRes();
      await controller.setDefaultAccount({ user: owner, params: { id: '5' } }, res);

      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(jsonOf(res)).toEqual({ success: true, message: 'Đã cập nhật tài khoản mặc định' });
      expect(query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('QR: trạng thái phiên chỉ người tạo đọc được', () => {
    it('nhân viên khác cùng không gian → 404; chính người tạo → 200; chủ không phải người tạo → 404', async () => {
      const sessionKey = controller.createLoginSession(10, 20);
      controller.patchLoginSession(sessionKey, { status: 'connected', message: 'ok', account: { id: 77 } });

      const other = makeRes();
      await controller.getQrLoginStatus({ user: { ...employee, id: 21 }, params: { sessionKey } }, other);
      expect(other.status).toHaveBeenCalledWith(404);

      const creator = makeRes();
      await controller.getQrLoginStatus({ user: employee, params: { sessionKey } }, creator);
      expect(creator.status).not.toHaveBeenCalled();
      expect(jsonOf(creator).data).toEqual({ status: 'connected', message: 'ok', account: { id: 77 } });

      const ownerRes = makeRes();
      await controller.getQrLoginStatus({ user: owner, params: { sessionKey } }, ownerRes);
      expect(ownerRes.status).toHaveBeenCalledWith(404);
    });

    it('chủ tạo phiên thì chính chủ đọc được (không phá chủ)', async () => {
      const sessionKey = controller.createLoginSession(10, 10);
      const res = makeRes();
      await controller.getQrLoginStatus({ user: owner, params: { sessionKey } }, res);
      expect(res.status).not.toHaveBeenCalled();
      expect(jsonOf(res).data.status).toBe('waiting_scan');
    });

    it('người của chủ khác không đọc được phiên', async () => {
      const sessionKey = controller.createLoginSession(10, 10);
      const res = makeRes();
      await controller.getQrLoginStatus({ user: { id: 99, role: 'user' }, params: { sessionKey } }, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('QR: upsertQrLoggedInAccount — nhân viên quét', () => {
    const identity = { zaloUserId: 'zu-1', displayName: 'Tài khoản Zalo', zaloName: 'A', zaloPhone: '09', cookieText: 'c' };
    let client;
    let findByIdSpy;
    let findByNameSpy;
    let insertSpy;
    let updateByNameSpy;

    beforeEach(() => {
      client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
      jest.spyOn(db, 'getClient').mockResolvedValue(client);
      jest.spyOn(zaloOneWorkspaceService, 'assertZaloNotLiveElsewhere').mockResolvedValue(undefined);
      jest.spyOn(zaloOneWorkspaceService, 'withUniqueMapped').mockImplementation((fn) => fn());
      findByIdSpy = jest.spyOn(zaloSettingRepository, 'findByZaloUserId').mockResolvedValue(null);
      findByNameSpy = jest.spyOn(zaloSettingRepository, 'findByDisplayName').mockResolvedValue({ id: 1 });
      jest.spyOn(zaloSettingRepository, 'countByUserId').mockResolvedValue(3);
      insertSpy = jest.spyOn(zaloSettingRepository, 'insertAccount').mockResolvedValue(row(88));
      updateByNameSpy = jest.spyOn(zaloSettingRepository, 'updateQrConnectedByDisplayNameId').mockResolvedValue(row(1));
      jest.spyOn(zaloSettingRepository, 'updateQrConnectedById').mockResolvedValue(row(55));
    });

    it('nhân viên tạo hàng MỚI → chèn việc giao self_login cùng giao dịch, KHÔNG khớp theo tên (không ghi đè hàng của chủ)', async () => {
      const account = await controller.upsertQrLoggedInAccount(10, identity, 'user', { employeeActorUserId: 20 });

      expect(findByNameSpy).not.toHaveBeenCalled();
      expect(updateByNameSpy).not.toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalled();
      expect(mockInsertSelfLogin).toHaveBeenCalledWith({ ownerId: 10, employeeId: 20, accountId: 88 }, client);
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(account.id).toBe(88);
    });

    it('nhân viên quét lại tài khoản ĐÃ CÓ (khớp zalo_user_id) → cập nhật, KHÔNG tự cấp quyền', async () => {
      findByIdSpy.mockResolvedValue({ id: 55 });
      await controller.upsertQrLoggedInAccount(10, identity, 'user', { employeeActorUserId: 20 });

      expect(insertSpy).not.toHaveBeenCalled();
      expect(mockInsertSelfLogin).not.toHaveBeenCalled();
    });

    it('CHỦ quét: khớp theo tên như cũ (updateByDisplayName), không chèn việc giao', async () => {
      await controller.upsertQrLoggedInAccount(10, identity, 'user', {});

      expect(findByNameSpy).toHaveBeenCalledWith(10, 'Tài khoản Zalo');
      expect(updateByNameSpy).toHaveBeenCalled();
      expect(insertSpy).not.toHaveBeenCalled();
      expect(mockInsertSelfLogin).not.toHaveBeenCalled();
    });

    it('CHỦ quét tài khoản mới (không trùng tên) → tạo hàng, không chèn việc giao', async () => {
      findByNameSpy.mockResolvedValue(null);
      await controller.upsertQrLoggedInAccount(10, identity, 'user');

      expect(insertSpy).toHaveBeenCalled();
      expect(mockInsertSelfLogin).not.toHaveBeenCalled();
    });

    it('nếu chèn việc giao lỗi thì huỷ cả giao dịch (không để tài khoản mồ côi nhân viên không thấy)', async () => {
      mockInsertSelfLogin.mockRejectedValueOnce(new Error('insert failed'));
      await expect(controller.upsertQrLoggedInAccount(10, identity, 'user', { employeeActorUserId: 20 })).rejects.toThrow('insert failed');
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    });
  });
});

/**
 * PLAN_DANG_XUAT_ZALO_AN_HOI_THOAI 11/10/2026 — POST /api/zalo/accounts/:id/logout.
 *
 * Đăng xuất ≠ Xoá: ghi status=logged_out + xoá cookie (repository), dọn phiên trong RAM (dừng listener, bỏ handler, bỏ cache),
 * KHÔNG chuyển tài khoản mặc định, KHÔNG xoá dữ liệu. Khôi phục / thử lại phiên của tài khoản đã đăng xuất → 409.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockMarkAccountLoggedOut = jest.fn();
const mockPromoteNextDefaultAccount = jest.fn();
const mockDeleteAccount = jest.fn();
const mockFindAccountForRestore = jest.fn();
const mockGetAccountApi = jest.fn();
const mockClearAccountApi = jest.fn();
const mockRemoveMessageHandler = jest.fn();
const mockUnmarkAccountRegistered = jest.fn();
const mockForgetAccount = jest.fn();
const mockResetRestoreForRetry = jest.fn();

jest.unstable_mockModule('../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: {
    markAccountLoggedOut: mockMarkAccountLoggedOut,
    promoteNextDefaultAccount: mockPromoteNextDefaultAccount,
    deleteAccount: mockDeleteAccount,
    findAccountForRestore: mockFindAccountForRestore,
  },
}));

jest.unstable_mockModule('../../repositories/campaign/campaignZaloSender.repository.js', () => ({
  default: {
    resetRestoreForRetry: mockResetRestoreForRetry,
    recordRestoreFailure: jest.fn(),
  },
}));

jest.unstable_mockModule('../../services/zalo/zaloAccountSession.service.js', () => ({
  default: {
    getAccountApi: mockGetAccountApi,
    clearAccountApi: mockClearAccountApi,
  },
}));

jest.unstable_mockModule('../../services/chatbot/channelAdapters/zaloPersonal.adapter.js', () => ({
  default: {
    removeMessageHandler: mockRemoveMessageHandler,
  },
}));

jest.unstable_mockModule('../../services/zalo/zaloAccountRegistry.service.js', () => ({
  addPendingAccount: jest.fn(),
  unmarkAccountRegistered: mockUnmarkAccountRegistered,
}));

jest.unstable_mockModule('../../services/chatbot/zaloInbox.service.js', () => ({
  default: {
    forgetAccount: mockForgetAccount,
    invalidateAccountCache: jest.fn(),
  },
}));

const zaloSettingsController = (await import('../zaloSettings.controller.js')).default;

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

const ownerReq = (id = '55', role = 'user') => ({ user: { id: 12, role }, params: { id } });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccountApi.mockReturnValue(null);
});

describe('zaloSettings.controller logoutAccount', () => {
  it('đăng xuất: ghi repository, dừng listener của phiên đang sống, dọn handler / registry / cache, trả { id, status }', async () => {
    const stop = jest.fn();
    mockGetAccountApi.mockReturnValue({ listener: { stop } });
    mockMarkAccountLoggedOut.mockResolvedValue({ id: 55, id_user: 12, display_name: 'Shop', is_default: true });
    const res = makeRes();

    await zaloSettingsController.logoutAccount(ownerReq(), res);

    expect(mockMarkAccountLoggedOut).toHaveBeenCalledWith(55, false, 12);
    expect(mockClearAccountApi).toHaveBeenCalledWith(55);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mockRemoveMessageHandler).toHaveBeenCalledWith(55);
    expect(mockUnmarkAccountRegistered).toHaveBeenCalledWith(55);
    expect(mockForgetAccount).toHaveBeenCalledWith(12, 55);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Đã đăng xuất tài khoản Zalo',
      data: { id: 55, status: 'logged_out' },
    });
  });

  it('Đăng xuất ≠ Xoá: KHÔNG gọi deleteAccount, KHÔNG chuyển tài khoản mặc định (kể cả khi đó là mặc định)', async () => {
    mockMarkAccountLoggedOut.mockResolvedValue({ id: 55, id_user: 12, display_name: 'Shop', is_default: true });

    await zaloSettingsController.logoutAccount(ownerReq(), makeRes());

    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(mockPromoteNextDefaultAccount).not.toHaveBeenCalled();
  });

  it('không có phiên trong RAM vẫn đăng xuất bình thường (không ném lỗi khi thiếu listener)', async () => {
    mockGetAccountApi.mockReturnValue(null);
    mockMarkAccountLoggedOut.mockResolvedValue({ id: 55, id_user: 12, display_name: 'Shop', is_default: false });
    const res = makeRes();

    await zaloSettingsController.logoutAccount(ownerReq(), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('listener.stop ném lỗi không làm hỏng việc đăng xuất (đã ghi DB rồi)', async () => {
    mockGetAccountApi.mockReturnValue({ listener: { stop: () => { throw new Error('ws closed'); } } });
    mockMarkAccountLoggedOut.mockResolvedValue({ id: 55, id_user: 12, display_name: 'Shop', is_default: false });
    const res = makeRes();

    await zaloSettingsController.logoutAccount(ownerReq(), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('không tìm thấy tài khoản (không thuộc không gian / không tồn tại): 404 và KHÔNG đụng phiên đang sống của ai', async () => {
    const stop = jest.fn();
    mockGetAccountApi.mockReturnValue({ listener: { stop } });
    mockMarkAccountLoggedOut.mockResolvedValue(null);
    const res = makeRes();

    await zaloSettingsController.logoutAccount(ownerReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(stop).not.toHaveBeenCalled();
    expect(mockClearAccountApi).not.toHaveBeenCalled();
    expect(mockForgetAccount).not.toHaveBeenCalled();
  });

  it('super admin: isAdmin = true được chuyển xuống repository', async () => {
    mockMarkAccountLoggedOut.mockResolvedValue({ id: 55, id_user: 99, display_name: 'Shop', is_default: false });

    await zaloSettingsController.logoutAccount(ownerReq('55', 'admin'), makeRes());

    expect(mockMarkAccountLoggedOut.mock.calls[0][1]).toBe(true);
  });
});

describe('khôi phục / thử lại phiên của tài khoản đã đăng xuất → 409 ZALO_ACCOUNT_LOGGED_OUT', () => {
  const expected = {
    success: false,
    message: 'Tài khoản đã đăng xuất, hãy quét QR để kết nối lại',
    code: 'ZALO_ACCOUNT_LOGGED_OUT',
  };

  it('restoreAccountSessionByCookie (POST /accounts/:id/restore-session)', async () => {
    mockFindAccountForRestore.mockResolvedValue({ id: 55, id_user: 12, status: 'logged_out', cookie_text: null });
    const res = makeRes();

    await zaloSettingsController.restoreAccountSessionByCookie(ownerReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expected);
  });

  it('retryRestore (POST /accounts/:id/retry-restore): 409 và KHÔNG gọi resetRestoreForRetry (sẽ đặt lại connected)', async () => {
    mockFindAccountForRestore.mockResolvedValue({ id: 55, id_user: 12, status: 'logged_out', zalo_user_id: 'z1' });
    const res = makeRes();

    await zaloSettingsController.retryRestore(ownerReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expected);
    expect(mockResetRestoreForRetry).not.toHaveBeenCalled();
  });

  it('tài khoản disconnected / needs_reauth (hết phiên, không đăng xuất) KHÔNG bị chặn 409 như cũ', async () => {
    mockFindAccountForRestore.mockResolvedValue({ id: 55, id_user: 12, status: 'needs_reauth', cookie_text: '' });
    const res = makeRes();

    await zaloSettingsController.restoreAccountSessionByCookie(ownerReq(), res);

    // Hành vi cũ: chưa có cookie → 400, không phải 409.
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

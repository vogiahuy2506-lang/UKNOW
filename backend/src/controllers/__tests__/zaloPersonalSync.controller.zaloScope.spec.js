/**
 * PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G2 — đồng bộ / danh bạ / lịch sử chat / trạng thái của Hộp thư:
 *  - nhân viên gửi accountId của tài khoản chưa được giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED TRƯỚC mọi truy vấn / phiên Zalo;
 *  - thiếu accountId: không còn "tự lấy tài khoản đang kết nối đầu tiên của chủ" — chỉ trong phạm vi được giao;
 *  - ô chọn tài khoản (sync/status) chỉ liệt kê tài khoản được giao;
 *  - chủ luôn thấy hết (phạm vi null, không đụng bảng giao).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindForSync = jest.fn();
const mockFindSummaryForSync = jest.fn();
const mockFindAccounts = jest.fn();
const mockGetAccountApi = jest.fn();
const mockGetAccessible = jest.fn();
const syncService = {
  fullSync: jest.fn(),
  syncContacts: jest.fn(),
  syncChatHistory: jest.fn(),
  listFriends: jest.fn(),
};

jest.unstable_mockModule('../../services/chatbot/zaloPersonalSync.service.js', () => ({ default: syncService }));
jest.unstable_mockModule('../../services/zalo/zaloAccountSession.service.js', () => ({
  default: { getAccountApi: (...a) => mockGetAccountApi(...a) },
}));
jest.unstable_mockModule('../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: {
    findConnectedAccountForSync: (...a) => mockFindForSync(...a),
    findConnectedAccountSummaryForSync: (...a) => mockFindSummaryForSync(...a),
    findActiveConnectedAccountsByUser: (...a) => mockFindAccounts(...a),
  },
}));
jest.unstable_mockModule('../../services/storage/storageQuota.service.js', () => ({
  resolveWorkspaceOwnerId: (user) => (user?.activeContext?.type === 'employee' ? user.activeContext.ownerId : user.id),
}));
jest.unstable_mockModule('../../services/user/memberChannelAccess.service.js', () => {
  const real = {
    assertZaloAccountInScope: (accountId, ids) => {
      if (ids === null) return;
      if (Array.isArray(ids) && ids.includes(Number(accountId))) return;
      throw Object.assign(new Error('Tài khoản Zalo này chưa được giao cho bạn.'), { status: 403, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    },
    isZaloAccountNotAssignedError: (error) => error?.code === 'ZALO_ACCOUNT_NOT_ASSIGNED',
  };
  return { ...real, getAccessibleZaloAccountIds: (...a) => mockGetAccessible(...a) };
});

const { default: controller } = await import('../zaloPersonalSync.controller.js');

const OWNER = 100;
const EMPLOYEE = 200;
const ownerUser = { id: OWNER, role: 'user' };
const employeeUser = { id: EMPLOYEE, role: 'user', activeContext: { type: 'employee', ownerId: OWNER, membershipId: 7, permissions: {} } };

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const call = async (method, req) => {
  const res = makeRes();
  await controller[method](req, res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGetAccessible.mockResolvedValue([5]);
  mockGetAccountApi.mockReturnValue({});
  mockFindForSync.mockResolvedValue({ id: 5, status: 'connected' });
  mockFindSummaryForSync.mockResolvedValue({ id: 5 });
  mockFindAccounts.mockResolvedValue([]);
  syncService.fullSync.mockResolvedValue({ errors: [] });
  syncService.syncContacts.mockResolvedValue({});
  syncService.syncChatHistory.mockResolvedValue({});
  syncService.listFriends.mockResolvedValue({ items: [], total: 0 });
});

const REQUESTS = {
  sync: (user, accountId) => ({ user, query: accountId == null ? {} : { accountId }, body: {} }),
  syncContacts: (user, accountId) => ({ user, query: accountId == null ? {} : { accountId }, body: {} }),
  syncChatHistory: (user, accountId) => ({ user, query: {}, body: { externalId: 'u1', ...(accountId == null ? {} : { accountId }) } }),
};
const REPOSITORY_OF = { sync: () => mockFindForSync, syncContacts: () => mockFindSummaryForSync, syncChatHistory: () => mockFindSummaryForSync };
const WORK_OF = { sync: () => syncService.fullSync, syncContacts: () => syncService.syncContacts, syncChatHistory: () => syncService.syncChatHistory };

describe.each(['sync', 'syncContacts', 'syncChatHistory'])('%s', (method) => {
  it('NHÂN VIÊN gửi accountId chưa được giao → 403 ZALO_ACCOUNT_NOT_ASSIGNED, không truy vấn tài khoản, không đồng bộ', async () => {
    const res = await call(method, REQUESTS[method](employeeUser, 77));

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'ZALO_ACCOUNT_NOT_ASSIGNED' });
    expect(REPOSITORY_OF[method]()).not.toHaveBeenCalled();
    expect(WORK_OF[method]()).not.toHaveBeenCalled();
  });

  it('NHÂN VIÊN gửi accountId được giao → chạy, và phạm vi được chuyển xuống repository (kiểm lần hai ở SQL)', async () => {
    const res = await call(method, REQUESTS[method](employeeUser, 5));

    expect(res.statusCode).toBe(200);
    expect(REPOSITORY_OF[method]()).toHaveBeenCalledWith(OWNER, 5, [5]);
    expect(WORK_OF[method]()).toHaveBeenCalledTimes(1);
  });

  it('NHÂN VIÊN THIẾU accountId → repository nhận phạm vi được giao (chỉ chọn trong tài khoản được giao); không tài khoản nào → 400, không đồng bộ', async () => {
    mockGetAccessible.mockResolvedValue([5, 9]);
    await call(method, REQUESTS[method](employeeUser, null));
    expect(REPOSITORY_OF[method]()).toHaveBeenCalledWith(OWNER, null, [5, 9]);

    jest.clearAllMocks();
    mockGetAccessible.mockResolvedValue([]);
    mockFindForSync.mockResolvedValue(null);
    mockFindSummaryForSync.mockResolvedValue(null);
    const res = await call(method, REQUESTS[method](employeeUser, null));
    expect(res.statusCode).toBe(400);
    expect(WORK_OF[method]()).not.toHaveBeenCalled();
  });

  it('CHỦ: phạm vi null, accountId bất kỳ của chủ đi qua như cũ', async () => {
    mockGetAccessible.mockResolvedValue(null);
    const res = await call(method, REQUESTS[method](ownerUser, 77));

    expect(res.statusCode).toBe(200);
    expect(REPOSITORY_OF[method]()).toHaveBeenCalledWith(OWNER, 77, null);
    expect(WORK_OF[method]()).toHaveBeenCalledTimes(1);
  });
});

describe('getFriends (danh bạ)', () => {
  const req = (user, accountId) => ({ user, query: accountId == null ? {} : { accountId }, params: {} });

  it('nhân viên: tài khoản chưa giao → 403, không đọc danh bạ', async () => {
    const res = await call('getFriends', req(employeeUser, 77));

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ZALO_ACCOUNT_NOT_ASSIGNED');
    expect(syncService.listFriends).not.toHaveBeenCalled();
  });

  it('nhân viên: tài khoản được giao → đọc, phạm vi chuyển xuống service (kiểm lần hai ở SQL)', async () => {
    const res = await call('getFriends', req(employeeUser, 5));

    expect(res.statusCode).toBe(200);
    expect(syncService.listFriends).toHaveBeenCalledWith(expect.objectContaining({ accountId: 5, userId: OWNER, accessibleZaloAccountIds: [5] }));
  });

  it('chủ: phạm vi null; thiếu accountId vẫn 400 như cũ', async () => {
    mockGetAccessible.mockResolvedValue(null);
    await call('getFriends', req(ownerUser, 77));
    expect(syncService.listFriends).toHaveBeenCalledWith(expect.objectContaining({ accountId: 77, accessibleZaloAccountIds: null }));

    const res = await call('getFriends', req(ownerUser, null));
    expect(res.statusCode).toBe(400);
  });
});

describe('getSyncStatus (ô chọn tài khoản trong Hộp thư)', () => {
  it('nhân viên: danh sách tài khoản lấy theo phạm vi được giao', async () => {
    mockFindAccounts.mockResolvedValue([{ id: 5, display_name: 'Shop', conversation_count: '3', status: 'connected' }]);
    const res = await call('getSyncStatus', { user: employeeUser, query: {} });

    expect(mockFindAccounts).toHaveBeenCalledWith(OWNER, [5]);
    expect(res.body.data.accounts.map((a) => a.id)).toEqual([5]);
  });

  it('nhân viên chưa được giao gì → danh sách rỗng, connected=false (không lộ tài khoản của chủ)', async () => {
    mockGetAccessible.mockResolvedValue([]);
    mockFindAccounts.mockResolvedValue([]);
    const res = await call('getSyncStatus', { user: employeeUser, query: {} });

    expect(mockFindAccounts).toHaveBeenCalledWith(OWNER, []);
    expect(res.body.data).toMatchObject({ connected: false, accounts: [] });
  });

  it('chủ: phạm vi null → thấy hết như cũ', async () => {
    mockGetAccessible.mockResolvedValue(null);
    await call('getSyncStatus', { user: ownerUser, query: {} });

    expect(mockFindAccounts).toHaveBeenCalledWith(OWNER, null);
  });
});

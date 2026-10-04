/**
 * H-05 — GET /zalo-personal/sync/status chỉ ĐỌC: không khôi phục phiên, không ghi DB.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindAccounts = jest.fn();
const mockGetAccountApi = jest.fn();
const mockRestoreFromCookie = jest.fn();
const mockRecordRestoreFailure = jest.fn();
const mockSetAccountApi = jest.fn();
const mockClearAccountApi = jest.fn();

jest.unstable_mockModule('../../services/chatbot/zaloPersonalSync.service.js', () => ({
  default: {},
}));
jest.unstable_mockModule('../../services/zalo/zaloAccountSession.service.js', () => ({
  default: {
    getAccountApi: (...a) => mockGetAccountApi(...a),
    setAccountApi: (...a) => mockSetAccountApi(...a),
    clearAccountApi: (...a) => mockClearAccountApi(...a),
  },
}));
jest.unstable_mockModule('../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: {
    findActiveConnectedAccountsByUser: (...a) => mockFindAccounts(...a),
  },
}));
jest.unstable_mockModule('../../repositories/campaign/campaignZaloSender.repository.js', () => ({
  default: {
    recordRestoreFailure: (...a) => mockRecordRestoreFailure(...a),
  },
}));
jest.unstable_mockModule('../../utils/zaloSessionRestore.util.js', () => ({
  restoreZaloSessionFromCookie: (...a) => mockRestoreFromCookie(...a),
}));
jest.unstable_mockModule('../../services/storage/storageQuota.service.js', () => ({
  resolveWorkspaceOwnerId: (user) => user.id,
}));

const { default: controller } = await import('../zaloPersonalSync.controller.js');

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

const call = async () => {
  const res = makeRes();
  await controller.getSyncStatus({ user: { id: 1 } }, res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAccountApi.mockReturnValue(null);
});

describe('zaloPersonalSync.getSyncStatus (H-05: chỉ đọc)', () => {
  it('tài khoản hết phiên + RAM trống: KHÔNG khôi phục, KHÔNG ghi restore_fail_count, KHÔNG đụng RAM', async () => {
    mockFindAccounts.mockResolvedValue([
      { id: 1, display_name: 'A', status: 'needs_reauth', conversation_count: '3', cookie_text: 'x' },
      { id: 6, display_name: 'B', status: 'needs_reauth', conversation_count: '0', cookie_text: 'y' },
    ]);

    const res = await call();

    expect(mockRestoreFromCookie).not.toHaveBeenCalled();
    expect(mockRecordRestoreFailure).not.toHaveBeenCalled();
    expect(mockSetAccountApi).not.toHaveBeenCalled();
    expect(mockClearAccountApi).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.data.connected).toBe(false);
  });

  it('trả trạng thái theo DB: connected / needsReauth, kèm hasActiveSession từ RAM', async () => {
    mockFindAccounts.mockResolvedValue([
      { id: 103, display_name: 'Nhật Minh', status: 'connected', conversation_count: '25' },
      { id: 45, display_name: 'Cũ', status: 'needs_reauth', conversation_count: '8' },
    ]);
    mockGetAccountApi.mockImplementation((id) => (id === 103 ? { fake: 'api' } : null));

    const res = await call();

    const { accounts, connected, message } = res.body.data;
    expect(connected).toBe(true);
    expect(accounts).toEqual([
      {
        id: 103, displayName: 'Nhật Minh', conversationCount: 25,
        status: 'connected', isConnected: true, needsReauth: false, hasActiveSession: true,
      },
      {
        id: 45, displayName: 'Cũ', conversationCount: 8,
        status: 'needs_reauth', isConnected: false, needsReauth: true, hasActiveSession: false,
      },
    ]);
    expect(message).toBe('1/2 tài khoản kết nối (1 cần đăng nhập lại)');
  });

  it('chỉ có tài khoản hết phiên → connected=false (banner "cần đăng nhập lại" dựa vào đây)', async () => {
    mockFindAccounts.mockResolvedValue([
      { id: 1, display_name: 'A', status: 'needs_reauth', conversation_count: '1' },
    ]);

    const res = await call();

    expect(res.body.data.connected).toBe(false);
    expect(res.body.data.accounts).toHaveLength(1);
  });

  it('không có tài khoản active → connected=false, accounts rỗng', async () => {
    mockFindAccounts.mockResolvedValue([]);

    const res = await call();

    expect(res.body.data).toMatchObject({ connected: false, accounts: [] });
  });

  it('lỗi DB → 500', async () => {
    mockFindAccounts.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await call();

    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * findAccountsMissingLiveSession phải là hàm CHỈ ĐỌC.
 *
 * Bối cảnh (03/09/2026): trước đây hàm này (tên cũ syncDisconnectedAccountsFromMemory)
 * gọi tryAutoRestoreSession + recordRestoreFailure cho từng tài khoản ngay trong lúc xử lý
 * GET /api/zalo/accounts. Sau đợt cứu hộ PR-2 nâng số tài khoản 'connected' từ 10 lên 45,
 * vòng lặp đăng nhập lại tuần tự làm request quá hạn và trang quản lý Zalo của admin báo
 * "Backend Zalo chưa sẵn sàng".
 *
 * Test cũ ở zaloRestorePolicy.spec.js:70-91 KHÔNG bắt được vì nó tự chép vòng lặp vào trong
 * test thay vì gọi hàm thật — nên không bao giờ đỏ. Test này gọi hàm thật.
 */

const getAccountApiMock = jest.fn();
const tryAutoRestoreSessionSpy = jest.fn();
const recordRestoreFailureSpy = jest.fn();

jest.unstable_mockModule('../../zalo/zaloAccountSession.service.js', () => ({
  default: {
    getAccountApi: getAccountApiMock,
    clearAccountApi: jest.fn(),
    setAccountApi: jest.fn(),
  },
}));

const { default: campaignZaloSenderService } = await import('../campaignZaloSender.service.js');

describe('findAccountsMissingLiveSession — đường ĐỌC danh sách tài khoản Zalo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    campaignZaloSenderService.tryAutoRestoreSession = tryAutoRestoreSessionSpy;
  });

  const account = (over = {}) => ({ id: '301', status: 'connected', is_active: true, ...over });

  it('trả về id các tài khoản connected nhưng KHÔNG có phiên sống trong bộ nhớ', () => {
    getAccountApiMock.mockReturnValue(null);
    const result = campaignZaloSenderService.findAccountsMissingLiveSession({
      userId: 61,
      accounts: [account({ id: '301' }), account({ id: '302' })],
    });
    expect([...result].sort()).toEqual(['301', '302']);
  });

  it('KHÔNG trả về tài khoản đang có phiên sống', () => {
    getAccountApiMock.mockReturnValue({ listener: {} });
    const result = campaignZaloSenderService.findAccountsMissingLiveSession({
      userId: 61,
      accounts: [account()],
    });
    expect(result.size).toBe(0);
  });

  it('bỏ qua tài khoản không phải connected hoặc đã tắt', () => {
    getAccountApiMock.mockReturnValue(null);
    const result = campaignZaloSenderService.findAccountsMissingLiveSession({
      userId: 61,
      accounts: [
        account({ id: '401', status: 'needs_reauth' }),
        account({ id: '402', status: 'disconnected' }),
        account({ id: '403', is_active: false }),
      ],
    });
    expect(result.size).toBe(0);
  });

  it('TUYỆT ĐỐI KHÔNG đăng nhập lại Zalo và KHÔNG ghi DB — đây là đường đọc', () => {
    getAccountApiMock.mockReturnValue(null);
    campaignZaloSenderService.findAccountsMissingLiveSession({
      userId: 61,
      accounts: [account({ id: '301' }), account({ id: '302' }), account({ id: '303' })],
    });
    expect(tryAutoRestoreSessionSpy).not.toHaveBeenCalled();
    expect(recordRestoreFailureSpy).not.toHaveBeenCalled();
  });

  it('là hàm đồng bộ, không trả Promise — không có I/O nào để chờ', () => {
    getAccountApiMock.mockReturnValue(null);
    const result = campaignZaloSenderService.findAccountsMissingLiveSession({
      userId: 61,
      accounts: [account()],
    });
    expect(result).toBeInstanceOf(Set);
    expect(typeof result.then).toBe('undefined');
  });

  it('đầu vào rỗng hoặc userId sai thì trả Set rỗng, không ném lỗi', () => {
    expect(campaignZaloSenderService.findAccountsMissingLiveSession({ userId: null, accounts: [account()] }).size).toBe(0);
    expect(campaignZaloSenderService.findAccountsMissingLiveSession({ userId: 61, accounts: [] }).size).toBe(0);
    expect(campaignZaloSenderService.findAccountsMissingLiveSession({ userId: 61 }).size).toBe(0);
  });
});

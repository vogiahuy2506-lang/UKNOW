import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * tryAutoRestoreSession KHÔNG được đánh dấu tài khoản 'connected' khi đăng nhập Zalo hỏng.
 *
 * Bối cảnh (06/09/2026): restoreZaloSessionFromCookie trả `null` khi login thất bại, không
 * ném lỗi. restoreApiFromCookieText của service chuyển tiếp nguyên `null`, rồi
 * tryAutoRestoreSession gọi markAccountConnected mà không kiểm. Hậu quả trên production:
 * mỗi lần cron zalo_session_restore (15 phút) chạy, tài khoản cookie chết được ghi
 * last_connected_at = now, restore_fail_count = 0, first_restore_fail_at = NULL, rồi 3 ms
 * sau recordRestoreFailure ghi lần fail "đầu tiên". Cửa sổ 60 phút của luật needs_reauth
 * (campaignZaloSender.repository.js, recordRestoreFailure) vì thế không bao giờ đóng:
 * 32 tài khoản kẹt 'connected' giả và bị đăng nhập lại liên tục (173 lần trong 2 giờ).
 *
 * Test này gọi hàm THẬT của service; chỉ mock lớp đăng nhập Zalo, lớp phiên trong bộ nhớ
 * và các phương thức DB. Không chép lại logic sản xuất vào test.
 */

const restoreZaloSessionFromCookieMock = jest.fn();
const getAccountApiMock = jest.fn();
const setAccountApiMock = jest.fn();
const startAccountListenerSafelyMock = jest.fn();

jest.unstable_mockModule('../../../utils/zaloSessionRestore.util.js', () => ({
  restoreZaloSessionFromCookie: restoreZaloSessionFromCookieMock,
  toZcaCookieShape: (cookie) => cookie,
}));

jest.unstable_mockModule('../../zalo/zaloAccountSession.service.js', () => ({
  default: {
    getAccountApi: getAccountApiMock,
    setAccountApi: setAccountApiMock,
    clearAccountApi: jest.fn(),
    startAccountListenerSafely: startAccountListenerSafelyMock,
  },
}));

const { default: campaignZaloSenderRepository } = await import(
  '../../../repositories/campaign/campaignZaloSender.repository.js'
);
const { default: campaignZaloSenderService } = await import('../campaignZaloSender.service.js');

describe('tryAutoRestoreSession — không được ghi connected khi đăng nhập Zalo hỏng', () => {
  const markAccountConnectedSpy = jest.fn();
  const recordRestoreFailureSpy = jest.fn();
  const findConnectedAccountsNeedingRestoreSpy = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    campaignZaloSenderRepository.markAccountConnected = markAccountConnectedSpy.mockResolvedValue(undefined);
    campaignZaloSenderRepository.recordRestoreFailure = recordRestoreFailureSpy.mockResolvedValue({
      status: 'connected',
      restore_fail_count: 1,
    });
    campaignZaloSenderRepository.findConnectedAccountsNeedingRestore = findConnectedAccountsNeedingRestoreSpy;
    getAccountApiMock.mockReturnValue(null);
  });

  const input = {
    accountId: 52,
    userId: 63,
    cookieText: 'cookie-da-het-han',
    fallbackDisplayName: 'Tài khoản Zalo',
  };

  it('login trả null → trả null, KHÔNG gọi markAccountConnected, KHÔNG lưu api rỗng vào bộ nhớ', async () => {
    restoreZaloSessionFromCookieMock.mockResolvedValue(null);

    const result = await campaignZaloSenderService.tryAutoRestoreSession(input);

    expect(restoreZaloSessionFromCookieMock).toHaveBeenCalledWith('cookie-da-het-han');
    expect(result).toBeNull();
    expect(markAccountConnectedSpy).not.toHaveBeenCalled();
    expect(setAccountApiMock).not.toHaveBeenCalled();
    expect(startAccountListenerSafelyMock).not.toHaveBeenCalled();
  });

  it('login ném lỗi → trả null, KHÔNG gọi markAccountConnected', async () => {
    restoreZaloSessionFromCookieMock.mockRejectedValue(new Error('Đăng nhập thất bại'));

    const result = await campaignZaloSenderService.tryAutoRestoreSession(input);

    expect(result).toBeNull();
    expect(markAccountConnectedSpy).not.toHaveBeenCalled();
    expect(setAccountApiMock).not.toHaveBeenCalled();
  });

  it('login thành công → trả api, markAccountConnected đúng một lần, api được lưu vào bộ nhớ', async () => {
    const api = { listener: { start: jest.fn() } };
    restoreZaloSessionFromCookieMock.mockResolvedValue(api);

    const result = await campaignZaloSenderService.tryAutoRestoreSession(input);

    expect(result).toBe(api);
    expect(markAccountConnectedSpy).toHaveBeenCalledTimes(1);
    expect(markAccountConnectedSpy).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 52, userId: 63, cookieText: 'cookie-da-het-han' })
    );
    expect(setAccountApiMock).toHaveBeenCalledWith(52, api);
  });

  it('vòng lặp cron restoreDisconnectedZaloAccounts: cookie chết → chỉ ghi fail, KHÔNG BAO GIỜ ghi connected', async () => {
    findConnectedAccountsNeedingRestoreSpy.mockResolvedValue({
      rows: [
        { id: '52', id_user: '63', display_name: 'A', cookie_text: 'c52' },
        { id: '77', id_user: '106', display_name: 'B', cookie_text: 'c77' },
      ],
    });
    restoreZaloSessionFromCookieMock.mockResolvedValue(null);

    const summary = await campaignZaloSenderService.restoreDisconnectedZaloAccounts();

    expect(summary).toEqual({ total: 2, restored: 0, failed: 2 });
    expect(markAccountConnectedSpy).not.toHaveBeenCalled();
    expect(recordRestoreFailureSpy.mock.calls.map(([accountId]) => accountId)).toEqual([52, 77]);
  });
});

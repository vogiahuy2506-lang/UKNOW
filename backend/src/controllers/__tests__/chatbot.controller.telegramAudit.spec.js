/**
 * P8a — nhật ký hoạt động cho vòng đời tài khoản Telegram: đăng nhập (QR thành công), đăng xuất; xoá tài khoản
 * vẫn ghi CHATBOT_CHANNEL_DISCONNECTED như trước. Không ghi SĐT.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const telegramPersonalService = {
  checkLoginStatus: jest.fn(),
  logoutAccount: jest.fn(),
  deleteAccount: jest.fn(),
};
const logWorkspace = jest.fn(async () => {});

jest.unstable_mockModule('../../services/chatbot/telegramPersonal.service.js', () => ({ default: telegramPersonalService }));
const actualAudit = await import('../../services/audit.service.js');
jest.unstable_mockModule('../../services/audit.service.js', () => ({ ...actualAudit, logWorkspace }));

const { default: controller } = await import('../chatbot.controller.js');

const makeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const makeReq = (extra = {}) => ({
  user: { id: 7, activeContext: { type: 'self' } },
  params: {},
  body: {},
  headers: {},
  ip: '1.2.3.4',
  get: () => 'jest',
  ...extra,
});

describe('chatbot.controller — nhật ký Telegram', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('đăng nhập QR thành công -> TELEGRAM_ACCOUNT_LOGIN, entity telegram_account + id tài khoản, KHÔNG có SĐT', async () => {
    telegramPersonalService.checkLoginStatus.mockResolvedValue({
      status: 'success',
      account: { id: 55, phone: '84912345678', username: 'shop' },
    });
    const res = makeRes();
    await controller.checkTelegramLoginStatus(makeReq({ params: { sessionId: 's1' } }), res);
    expect(res.body.success).toBe(true);
    expect(logWorkspace).toHaveBeenCalledTimes(1);
    const [ctx, action, entityType, entityId, details] = logWorkspace.mock.calls[0];
    expect(ctx.ownerId).toBe(7);
    expect(action).toBe('TELEGRAM_ACCOUNT_LOGIN');
    expect(entityType).toBe('telegram_account');
    expect(entityId).toBe(55);
    expect(details).toEqual({ channelType: 'telegram_personal', telegramAccountId: 55 });
    expect(JSON.stringify(details)).not.toContain('84912345678');
  });

  it.each([['pending'], ['waiting_qr'], ['error']])('trạng thái "%s" chưa phải đăng nhập -> không ghi', async (status) => {
    telegramPersonalService.checkLoginStatus.mockResolvedValue({ status });
    await controller.checkTelegramLoginStatus(makeReq({ params: { sessionId: 's1' } }), makeRes());
    expect(logWorkspace).not.toHaveBeenCalled();
  });

  it('phiên hết hạn (not_found) -> 404, không ghi', async () => {
    telegramPersonalService.checkLoginStatus.mockResolvedValue({ status: 'not_found' });
    const res = makeRes();
    await controller.checkTelegramLoginStatus(makeReq({ params: { sessionId: 's1' } }), res);
    expect(res.statusCode).toBe(404);
    expect(logWorkspace).not.toHaveBeenCalled();
  });

  it('đăng xuất thành công -> TELEGRAM_ACCOUNT_LOGOUT; không tìm thấy -> 404 không ghi', async () => {
    telegramPersonalService.logoutAccount.mockResolvedValueOnce({ id: 55 }).mockResolvedValueOnce(null);
    const ok = makeRes();
    await controller.logoutTelegramAccount(makeReq({ params: { id: '55' } }), ok);
    expect(ok.body.success).toBe(true);
    expect(logWorkspace).toHaveBeenCalledTimes(1);
    expect(logWorkspace.mock.calls[0].slice(1, 4)).toEqual(['TELEGRAM_ACCOUNT_LOGOUT', 'telegram_account', 55]);
    const missing = makeRes();
    await controller.logoutTelegramAccount(makeReq({ params: { id: '99' } }), missing);
    expect(missing.statusCode).toBe(404);
    expect(logWorkspace).toHaveBeenCalledTimes(1);
  });

  it('ghi nhật ký lỗi không làm hỏng đăng nhập/đăng xuất', async () => {
    logWorkspace.mockRejectedValue(new Error('db down'));
    telegramPersonalService.checkLoginStatus.mockResolvedValue({ status: 'success', account: { id: 55 } });
    const login = makeRes();
    await controller.checkTelegramLoginStatus(makeReq({ params: { sessionId: 's1' } }), login);
    expect(login.body.success).toBe(true);
    telegramPersonalService.logoutAccount.mockResolvedValue({ id: 55 });
    const logout = makeRes();
    await controller.logoutTelegramAccount(makeReq({ params: { id: '55' } }), logout);
    expect(logout.body.success).toBe(true);
  });

  it('xoá tài khoản giữ nguyên hành vi cũ: CHATBOT_CHANNEL_DISCONNECTED (channelType telegram_personal)', async () => {
    telegramPersonalService.deleteAccount.mockResolvedValue({ id: 55 });
    await controller.deleteTelegramAccount(makeReq({ params: { id: '55' } }), makeRes());
    expect(logWorkspace).toHaveBeenCalledTimes(1);
    expect(logWorkspace.mock.calls[0][1]).toBe('CHATBOT_CHANNEL_DISCONNECTED');
    expect(logWorkspace.mock.calls[0][4]).toEqual({ channelType: 'telegram_personal' });
  });
});

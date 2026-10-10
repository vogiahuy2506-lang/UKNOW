/**
 * Unit tests for `telegramPersonal.service.js`.
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';

// ── Gateway mock ─────────────────────────────────────────────────────
const gatewayMock = {
  isConfigured: jest.fn(() => true),
  createSession: jest.fn(),
  getStatus: jest.fn(),
  cancelSession: jest.fn(async () => ({})),
  listAccounts: jest.fn(async () => ({ data: [] })),
  deleteAccount: jest.fn(async () => ({ deleted: true })),
  bindAccount: jest.fn(async () => ({ ok: true })),
  sendMessage: jest.fn(async () => ({ ok: true })),
  ensureHandler: jest.fn(async () => ({ data: { ok: true } })),
};

jest.unstable_mockModule(
  '../telegramGateway.client.js',
  () => ({ default: gatewayMock })
);

// ── Repository mock ──────────────────────────────────────────────────
const repoStub = {
  createAccount: jest.fn(async ({ idUser, telegramUserId, phone, firstName, lastName, username }) => ({
    id: 7,
    id_user: idUser,
    telegram_user_id: telegramUserId,
    phone,
    first_name: firstName,
    last_name: lastName,
    username,
    is_active: true,
  })),
  getAccountById: jest.fn(async (id, { userId } = {}) => ({
    id,
    id_user: userId || 100,
    telegram_user_id: 12345 + id,
    phone: '+84',
    first_name: 'Bob',
    is_active: true,
  })),
  getAccountByTelegramUserId: jest.fn(async () => null),
  listAccountsByUser: jest.fn(async () => []),
  deleteAccount: jest.fn(async () => true),
  deactivateAccount: jest.fn(async () => ({ id: 1, is_active: false })),
  setEnabled: jest.fn(async () => ({ enabled: true })),
  assertOwned: jest.fn(async () => undefined),
  findOtherEnabledChatbot: jest.fn(async () => null),
  listAccountsForUser: jest.fn(async () => []),
  getSessionString: jest.fn(async () => null),
};

jest.unstable_mockModule(
  '../../../repositories/chatbot/chatbotTelegram.repository.js',
  () => ({ default: repoStub })
);

// ── DB + hạn mức (W5) ────────────────────────────────────────────────
const txClient = { query: jest.fn(async () => ({ rows: [] })), release: jest.fn() };
const enforceResourceLimitTx = jest.fn(async () => {});
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: jest.fn(async () => txClient) },
}));
jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({ enforceResourceLimitTx }));

// ── Imports AFTER mockModule ─────────────────────────────────────────
const telegramPersonalService = (await import('../telegramPersonal.service.js')).default;

beforeEach(() => {
  jest.clearAllMocks();
  gatewayMock.isConfigured.mockReturnValue(true);
});

describe('telegramPersonalService.startLogin', () => {
  it('returns sessionId + QR payload and stores login context', async () => {
    gatewayMock.createSession.mockResolvedValueOnce({
      data: {
        session_id: 'tg-sess-1',
        qr_url: 'tg://login?token=abc',
        qr_image_base64: 'AAAA',
        expires_at: 1234567890,
      },
    });
    const result = await telegramPersonalService.startLogin(100);
    expect(result).toEqual({
      sessionId: 'tg-sess-1',
      qrUrl: 'tg://login?token=abc',
      qrImageBase64: 'AAAA',
      expiresAt: 1234567890,
    });
  });

  it('throws when gateway returns no session_id', async () => {
    gatewayMock.createSession.mockResolvedValueOnce({ data: {} });
    await expect(telegramPersonalService.startLogin(100)).rejects.toThrow(
      /did not return a session_id/
    );
  });
});

describe('telegramPersonalService.checkLoginStatus', () => {
  it('returns not_found for unknown sessionId', async () => {
    const result = await telegramPersonalService.checkLoginStatus('nope');
    expect(result).toEqual({ status: 'not_found' });
  });

  it('returns pending status when gateway reports non-success', async () => {
    gatewayMock.createSession.mockResolvedValueOnce({
      data: { session_id: 'tg-sess-2', qr_image_base64: 'A', expires_at: 1 },
    });
    await telegramPersonalService.startLogin(100);

    gatewayMock.getStatus.mockResolvedValueOnce({
      data: { status: 'awaiting_scan' },
    });
    const result = await telegramPersonalService.checkLoginStatus('tg-sess-2');
    expect(result.status).toBe('awaiting_scan');
  });

  it('persists account on success and binds to gateway', async () => {
    gatewayMock.createSession.mockResolvedValueOnce({
      data: { session_id: 'tg-sess-3', qr_image_base64: 'A', expires_at: 1 },
    });
    await telegramPersonalService.startLogin(100);

    gatewayMock.getStatus.mockResolvedValueOnce({
      data: {
        status: 'success',
        account_id: 7,
        user: {
          telegram_user_id: 12345,
          first_name: 'Bob',
          last_name: 'Smith',
          username: 'bob',
          phone: '+840909000001',
        },
      },
    });
    const result = await telegramPersonalService.checkLoginStatus('tg-sess-3');
    expect(result.status).toBe('success');
    expect(result.account.id).toBe(7);
    expect(repoStub.createAccount).toHaveBeenCalledWith({
      idUser: 100,
      telegramUserId: 12345,
      phone: '+840909000001',
      firstName: 'Bob',
      lastName: 'Smith',
      username: 'bob',
    }, txClient);
    expect(gatewayMock.bindAccount).toHaveBeenCalledWith(12345, 7);
    expect(gatewayMock.ensureHandler).toHaveBeenCalledWith(12345);
  });

  describe('W5 hạn mức số tài khoản Telegram', () => {
    const successStatus = {
      data: { status: 'success', user: { telegram_user_id: 555, first_name: 'A' } },
    };
    const login = async (sid, role) => {
      gatewayMock.createSession.mockResolvedValueOnce({ data: { session_id: sid, qr_image_base64: 'A', expires_at: 1 } });
      await telegramPersonalService.startLogin(100, role);
      gatewayMock.getStatus.mockResolvedValueOnce(successStatus);
    };

    it('tài khoản MỚI -> enforce telegramAccounts (kèm role) TRƯỚC INSERT, cùng giao dịch', async () => {
      await login('tg-w5-1', 'user');
      const result = await telegramPersonalService.checkLoginStatus('tg-w5-1');
      expect(result.status).toBe('success');
      expect(enforceResourceLimitTx).toHaveBeenCalledWith(txClient, { userId: 100, roleCode: 'user', resourceKey: 'telegramAccounts' });
      expect(enforceResourceLimitTx.mock.invocationCallOrder[0]).toBeLessThan(repoStub.createAccount.mock.invocationCallOrder[0]);
      expect(txClient.query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', 'COMMIT']);
    });

    it('đăng nhập lại tài khoản ĐÃ có -> KHÔNG enforce, không mở giao dịch', async () => {
      repoStub.getAccountByTelegramUserId.mockResolvedValueOnce({ id: 7 });
      await login('tg-w5-2', 'user');
      const result = await telegramPersonalService.checkLoginStatus('tg-w5-2');
      expect(result.status).toBe('success');
      expect(enforceResourceLimitTx).not.toHaveBeenCalled();
      expect(txClient.query).not.toHaveBeenCalled();
      expect(repoStub.createAccount).toHaveBeenCalledTimes(1);
    });

    it('vượt hạn mức -> ném RESOURCE_LIMIT_EXCEEDED, ROLLBACK, không INSERT/bind, huỷ phiên gateway', async () => {
      const err = Object.assign(new Error('đạt giới hạn'), { code: 'RESOURCE_LIMIT_EXCEEDED', statusCode: 400 });
      enforceResourceLimitTx.mockRejectedValueOnce(err);
      await login('tg-w5-3', 'user');
      await expect(telegramPersonalService.checkLoginStatus('tg-w5-3')).rejects.toMatchObject({ code: 'RESOURCE_LIMIT_EXCEEDED' });
      expect(repoStub.createAccount).not.toHaveBeenCalled();
      expect(gatewayMock.bindAccount).not.toHaveBeenCalled();
      expect(gatewayMock.cancelSession).toHaveBeenCalledWith('tg-w5-3');
      expect(txClient.query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', 'ROLLBACK']);
      expect(txClient.release).toHaveBeenCalled();
    });
  });

  it('errors when success payload omits user.telegram_user_id', async () => {
    gatewayMock.createSession.mockResolvedValueOnce({
      data: { session_id: 'tg-sess-4', qr_image_base64: 'A', expires_at: 1 },
    });
    await telegramPersonalService.startLogin(100);

    gatewayMock.getStatus.mockResolvedValueOnce({
      data: { status: 'success', user: {} },
    });
    const result = await telegramPersonalService.checkLoginStatus('tg-sess-4');
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/did not return a user/);
  });

  it('keeps the login usable if post-login bind throws', async () => {
    gatewayMock.createSession.mockResolvedValueOnce({
      data: { session_id: 'tg-sess-5', qr_image_base64: 'A', expires_at: 1 },
    });
    await telegramPersonalService.startLogin(100);

    gatewayMock.getStatus.mockResolvedValueOnce({
      data: { status: 'success', user: { telegram_user_id: 9 } },
    });
    gatewayMock.bindAccount.mockRejectedValueOnce(new Error('boom'));
    gatewayMock.ensureHandler.mockRejectedValueOnce(new Error('boom'));

    const result = await telegramPersonalService.checkLoginStatus('tg-sess-5');
    expect(result.status).toBe('success');
  });
});

describe('telegramPersonalService.cancelLogin', () => {
  it('returns cancelled and calls gateway.cancelSession', async () => {
    const result = await telegramPersonalService.cancelLogin('any');
    expect(result.cancelled).toBe(true);
    expect(gatewayMock.cancelSession).toHaveBeenCalledWith('any');
  });

  it('still returns cancelled when gateway returns 404', async () => {
    const err = new Error('not found');
    err.status = 404;
    gatewayMock.cancelSession.mockRejectedValueOnce(err);
    const result = await telegramPersonalService.cancelLogin('any');
    expect(result.cancelled).toBe(true);
  });
});

describe('telegramPersonalService.listAccounts', () => {
  it('marks accounts as is_loaded when the gateway reports them', async () => {
    repoStub.listAccountsByUser.mockResolvedValueOnce([
      { id: 1, id_user: 100, telegram_user_id: 12345, is_active: true },
      { id: 2, id_user: 100, telegram_user_id: 99999, is_active: true },
    ]);
    gatewayMock.listAccounts.mockResolvedValueOnce({
      data: [
        { telegram_user_id: 12345, is_loaded: true },
        { telegram_user_id: 99999, is_loaded: false },
      ],
    });
    const accounts = await telegramPersonalService.listAccounts(100);
    expect(accounts[0].is_loaded).toBe(true);
    expect(accounts[1].is_loaded).toBe(false);
  });

  it('returns is_loaded=false for all when gateway is unconfigured', async () => {
    gatewayMock.isConfigured.mockReturnValue(false);
    repoStub.listAccountsByUser.mockResolvedValueOnce([
      { id: 1, id_user: 100, telegram_user_id: 12345, is_active: true },
    ]);
    const accounts = await telegramPersonalService.listAccounts(100);
    expect(accounts[0].is_loaded).toBe(false);
  });

  it('returns is_loaded=false for all when gateway.listAccounts fails', async () => {
    repoStub.listAccountsByUser.mockResolvedValueOnce([
      { id: 1, id_user: 100, telegram_user_id: 12345, is_active: true },
    ]);
    gatewayMock.listAccounts.mockRejectedValueOnce(new Error('boom'));
    const accounts = await telegramPersonalService.listAccounts(100);
    expect(accounts[0].is_loaded).toBe(false);
  });
});

describe('telegramPersonalService.listAccounts — session_ok (PR-T1)', () => {
  const goodBlob = { authKeys: { permanent: { 2: 'k' } }, secret: 'x' };

  it('dòng loaded: session_ok=true và không đọc blob', async () => {
    repoStub.listAccountsByUser.mockResolvedValueOnce([
      { id: 1, id_user: 100, telegram_user_id: 12345, is_active: true },
    ]);
    gatewayMock.listAccounts.mockResolvedValueOnce({ data: [{ telegram_user_id: 12345, is_loaded: true }] });
    const [a] = await telegramPersonalService.listAccounts(100);
    expect(a.session_ok).toBe(true);
    expect(repoStub.getSessionString).not.toHaveBeenCalled();
  });

  it('dòng active, không loaded, blob có authKeys.permanent: session_ok=true', async () => {
    repoStub.listAccountsByUser.mockResolvedValueOnce([
      { id: 1, id_user: 100, telegram_user_id: 12345, is_active: true },
    ]);
    repoStub.getSessionString.mockResolvedValueOnce(goodBlob);
    const [a] = await telegramPersonalService.listAccounts(100);
    expect(a.is_loaded).toBe(false);
    expect(a.session_ok).toBe(true);
  });

  it('blob null / permanent rỗng / đọc ném lỗi: session_ok=false, dòng khác không ảnh hưởng', async () => {
    repoStub.listAccountsByUser.mockResolvedValueOnce([
      { id: 1, id_user: 100, telegram_user_id: 1, is_active: true },
      { id: 2, id_user: 100, telegram_user_id: 2, is_active: true },
      { id: 3, id_user: 100, telegram_user_id: 3, is_active: true },
      { id: 4, id_user: 100, telegram_user_id: 4, is_active: true },
    ]);
    repoStub.getSessionString
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ authKeys: { permanent: {} } })
      .mockRejectedValueOnce(new Error('decrypt failed'))
      .mockResolvedValueOnce(goodBlob);
    const accounts = await telegramPersonalService.listAccounts(100);
    expect(accounts.map((a) => a.session_ok)).toEqual([false, false, false, true]);
  });

  it('dòng is_active=false: session_ok=false, không đọc blob', async () => {
    repoStub.listAccountsByUser.mockResolvedValueOnce([
      { id: 1, id_user: 100, telegram_user_id: 12345, is_active: false },
    ]);
    const [a] = await telegramPersonalService.listAccounts(100);
    expect(a.session_ok).toBe(false);
    expect(repoStub.getSessionString).not.toHaveBeenCalled();
  });

  it('response không chứa blob/khoá phiên', async () => {
    repoStub.listAccountsByUser.mockResolvedValueOnce([
      { id: 1, id_user: 100, telegram_user_id: 12345, is_active: true },
    ]);
    repoStub.getSessionString.mockResolvedValueOnce(goodBlob);
    const accounts = await telegramPersonalService.listAccounts(100);
    const json = JSON.stringify(accounts);
    expect(json).not.toMatch(/authKeys|"state"|permanent|secret/);
  });
});

describe('telegramPersonalService.deleteAccount', () => {
  it('returns null when the account does not belong to the user', async () => {
    repoStub.getAccountById.mockResolvedValueOnce(null);
    const result = await telegramPersonalService.deleteAccount(100, 99);
    expect(result).toBeNull();
  });

  it('deletes locally and tells the gateway', async () => {
    const result = await telegramPersonalService.deleteAccount(100, 1);
    expect(result).toBe(true);
    expect(repoStub.deleteAccount).toHaveBeenCalledWith(100, 1);
    expect(gatewayMock.deleteAccount).toHaveBeenCalledWith(12346);
  });
});

describe('telegramPersonalService.logoutAccount', () => {
  it('deactivates the account and tells the gateway', async () => {
    const result = await telegramPersonalService.logoutAccount(100, 1);
    expect(result).toEqual(expect.objectContaining({ id: 1 }));
    expect(gatewayMock.deleteAccount).toHaveBeenCalled();
  });
});

describe('telegramPersonalService.toggleAccountChatbot', () => {
  it('calls setEnabled and ensureHandler', async () => {
    const result = await telegramPersonalService.toggleAccountChatbot(100, 1, 1, true);
    expect(result).toEqual({ enabled: true });
    expect(repoStub.setEnabled).toHaveBeenCalledWith(100, 1, 1, true);
    expect(gatewayMock.ensureHandler).toHaveBeenCalled();
  });

  it('bot khác đang bật trên tài khoản -> 409, không gọi setEnabled; tắt vẫn được', async () => {
    repoStub.findOtherEnabledChatbot.mockResolvedValueOnce({ id: 9, name: 'Bot Cũ' });
    repoStub.setEnabled.mockClear();
    await expect(telegramPersonalService.toggleAccountChatbot(100, 1, 2, true)).rejects.toMatchObject({
      status: 409,
      code: 'CHANNEL_ACCOUNT_BOUND_TO_OTHER_CHATBOT',
      chatbotName: 'Bot Cũ',
    });
    expect(repoStub.setEnabled).not.toHaveBeenCalled();

    repoStub.findOtherEnabledChatbot.mockResolvedValueOnce({ id: 9, name: 'Bot Cũ' });
    await expect(telegramPersonalService.toggleAccountChatbot(100, 1, 2, false)).resolves.toEqual({ enabled: true });
  });
});

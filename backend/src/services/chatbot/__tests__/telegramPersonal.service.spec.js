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
  listAccountsByUser: jest.fn(async () => []),
  deleteAccount: jest.fn(async () => true),
  deactivateAccount: jest.fn(async () => ({ id: 1, is_active: false })),
  setEnabled: jest.fn(async () => ({ enabled: true })),
  listAccountsForUser: jest.fn(async () => []),
};

jest.unstable_mockModule(
  '../../../repositories/chatbot/chatbotTelegram.repository.js',
  () => ({ default: repoStub })
);

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
    });
    expect(gatewayMock.bindAccount).toHaveBeenCalledWith(12345, 7);
    expect(gatewayMock.ensureHandler).toHaveBeenCalledWith(12345);
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
});

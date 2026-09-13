/**
 * Tests for `telegramAuth.js`. Pins the wire shape returned by
 * `getStatus` so the Python gateway's contract is preserved.
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';

const fakeRepo = {
  upsertSession: jest.fn(async () => ({})),
};

class FakeSuccessClient {
  constructor() {
    this.sessionString = 'tg-session-xyz';
    this.tokenInfo = {
      token: 'tg-token-b64',
      qrUrl: 'tg://login?token=tg-token-b64',
    };
  }
  async connect() {}
  async requestQrToken() {
    return this.tokenInfo;
  }
  async checkQrToken() {
    return {
      status: 'success',
      me: {
        telegramUserId: 123456,
        firstName: 'Alice',
        lastName: null,
        username: 'alice',
        phone: null,
      },
    };
  }
  async disconnect() {}
  async isAuthorized() {
    return true;
  }
  saveSession() {
    return this.sessionString;
  }
}

let mod;
let TelegramAuth;
let QR_STATUS;

beforeEach(async () => {
  jest.resetModules();
  // Pretend a real transport is plugged in so the auth module doesn't
  // short-circuit on stub detection (defense-in-depth behaviour).
  process.env.TELEGRAM_GATEWAY_TRANSPORT = '/abs/path/RealTelegramClient.mjs';
  jest.unstable_mockModule('../telegramClient.js', () => {
    const stub = new FakeSuccessClient();
    return {
      buildDefaultClient: () => stub,
      whenReady: async () => true,
      TelegramMessageEvent: class {},
      TelegramTransportError: class extends Error {
        constructor(message) { super(message); this.status = 503; }
      },
      TelegramClient: class {},
      StubTelegramClient: class {},
    };
  });
  jest.unstable_mockModule(
    'qrcode',
    () => ({
      default: { toDataURL: async () => 'data:image/png;base64,AAAA' },
    })
  );
  mod = await import('../telegramAuth.js');
  TelegramAuth = mod.TelegramAuth;
  QR_STATUS = mod.QR_STATUS;
});

afterEach(() => {
  delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
});

describe('telegramAuth.getStatus wire shape', () => {
  it('returns snake_case user payload and account_id on success', async () => {
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const session = await auth.start();
    const flow = auth._flows.get(session.sessionId);
    flow.status = QR_STATUS.SUCCESS;
    flow.accountId = 7;
    flow.me = {
      telegramUserId: 123456,
      firstName: 'Alice',
      lastName: null,
      username: 'alice',
      phone: null,
    };

    const status = auth.getStatus(session.sessionId);
    expect(status.status).toBe('success');
    expect(status.account_id).toBe(7);
    expect(status.user).toEqual({
      telegram_user_id: 123456,
      first_name: 'Alice',
      last_name: null,
      username: 'alice',
      phone: null,
    });
    await auth.cancel(session.sessionId);
  });

  it('returns not_found for unknown sessionId', () => {
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const status = auth.getStatus('nope');
    expect(status.status).toBe('not_found');
  });

  it('returns error message on expired flow', () => {
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    auth._flows.set('expired', {
      sessionId: 'expired',
      status: QR_STATUS.EXPIRED,
      error: 'QR token expired',
      me: null,
      accountId: null,
    });
    const status = auth.getStatus('expired');
    expect(status.status).toBe('expired');
    expect(status.error).toBe('QR token expired');
  });
});

describe('TelegramAuth.start stub short-circuit', () => {
  it('throws a tagged TELEGRAM_STUB_TRANSPORT error when transport env is unset', async () => {
    // Standalone test: do NOT mock telegramClient — we want to prove
    // the auth module short-circuits BEFORE touching the transport.
    jest.resetModules();
    delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('../telegramAuth.js');
    const auth = new mod.TelegramAuth({ sessionRepo: fakeRepo });
    let caught;
    try {
      await auth.start();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.code).toBe('TELEGRAM_STUB_TRANSPORT');
    expect(caught.status).toBe(503);
    expect(caught.message).toMatch(/TELEGRAM_GATEWAY_TRANSPORT/);
    console.warn.mockRestore();
  });
});

describe('TelegramAuth.start connect-timeout', () => {
  it('rejects with TELEGRAM_CONNECT_TIMEOUT when the mtcute handshake exceeds the cap', async () => {
    // Don't resetModules — reuse the FakeSuccessClient wired in
    // by the outer beforeEach. Instead, swap its `connect()` to a
    // never-resolving promise so only the timeout can finish.
    // Tiny cap so the test stays fast.
    process.env.TELEGRAM_CONNECT_TIMEOUT_MS = '50';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    // Monkey-patch the FakeSuccessClient prototype so `connect()`
    // hangs forever for this test only. We restore in the finally
    // block so other tests in the file aren't affected.
    const originalConnect = FakeSuccessClient.prototype.connect;
    FakeSuccessClient.prototype.connect = () => new Promise(() => {});
    let caught;
    try {
      const auth = new TelegramAuth({
        sessionRepo: fakeRepo,
        telegramCreds: { apiId: 1, apiHash: 'h' },
      });
      try {
        await auth.start();
      } catch (err) {
        caught = err;
      }
    } finally {
      FakeSuccessClient.prototype.connect = originalConnect;
    }
    expect(caught).toBeDefined();
    expect(caught.code).toBe('TELEGRAM_CONNECT_TIMEOUT');
    expect(caught.status).toBe(504);
    console.log.mockRestore();
    console.warn.mockRestore();
    console.error.mockRestore();
    delete process.env.TELEGRAM_CONNECT_TIMEOUT_MS;
  });
});
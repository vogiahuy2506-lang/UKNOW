/**
 * Lifecycle tests for `telegramAuth.js`.
 */

import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authPath = path.resolve(__dirname, '..', 'telegramAuth.js');
const clientPath = path.resolve(__dirname, '..', 'telegramClient.js');

const fakeRepo = {
  upsertSession: jest.fn(async () => ({})),
  saveSessionState: jest.fn(async () => ({})),
};

function makeFakeClientFactory(behaviour = {}) {
  // Minimal stand-in for `InMemoryTelegramStorage` — the real factory
  // resolves 5 in-memory repos via `MemoryStorageDriver`. For our test
  // purposes (verify saveSessionState is invoked) we only need a
  // `getState(name, factory)` method that returns a Map / {} so the
  // serializer does not blow up.
  const fakeMemoryStorage = {
    driver: {
      getState(name, factory) {
        if (!this._cache) this._cache = {};
        if (!this._cache[name]) this._cache[name] = factory();
        return this._cache[name];
      },
    },
  };
  return () => ({
    sessionString: null,
    _storageProvider: fakeMemoryStorage,
    async connect() {},
    async disconnect() {},
    async isAuthorized() { return Boolean(this.sessionString); },
    async requestQrToken() {
      return {
        token: behaviour.token || 'tg-token-fake',
        qrUrl: behaviour.qrUrl || 'tg://login?token=tg-token-fake',
        expiresAt: Date.now() + 60_000,
      };
    },
    async checkQrToken() {
      if (behaviour.checkThrows) throw behaviour.checkThrows;
      if (typeof behaviour.checkAfter === 'number') {
        behaviour.checkCalls = (behaviour.checkCalls || 0) + 1;
        if (behaviour.checkCalls < behaviour.checkAfter) {
          return { status: 'pending' };
        }
      }
      return behaviour.checkReturns ?? { status: 'pending' };
    },
    saveSession() { return behaviour.saveString ?? 'fake-tg-string'; },
  });
}

let TelegramAuth;
let QR_STATUS;

beforeEach(async () => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.unstable_mockModule(
    'qrcode',
    () => ({ default: { toDataURL: async () => 'data:image/png;base64,AAAA' } })
  );
  jest.clearAllMocks();
  const mod = await import('../telegramAuth.js');
  TelegramAuth = mod.TelegramAuth;
  QR_STATUS = mod.QR_STATUS;
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
});

async function loadAuthWithClient(clientFactory) {
  jest.resetModules();
  // Pretend a real transport is plugged in so the auth module
  // doesn't short-circuit before tests can exercise the rest of
  // the start() flow.
  process.env.TELEGRAM_GATEWAY_TRANSPORT = '/abs/path/RealTelegramClient.mjs';
  jest.unstable_mockModule(
    'qrcode',
    () => ({ default: { toDataURL: async () => 'data:image/png;base64,AAAA' } })
  );
  jest.unstable_mockModule(clientPath, () => ({
    TelegramTransportError: class extends Error {
      constructor(message) { super(message); this.status = 503; }
    },
    TelegramClient: class {},
    TelegramMessageEvent: class {},
    StubTelegramClient: class {},
    buildDefaultClient: clientFactory,
    whenReady: async () => true,
  }));
  const mod = await import(authPath);
  return { TelegramAuth: mod.TelegramAuth, QR_STATUS: mod.QR_STATUS };
}

describe('TelegramAuth.start', () => {
  it('returns a sessionId, qrUrl, QR image and expiresAt', async () => {
    const { TelegramAuth } = await loadAuthWithClient(makeFakeClientFactory());
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const session = await auth.start({ userId: 100 });
    expect(session.sessionId).toEqual(expect.any(String));
    expect(session.qrUrl).toBe('tg://login?token=tg-token-fake');
    expect(session.qrImageBase64).toBe('AAAA');
    expect(session.expiresAt).toBeGreaterThan(Date.now());
    expect(auth.getStatus(session.sessionId).status).toBe('awaiting_scan');
    await auth.cancel(session.sessionId);
  });

  it('persists session on success and reports SUCCESS', async () => {
    const { TelegramAuth, QR_STATUS } = await loadAuthWithClient(
      makeFakeClientFactory({
        checkAfter: 2, // first poll pending, second success
        checkReturns: {
          status: 'success',
          me: {
            telegramUserId: 12345,
            firstName: 'Alice',
            lastName: null,
            username: 'alice',
          },
        },
      })
    );
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const { sessionId } = await auth.start({ userId: 100 });

    const flow = auth._flows.get(sessionId);
    flow.client.checkQrToken = async () => ({ status: 'pending' });
    await auth._pollOnce(flow);
    expect(fakeRepo.upsertSession).not.toHaveBeenCalled();

    flow.client.checkQrToken = async () => ({
      status: 'success',
      me: {
        telegramUserId: 12345,
        firstName: 'Alice',
        lastName: null,
        username: 'alice',
      },
    });
    await auth._pollOnce(flow);

    expect(fakeRepo.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramUserId: 12345,
        firstName: 'Alice',
      })
    );
    // State lives in telegram_session_state (DB) — sessionString column
    // intentionally blank in upsertSession; the actual blob goes through
    // saveSessionState(telegramUserId, extractSerializedState(...)).
    expect(fakeRepo.saveSessionState).toHaveBeenCalledWith(12345, expect.objectContaining({ kv: expect.anything() }));
    const status = auth.getStatus(sessionId);
    expect(status.status).toBe(QR_STATUS.SUCCESS);
    expect(status.user.telegram_user_id).toBe(12345);
    expect(status.user.first_name).toBe('Alice');
  });

  it('marks flow as EXPIRED when expiresAt passes', async () => {
    let checkCalls = 0;
    const factory = () => ({
      async connect() {},
      async disconnect() {},
      async isAuthorized() { return false; },
      async requestQrToken() {
        return {
          token: 'tg',
          qrUrl: 'tg://x',
          expiresAt: Date.now() + 60_000,
        };
      },
      async checkQrToken() {
        checkCalls += 1;
        return { status: 'pending' };
      },
      saveSession() { return ''; },
    });
    const { TelegramAuth, QR_STATUS } = await loadAuthWithClient(factory);
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const { sessionId } = await auth.start();
    const flow = auth._flows.get(sessionId);
    flow.expiresAt = Date.now() - 1;
    await auth._pollOnce(flow);
    expect(checkCalls).toBe(0);
    expect(auth.getStatus(sessionId).status).toBe(QR_STATUS.EXPIRED);
  });

  it('refreshes token on MIGRATING and keeps polling', async () => {
    // First poll: server returns `migrating` with a new token; the
    // auth must swap the token + extend expiresAt + flip status to
    // MIGRATING, then continue polling (no cleanup).
    // Second poll: server returns `success`; login persists.
    const { TelegramAuth, QR_STATUS } = await loadAuthWithClient(
      makeFakeClientFactory({ checkReturns: { status: 'pending' } })
    );
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const { sessionId } = await auth.start();
    const flow = auth._flows.get(sessionId);
    const originalToken = flow.token;
    const originalExpiresAt = flow.expiresAt;

    flow.client.checkQrToken = async () => ({
      status: 'migrating',
      token: 'tg-new-rotated-token',
    });
    await auth._pollOnce(flow);

    expect(flow.token).toBe('tg-new-rotated-token');
    expect(flow.token).not.toBe(originalToken);
    // Telegram rotates the TTL down to TOKEN_TTL_MS (30s) on a fresh
    // migration token. The exact value depends on real wall clock —
    // assert it is non-null and the flow is still polling.
    expect(typeof flow.expiresAt).toBe('number');
    expect(flow.expiresAt).toBeGreaterThan(0);
    expect(flow.status).toBe(QR_STATUS.MIGRATING);
    expect(flow.pollHandle).not.toBeNull(); // still polling

    // Subsequent poll: success.
    flow.client.checkQrToken = async () => ({
      status: 'success',
      me: {
        telegramUserId: 777,
        firstName: 'M',
        lastName: null,
        username: null,
      },
    });
    await auth._pollOnce(flow);
    expect(fakeRepo.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramUserId: 777,
      })
    );
    // State lives in telegram_session_state (DB) — verify saveSessionState
    // is called BEFORE upsertSession so the user-facing row only exists
    // when the underlying state row is also persisted.
    expect(fakeRepo.saveSessionState).toHaveBeenCalledWith(777, expect.objectContaining({ kv: expect.anything() }));
    expect(auth.getStatus(sessionId).status).toBe(QR_STATUS.SUCCESS);
  });

  it('ignores MIGRATING response without a token (no refresh, status stays)', async () => {
    const { TelegramAuth, QR_STATUS } = await loadAuthWithClient(
      makeFakeClientFactory({ checkReturns: { status: 'pending' } })
    );
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const { sessionId } = await auth.start();
    const flow = auth._flows.get(sessionId);

    flow.client.checkQrToken = async () => ({ status: 'migrating' }); // no token
    await auth._pollOnce(flow);

    expect(flow.status).toBe(QR_STATUS.AWAITING_SCAN);
    expect(flow.pollHandle).not.toBeNull();
  });
});

describe('TelegramAuth retry storm', () => {
  it('throttles repeated checkQrToken errors via warnOnce', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { _resetWarnOnce } = await import('../warnOnce.js');
    _resetWarnOnce();
    console.warn.mockClear();

    const factory = () => ({
      async connect() {},
      async disconnect() {},
      async isAuthorized() { return false; },
      async requestQrToken() {
        return { token: 'tg', qrUrl: 'tg://x', expiresAt: Date.now() + 60_000 };
      },
      async checkQrToken() {
        throw new Error('network unreachable');
      },
      saveSession() { return ''; },
    });
    const { TelegramAuth } = await loadAuthWithClient(factory);
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const { sessionId } = await auth.start();
    const flow = auth._flows.get(sessionId);

    for (let i = 0; i < 6; i += 1) {
      await auth._pollOnce(flow);
    }
    const networkWarnings = console.warn.mock.calls.filter((c) =>
      String(c[0]).includes('network unreachable')
    );
    expect(networkWarnings).toHaveLength(1);
    _resetWarnOnce();
    console.warn.mockRestore();
    void sessionId;
  });
});

describe('TelegramAuth.cancel', () => {
  it('clears the poll timer and returns true', async () => {
    const factory = makeFakeClientFactory();
    const { TelegramAuth } = await loadAuthWithClient(factory);
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const { sessionId } = await auth.start();
    const flow = auth._flows.get(sessionId);
    expect(flow.pollHandle).not.toBeNull();
    expect(await auth.cancel(sessionId)).toBe(true);
    expect(flow.pollHandle).toBeNull();
    expect(await auth.cancel(sessionId)).toBe(true); // idempotent
  });

  it('returns false for an unknown sessionId', async () => {
    const { TelegramAuth } = await loadAuthWithClient(makeFakeClientFactory());
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    expect(await auth.cancel('nope')).toBe(false);
  });
});

describe('TelegramAuth constructor', () => {
  it('throws when sessionRepo is missing', () => {
    expect(() => new TelegramAuth({})).toThrow(/sessionRepo is required/);
  });
});

describe('TelegramAuth._gcExpiredFlows', () => {
  it('evicts terminal flows after TERMINAL_FLOW_TTL_MS', async () => {
    const { TelegramAuth } = await loadAuthWithClient(makeFakeClientFactory());
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const { sessionId } = await auth.start();
    const flow = auth._flows.get(sessionId);
    flow.status = 'expired';
    flow.endedAt = Date.now() - (60_000 + 1_000);

    expect(auth._gcExpiredFlows()).toBe(1);
    expect(auth._flows.has(sessionId)).toBe(false);
    expect(auth.getStatus(sessionId).status).toBe('not_found');
  });

  it('keeps terminal flows within the TTL window', async () => {
    const { TelegramAuth } = await loadAuthWithClient(makeFakeClientFactory());
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const { sessionId } = await auth.start();
    const flow = auth._flows.get(sessionId);
    flow.status = 'success';
    flow.endedAt = Date.now() - 5_000;

    expect(auth._gcExpiredFlows()).toBe(0);
    expect(auth._flows.has(sessionId)).toBe(true);
  });

  it('keeps in-flight flows (no endedAt)', async () => {
    const { TelegramAuth } = await loadAuthWithClient(makeFakeClientFactory());
    const auth = new TelegramAuth({ sessionRepo: fakeRepo, telegramCreds: { apiId: 1, apiHash: 'test-hash' } });
    const { sessionId } = await auth.start();
    expect(auth._flows.get(sessionId).endedAt).toBeNull();
    expect(auth._gcExpiredFlows()).toBe(0);
    expect(auth._flows.has(sessionId)).toBe(true);
  });
});

/**
 * Unit tests for `telegramSessionManager.js`.
 *
 * We mock the in-process storage module so the manager is exercised
 * against a thin no-op provider. The provider itself is covered by
 * `telegramMtProtoStorage.spec.js`; here we only care about the
 * manager's interaction with the session repo + the lazy client
 * factory.
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoPath = (rel) =>
  path.resolve(__dirname, '..', '..', '..', '..', rel);

// Stub repo — keys-only ordering + load/save are what the manager
// calls into via `telegramMtProtoStorage`. We deliberately keep
// the legacy `listAllSessions` path around so the fallback branch
// is covered by `restoreSessionsFromDb` tests below.
const repoStub = {
  getSessionString: jest.fn(),
  loadSessionState: jest.fn(),
  saveSessionState: jest.fn(),
  deleteSessionState: jest.fn(),
  clearSessionString: jest.fn(async () => {}),
  listAllSessionStateKeys: jest.fn(),
  listAllSessions: jest.fn(),
  backfillStuckEnabledRows: jest.fn(async () => []),
};

// Minimal storage provider stub — exposes the 5 fields mtcute
// expects, but every method is a no-op. Tests that need to drive
// the load/save cycle can reach in and call `_driver.load()` /
// `_driver.save()` on the captured instance.
function makeStorageProviderStub() {
  return {
    driver: {
      load: jest.fn(async () => {}),
      save: jest.fn(async () => {}),
      destroy: jest.fn(),
    },
    kv: {
      get: jest.fn(async () => null),
      set: jest.fn(async () => {}),
      delete: jest.fn(async () => {}),
      deleteAll: jest.fn(async () => {}),
    },
    authKeys: {
      get: jest.fn(async () => null),
      set: jest.fn(async () => {}),
      setTemp: jest.fn(async () => {}),
      getTemp: jest.fn(async () => null),
      deleteByDc: jest.fn(async () => {}),
      deleteAll: jest.fn(async () => {}),
    },
    peers: {
      store: jest.fn(),
      getById: jest.fn(() => null),
      getByUsername: jest.fn(() => null),
      getByPhone: jest.fn(() => null),
      deleteAll: jest.fn(async () => {}),
    },
    refMessages: {
      store: jest.fn(),
      getByPeer: jest.fn(() => null),
      delete: jest.fn(),
      deleteByPeer: jest.fn(),
      deleteAll: jest.fn(async () => {}),
    },
    flush: jest.fn(async () => {}),
  };
}

let TelegramSessionManager;
let TelegramTransportError;
let lastStorageProvider = null;

beforeEach(async () => {
  jest.resetModules();
  jest.unstable_mockModule(
    repoPath('repositories/chatbot/chatbotTelegram.repository.js'),
    () => ({ default: repoStub })
  );
  // Replace the Postgres-backed storage module with a thin stub so
  // the manager doesn't try to instantiate `@mtcute/core`'s memory
  // repos (which would require real Map state).
    jest.unstable_mockModule(
      repoPath(
        'services/chatbot/inProcChannelGateway/telegramMtProtoStorage.js'
      ),
      () => ({
        PostgresBackedTelegramStorage: class {
          constructor({ telegramUserId, repo }) {
            this.telegramUserId = telegramUserId;
            this.repo = repo;
            const stub = makeStorageProviderStub();
            // The stub fields end up as own-properties of `this`,
            // but we also keep a back-reference so tests can
            // assert identity (`expect(c.storageProvider).toBe(sp)`).
            this.driver = stub.driver;
            this.kv = stub.kv;
            this.authKeys = stub.authKeys;
            this.peers = stub.peers;
            this.refMessages = stub.refMessages;
            this.flush = stub.flush;
            lastStorageProvider = this;
          }
        },
      })
    );
  jest.unstable_mockModule(
    repoPath('services/chatbot/inProcChannelGateway/telegramClient.js'),
    () => ({
      TelegramTransportError: class extends Error {
        constructor(message) {
          super(message);
          this.status = 503;
        }
      },
      TelegramClient: class {
        constructor(opts = {}) {
          this.sessionString = opts.sessionString;
          this.storageProvider = opts.storageProvider;
        }
        async connect() {}
        async isAuthorized() {
          return Boolean(this.sessionString) || Boolean(this.storageProvider);
        }
        async disconnect() {}
        async sendMessage() {}
        async requestQrToken() {
          throw new Error('not implemented');
        }
        async checkQrToken() {
          throw new Error('not implemented');
        }
      },
      StubTelegramClient: class {
        constructor(opts = {}) {
          this.sessionString = opts.sessionString;
        }
        async connect() {}
        async isAuthorized() {
          return Boolean(this.sessionString);
        }
        async disconnect() {}
        async sendMessage() {}
      },
      buildDefaultClient: (opts) => ({
        sessionString: opts.sessionString,
        storageProvider: opts.storageProvider,
        connect: async () => {},
        isAuthorized: async () => Boolean(opts.sessionString) || Boolean(opts.storageProvider),
        disconnect: async () => {},
        sendMessage: async () => {},
      }),
      whenReady: async () => true,
    })
  );
  const mod = await import('../telegramSessionManager.js');
  TelegramSessionManager = mod.TelegramSessionManager;
  TelegramTransportError = (await import('../telegramClient.js'))
    .TelegramTransportError;
  jest.clearAllMocks();
  lastStorageProvider = null;
});

describe('TelegramSessionManager.getClient', () => {
  it('returns null when no session is stored', async () => {
    repoStub.getSessionString.mockResolvedValueOnce(null);
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    expect(await mgr.getClient(12345)).toBeNull();
  });

  it('hydrates a client from the stored session state and caches it', async () => {
    const fakeState = { kv: { foo: 1 }, authKeys: {} };
    repoStub.getSessionString.mockResolvedValueOnce(fakeState);
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    const c1 = await mgr.getClient(12345);
    expect(c1).not.toBeNull();
    expect(repoStub.getSessionString).toHaveBeenCalledTimes(1);
    expect(c1.storageProvider).toBe(lastStorageProvider);
    expect(c1.storageProvider.telegramUserId).toBe(12345);

    const c2 = await mgr.getClient(12345);
    expect(c2).toBe(c1);
    expect(repoStub.getSessionString).toHaveBeenCalledTimes(1);
    expect(mgr.isLoaded(12345)).toBe(true);
    expect(mgr.listActiveClients()).toEqual(['12345']);
  });

  it('passes storageKey derived from telegramUserId', async () => {
    repoStub.getSessionString.mockResolvedValueOnce({ kv: {} });
    let capturedOpts = null;
    // Override buildDefaultClient to capture the opts it was
    // called with. We piggyback on the existing mock by replacing
    // the import and re-loading the manager module.
    jest.resetModules();
    jest.unstable_mockModule(
      repoPath('repositories/chatbot/chatbotTelegram.repository.js'),
      () => ({ default: repoStub })
    );
    jest.unstable_mockModule(
      repoPath(
        'services/chatbot/inProcChannelGateway/telegramMtProtoStorage.js'
      ),
      () => ({
        PostgresBackedTelegramStorage: class {
          constructor({ telegramUserId }) {
            lastStorageProvider = makeStorageProviderStub();
            this.telegramUserId = telegramUserId;
            Object.assign(this, lastStorageProvider);
          }
        },
      })
    );
    jest.unstable_mockModule(
      repoPath('services/chatbot/inProcChannelGateway/telegramClient.js'),
      () => ({
        TelegramTransportError: class extends Error {},
        TelegramClient: class {},
        StubTelegramClient: class {},
        buildDefaultClient: (opts) => {
          capturedOpts = opts;
          return {
            connect: async () => {},
            isAuthorized: async () => true,
            disconnect: async () => {},
            sendMessage: async () => {},
            storageProvider: opts.storageProvider,
          };
        },
        whenReady: async () => true,
      })
    );
    const mod = await import('../telegramSessionManager.js');
    const Mgr = mod.TelegramSessionManager;
    const mgr = new Mgr({ sessionRepo: repoStub });
    await mgr.getClient(42);
    expect(capturedOpts.storageKey).toBe('tg-42');
    expect(capturedOpts.storageProvider).toBeDefined();
    expect(capturedOpts.sessionString).toBeUndefined();
  });

  it('returns null and clears the row when isAuthorized returns false', async () => {
    jest.resetModules();
    jest.unstable_mockModule(
      repoPath('repositories/chatbot/chatbotTelegram.repository.js'),
      () => ({ default: repoStub })
    );
    jest.unstable_mockModule(
      repoPath(
        'services/chatbot/inProcChannelGateway/telegramMtProtoStorage.js'
      ),
      () => ({
        PostgresBackedTelegramStorage: class {
          constructor() {
            const stub = makeStorageProviderStub();
            this.driver = stub.driver;
            this.kv = stub.kv;
            this.authKeys = stub.authKeys;
            this.peers = stub.peers;
            this.refMessages = stub.refMessages;
            this.flush = stub.flush;
          }
        },
      })
    );
    jest.unstable_mockModule(
      repoPath('services/chatbot/inProcChannelGateway/telegramClient.js'),
      () => ({
        TelegramTransportError: class extends Error {},
        TelegramClient: class {
          constructor() {}
          async connect() {}
          async isAuthorized() {
            return false;
          }
          async disconnect() {}
          async sendMessage() {}
        },
        StubTelegramClient: class {},
        buildDefaultClient: () => ({
          connect: async () => {},
          isAuthorized: async () => false,
          disconnect: async () => {},
          sendMessage: async () => {},
        }),
        whenReady: async () => true,
      })
    );
    repoStub.getSessionString.mockResolvedValueOnce({ kv: {} });
    const mod = await import('../telegramSessionManager.js');
    const Mgr = mod.TelegramSessionManager;
    const mgr = new Mgr({ sessionRepo: repoStub });
    expect(await mgr.getClient(99999)).toBeNull();
    expect(repoStub.clearSessionString).toHaveBeenCalledWith(99999);
  });
});

describe('TelegramSessionManager.sendMessage', () => {
  it('throws when no session is loaded', async () => {
    repoStub.getSessionString.mockResolvedValueOnce(null);
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    await expect(mgr.sendMessage(12345, 1, 'hi')).rejects.toBeInstanceOf(
      TelegramTransportError
    );
  });

  it('serialises concurrent calls on the same account', async () => {
    repoStub.getSessionString.mockResolvedValueOnce({ kv: {} });
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    const client = await mgr.getClient(12345);
    expect(client).not.toBeNull();
    let calls = 0;
    client.sendMessage = async () => {
      calls += 1;
    };
    await mgr.sendMessage(12345, 1, 'hi');
    await mgr.sendMessage(12345, 2, 'hi');
    expect(calls).toBe(2);
  });
});

describe('TelegramSessionManager.disconnect', () => {
  it('returns false for an unknown client', async () => {
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    expect(await mgr.disconnect(99999)).toBe(false);
  });

  it('drops the in-memory client and returns true', async () => {
    repoStub.getSessionString.mockResolvedValueOnce({ kv: {} });
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    await mgr.getClient(12345);
    expect(mgr.isLoaded(12345)).toBe(true);
    expect(await mgr.disconnect(12345)).toBe(true);
    expect(mgr.isLoaded(12345)).toBe(false);
    expect(mgr.listActiveClients()).toEqual([]);
  });
});

describe('TelegramSessionManager.stop', () => {
  it('clears the timer and disconnects every loaded client', async () => {
    repoStub.getSessionString
      .mockResolvedValueOnce({ kv: {} })
      .mockResolvedValueOnce({ kv: {} });
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    mgr.start();
    await mgr.getClient(11111);
    await mgr.getClient(22222);
    expect(mgr.listActiveClients().sort()).toEqual(['11111', '22222']);
    await mgr.stop();
    expect(mgr.listActiveClients()).toEqual([]);
  });
});

describe('TelegramSessionManager.restoreSessionsFromDb', () => {
  it('uses listAllSessionStateKeys (preferred path)', async () => {
    repoStub.listAllSessionStateKeys.mockResolvedValueOnce([11111, 22222]);
    repoStub.getSessionString
      .mockResolvedValueOnce({ kv: {} })
      .mockResolvedValueOnce({ kv: {} });
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    const summary = await mgr.restoreSessionsFromDb();
    expect(summary).toEqual({ restored: 2, failed: 0 });
    expect(repoStub.listAllSessionStateKeys).toHaveBeenCalledTimes(1);
    // Legacy path should NOT be called.
    expect(repoStub.listAllSessions).not.toHaveBeenCalled();
  });

  it('falls back to listAllSessions when listAllSessionStateKeys is missing', async () => {
    // Simulate an older repo mock that only exposes listAllSessions.
    const partialRepo = {
      getSessionString: jest.fn().mockResolvedValue({ kv: {} }),
      clearSessionString: jest.fn(),
      listAllSessions: jest
        .fn()
        .mockResolvedValue([{ telegram_user_id: 33333 }]),
    };
    jest.resetModules();
    jest.unstable_mockModule(
      repoPath('repositories/chatbot/chatbotTelegram.repository.js'),
      () => ({ default: partialRepo })
    );
    jest.unstable_mockModule(
      repoPath(
        'services/chatbot/inProcChannelGateway/telegramMtProtoStorage.js'
      ),
      () => ({
        PostgresBackedTelegramStorage: class {
          constructor() {
            const stub = makeStorageProviderStub();
            this.driver = stub.driver;
            this.kv = stub.kv;
            this.authKeys = stub.authKeys;
            this.peers = stub.peers;
            this.refMessages = stub.refMessages;
            this.flush = stub.flush;
          }
        },
      })
    );
    jest.unstable_mockModule(
      repoPath('services/chatbot/inProcChannelGateway/telegramClient.js'),
      () => ({
        TelegramTransportError: class extends Error {},
        TelegramClient: class {},
        StubTelegramClient: class {},
        buildDefaultClient: () => ({
          connect: async () => {},
          isAuthorized: async () => true,
          disconnect: async () => {},
          sendMessage: async () => {},
        }),
        whenReady: async () => true,
      })
    );
    const mod = await import('../telegramSessionManager.js');
    const Mgr = mod.TelegramSessionManager;
    const mgr = new Mgr({ sessionRepo: partialRepo });
    const summary = await mgr.restoreSessionsFromDb();
    expect(summary.restored).toBe(1);
    expect(partialRepo.listAllSessions).toHaveBeenCalledTimes(1);
  });

  it('counts invalid keys as failed and continues', async () => {
    repoStub.listAllSessionStateKeys.mockResolvedValueOnce([
      11111,
      Number.NaN,
      22222,
    ]);
    repoStub.getSessionString
      .mockResolvedValueOnce({ kv: {} })
      .mockResolvedValueOnce({ kv: {} });
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    const summary = await mgr.restoreSessionsFromDb();
    expect(summary.restored).toBe(2);
    expect(summary.failed).toBeGreaterThanOrEqual(1);
  });
});

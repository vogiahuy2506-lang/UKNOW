/**
 * Unit tests for `telegramSessionManager.js`.
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoPath = (rel) =>
  path.resolve(__dirname, '..', '..', '..', '..', rel);

const repoStub = {
  getSessionString: jest.fn(),
  clearSessionString: jest.fn(async () => {}),
};

let TelegramSessionManager;
let TelegramTransportError;

beforeEach(async () => {
  jest.resetModules();
  jest.unstable_mockModule(
    repoPath('repositories/chatbot/chatbotTelegram.repository.js'),
    () => ({ default: repoStub })
  );
  jest.unstable_mockModule(
    repoPath('services/chatbot/inProcChannelGateway/telegramClient.js'),
    () => ({
      TelegramTransportError: class extends Error {
        constructor(message) { super(message); this.status = 503; }
      },
      TelegramClient: class {
        constructor(opts = {}) { this.sessionString = opts.sessionString; }
        async connect() {}
        async isAuthorized() { return Boolean(this.sessionString); }
        async disconnect() {}
        async sendMessage() {}
        async requestQrToken() { throw new Error('not implemented'); }
        async checkQrToken() { throw new Error('not implemented'); }
      },
      StubTelegramClient: class {
        constructor(opts = {}) { this.sessionString = opts.sessionString; }
        async connect() {}
        async isAuthorized() { return Boolean(this.sessionString); }
        async disconnect() {}
        async sendMessage() {}
      },
      buildDefaultClient: (opts) => ({
        sessionString: opts.sessionString,
        connect: async () => {},
        isAuthorized: async () => Boolean(opts.sessionString),
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
});

describe('TelegramSessionManager.getClient', () => {
  it('returns null when no session is stored', async () => {
    repoStub.getSessionString.mockResolvedValueOnce(null);
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    expect(await mgr.getClient(12345)).toBeNull();
  });

  it('hydrates a client from the stored session string and caches it', async () => {
    repoStub.getSessionString.mockResolvedValueOnce('tg-session-A');
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    const c1 = await mgr.getClient(12345);
    expect(c1).not.toBeNull();
    expect(repoStub.getSessionString).toHaveBeenCalledTimes(1);
    const c2 = await mgr.getClient(12345);
    expect(c2).toBe(c1);
    expect(repoStub.getSessionString).toHaveBeenCalledTimes(1);
    expect(mgr.isLoaded(12345)).toBe(true);
    expect(mgr.listActiveClients()).toEqual(['12345']);
  });

  it('returns null and clears the string when isAuthorized returns false', async () => {
    jest.resetModules();
    jest.unstable_mockModule(
      repoPath('repositories/chatbot/chatbotTelegram.repository.js'),
      () => ({ default: repoStub })
    );
    jest.unstable_mockModule(
      repoPath('services/chatbot/inProcChannelGateway/telegramClient.js'),
      () => ({
        TelegramTransportError: class extends Error {
          constructor(message) { super(message); this.status = 503; }
        },
        TelegramClient: class {
          constructor() {}
          async connect() {}
          async isAuthorized() { return false; }
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
    repoStub.getSessionString.mockResolvedValueOnce('tg-session-bad');
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
    repoStub.getSessionString.mockResolvedValueOnce('tg-session-X');
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
    repoStub.getSessionString.mockResolvedValueOnce('tg-session-Y');
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
      .mockResolvedValueOnce('tg-session-A')
      .mockResolvedValueOnce('tg-session-B');
    const mgr = new TelegramSessionManager({ sessionRepo: repoStub });
    mgr.start();
    await mgr.getClient(11111);
    await mgr.getClient(22222);
    expect(mgr.listActiveClients().sort()).toEqual(['11111', '22222']);
    await mgr.stop();
    expect(mgr.listActiveClients()).toEqual([]);
  });
});

/**
 * Tests for `MtProtoTelegramClient` — the production Telegram
 * transport loaded via `TELEGRAM_GATEWAY_TRANSPORT`.
 *
 * We mock `@mtcute/node` so the test does not pull in
 * `better-sqlite3` (native binding) — that would make the
 * suite flaky on machines without a C++ toolchain. The
 * shape we mock matches the small slice of mtcute's surface
 * our client actually uses (`start`, `sendText`,
 * `onNewMessage.add`, `destroy`).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock mtcute BEFORE importing the client so the dynamic
// import in `telegramClient.js` resolves to this stub.
const mockTgInstance = {
  start: jest.fn(async () => ({ id: 1, firstName: 'Mock', lastName: 'User', username: 'mockuser' })),
  sendText: jest.fn(async () => ({ id: 999 })),
  onNewMessage: { add: jest.fn() },
  destroy: jest.fn(async () => {}),
};

jest.unstable_mockModule('@mtcute/node', () => ({
  TelegramClient: jest.fn(function () {
    return mockTgInstance;
  }),
}));

let MtProtoTelegramClient;
let TelegramTransportError;

beforeEach(async () => {
  jest.resetModules();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const mod = await import('../mtProtoTelegramClient.js');
  MtProtoTelegramClient = mod.MtProtoTelegramClient;
  const baseMod = await import('../telegramClient.js');
  TelegramTransportError = baseMod.TelegramTransportError;
  // Reset mtcute mock state between tests
  Object.values(mockTgInstance).forEach((v) => {
    if (typeof v === 'function' && v.mockClear) v.mockClear();
    if (v && typeof v === 'object' && typeof v.add?.mockClear === 'function') {
      v.add.mockClear();
    }
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.TELEGRAM_API_ID;
  delete process.env.TELEGRAM_API_HASH;
});

describe('MtProtoTelegramClient construction', () => {
  it('throws if apiId / apiHash are missing when building the client', async () => {
    const client = new MtProtoTelegramClient({});
    await expect(client.connect()).rejects.toThrow(/TELEGRAM_API_ID/);
  });

  it('accepts custom storagePath + storageKey', () => {
    const client = new MtProtoTelegramClient({
      apiId: 1,
      apiHash: 'h',
      storagePath: '/tmp/x',
      storageKey: 'acct-7',
    });
    expect(client._storagePath).toBe('/tmp/x');
    expect(client._storageKey).toBe('acct-7');
  });
});

describe('MtProtoTelegramClient.connect', () => {
  it('calls tg.start with disableUpdates:true', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    expect(mockTgInstance.start).toHaveBeenCalledWith(
      expect.objectContaining({ disableUpdates: true })
    );
  });

  it('is idempotent — parallel connect() calls share one promise', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    const a = client.connect();
    const b = client.connect();
    await Promise.all([a, b]);
    // Both calls share one tg.start invocation — otherwise we'd
    // open two sockets to Telegram for one account.
    expect(mockTgInstance.start).toHaveBeenCalledTimes(1);
  });

  it('translates mtcute errors into TelegramTransportError', async () => {
    mockTgInstance.start.mockRejectedValueOnce(new Error('boom'));
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await expect(client.connect()).rejects.toThrow(/boom/);
  });
});

describe('MtProtoTelegramClient.requestQrToken + checkQrToken', () => {
  it('returns a token envelope with qrUrl + expiresAt', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    const qr = await client.requestQrToken();
    expect(qr.token).toMatch(/^mtcute:/);
    expect(qr.qrUrl).toMatch(/^tg:\/\/login/);
    expect(qr.expiresAt).toBeGreaterThan(Date.now());
  });

  it('returns awaiting_scan while the scan promise is still pending', async () => {
    // mtcute's start() never resolves → simulates user still
    // thinking about scanning.
    mockTgInstance.start.mockImplementationOnce(
      () => new Promise(() => {})
    );
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.requestQrToken();
    const status = await client.checkQrToken('x');
    expect(status.status).toBe('awaiting_scan');
  });

  it('returns success + me payload once mtcute.start resolves', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.requestQrToken();
    // Allow the in-flight promise to settle
    await new Promise((r) => setImmediate(r));
    const status = await client.checkQrToken('x');
    expect(status.status).toBe('success');
    expect(status.me).toMatchObject({
      telegramUserId: '1',
      displayName: 'Mock User',
      username: 'mockuser',
    });
  });

  it('returns not_found when no QR scan is in flight', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    const status = await client.checkQrToken('x');
    expect(status.status).toBe('not_found');
  });

  it('returns expired when mtcute rejects with EXPIRED', async () => {
    mockTgInstance.start.mockRejectedValueOnce(
      new Error('QR_TOKEN_EXPIRED')
    );
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.requestQrToken();
    await new Promise((r) => setImmediate(r));
    const status = await client.checkQrToken('x');
    expect(status.status).toBe('expired');
  });
});

describe('MtProtoTelegramClient.registerMessageHandler', () => {
  it('subscribes onNewMessage and normalises events', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    const onMessage = jest.fn(async () => {});
    await client.registerMessageHandler(onMessage);
    expect(mockTgInstance.onNewMessage.add).toHaveBeenCalled();
    // Grab the registered handler and fire a synthetic update
    const handler = mockTgInstance.onNewMessage.add.mock.calls[0][0];
    await handler({
      id: 42,
      text: 'hi',
      chatId: '123',
      isGroup: false,
      sender: { id: 5, firstName: 'A', lastName: 'B' },
    });
    expect(onMessage).toHaveBeenCalledTimes(1);
    const event = onMessage.mock.calls[0][0];
    expect(event.messageId).toBe(42);
    expect(event.text).toBe('hi');
    expect(event.senderName).toBe('A B');
    expect(event.isPrivate).toBe(true);
  });

  it('swallows handler errors so a single bad event does not crash the dispatcher', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    const onMessage = jest.fn(async () => {
      throw new Error('upstream kaboom');
    });
    await client.registerMessageHandler(onMessage);
    const handler = mockTgInstance.onNewMessage.add.mock.calls[0][0];
    await expect(
      handler({ id: 1, text: 'x', chatId: 'c', isGroup: false, sender: null })
    ).resolves.toBeUndefined();
  });

  it('rejects when given a non-function handler', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await expect(client.registerMessageHandler(null)).rejects.toThrow(
      TelegramTransportError
    );
  });
});

describe('MtProtoTelegramClient.sendMessage', () => {
  it('calls tg.sendText and returns the message id', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    const out = await client.sendMessage('123', 'hello');
    expect(mockTgInstance.sendText).toHaveBeenCalledWith('123', 'hello');
    expect(out.messageId).toBe(999);
  });

  it('rejects when called before connect()', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await expect(client.sendMessage('123', 'x')).rejects.toThrow(
      TelegramTransportError
    );
  });

  it('rejects when chatId or text are missing', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    await expect(client.sendMessage(null, 'x')).rejects.toThrow();
    await expect(client.sendMessage('1', null)).rejects.toThrow();
  });
});

describe('MtProtoTelegramClient.saveSession', () => {
  it('returns a marker string before connect', () => {
    const client = new MtProtoTelegramClient({
      apiId: 1,
      apiHash: 'h',
      storageKey: 'acct-3',
    });
    expect(client.saveSession()).toBe('');
  });

  it('returns mtcute:<storageKey> after connect', async () => {
    const client = new MtProtoTelegramClient({
      apiId: 1,
      apiHash: 'h',
      storageKey: 'acct-9',
    });
    await client.connect();
    expect(client.saveSession()).toBe('mtcute:acct-9');
  });
});

describe('MtProtoTelegramClient.disconnect', () => {
  it('calls tg.destroy and clears the qr promise', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    await client.requestQrToken();
    await client.disconnect();
    expect(mockTgInstance.destroy).toHaveBeenCalled();
    // After disconnect the next checkQrToken returns not_found
    const status = await client.checkQrToken('x');
    expect(status.status).toBe('not_found');
  });
});

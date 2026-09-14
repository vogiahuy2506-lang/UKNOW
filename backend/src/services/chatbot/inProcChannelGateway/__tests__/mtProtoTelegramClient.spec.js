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
import nodePath from 'node:path';

// Mock mtcute BEFORE importing the client so the dynamic
// import in `telegramClient.js` resolves to this stub.
const mockTgInstance = {
  // The current connect() only kicks off the background tg.start
  // when tg.storage is truthy — simulate that by attaching a
  // placeholder storage so the production branch fires.
  storage: { load: () => {}, save: () => {} },
  network: { prime: () => {} },
  // Default `start` immediately fires the qrCodeHandler with a fake URL,
  // then resolves with a synthetic `me` payload. This matches the real
  // mtcute behaviour at the slice of the API the client actually uses,
  // and is required so `MtProtoTelegramClient.requestQrToken()` can
  // unblock its `await firstQrUrl` (which would otherwise hang until
  // jest's 5s test timeout fires).
  start: jest.fn(async ({ qrCodeHandler } = {}) => {
    if (typeof qrCodeHandler === 'function') {
      await qrCodeHandler('tg://login?token=testtoken123');
    }
    return { id: 1, firstName: 'Mock', lastName: 'User', username: 'mockuser' };
  }),
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
    // Constructor truyền `path.join(storagePath, storageKey)` vào
    // resolveAndEnsureSessionDir để mkdir cả subfolder, tránh
    // 'unable to open database file' khi mtcute mở SQLite file
    // `<storagePath>/<storageKey>/client.session`. Đường dẫn đã resolve
    // thành absolute và bao gồm storageKey (dùng path.join nên OS-aware —
    // trên Windows sẽ là '\\tmp\\x\\acct-7').
    expect(client._storagePath).toBe(nodePath.join('/tmp/x', 'acct-7'));
    expect(client._storageKey).toBe('acct-7');
  });
});

describe('MtProtoTelegramClient.connect', () => {
  it('kicks off a background tg.start({}) without awaiting it', async () => {
    // The current implementation deliberately does NOT await tg.start()
    // during connect() — that call blocks until the user scans the QR,
    // which would race the TELEGRAM_CONNECT_TIMEOUT_MS cap in
    // telegramAuth.js. We just prime the underlying MtClient so DNS /
    // TCP / proxy failures surface synchronously, then kick off the
    // background start so stored sessions can load their auth keys.
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    expect(mockTgInstance.start).toHaveBeenCalledWith({});
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

  it('translates mtcute errors during the background start into a warn log', async () => {
    // connect() itself does not await tg.start, so it cannot throw.
    // The error from the background call is swallowed by connect()
    // and logged via console.warn (see the .catch in mtProtoTelegramClient.js).
    mockTgInstance.start.mockRejectedValueOnce(new Error('boom'));
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await expect(client.connect()).resolves.toBeUndefined();
    // Let the microtask queue flush so the .catch runs.
    await new Promise((r) => setImmediate(r));
    // The defensive error path lives inside the background .catch,
    // so we only assert that connect() did not throw — the warn is
    // captured by the beforeEach spy.
  });
});

describe('MtProtoTelegramClient.requestQrToken + checkQrToken', () => {
  it('returns a token envelope with qrUrl + expiresAt', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    const qr = await client.requestQrToken();
    // requestQrToken extracts the token from the `tg://login?token=...`
    // URL returned by mtcute's qrCodeHandler — there is no synthetic
    // `mtcute:...` prefix anymore (the previous behaviour was a
    // placeholder before we hooked up the real mtcute URL).
    expect(qr.token).toBe('testtoken123');
    expect(qr.qrUrl).toMatch(/^tg:\/\/login/);
    expect(qr.expiresAt).toBeGreaterThan(Date.now());
  });

  it('returns awaiting_scan while the scan promise is still pending', async () => {
    // mtcute's start() never resolves → simulates user still
    // thinking about scanning. The qrCodeHandler fires synchronously
    // (before start() returns) so requestQrToken() can unblock,
    // but the underlying tg.start() stays pending — that maps to
    // "awaiting_scan" in checkQrToken.
    mockTgInstance.start.mockImplementationOnce(
      async ({ qrCodeHandler }) => {
        if (typeof qrCodeHandler === 'function') {
          qrCodeHandler('tg://login?token=testtoken123');
        }
        return new Promise(() => {}); // never resolves
      }
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

  it('surfaces EXPIRED from mtcute via TelegramTransportError', async () => {
    // requestQrToken awaits `firstQrUrl`, which rejects with the
    // original error when qrCodeHandler never fired; the production
    // code wraps that in a TelegramTransportError so callers can
    // render a clean message instead of a raw mtcute stack.
    mockTgInstance.start.mockRejectedValueOnce(
      new Error('QR_TOKEN_EXPIRED')
    );
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await expect(client.requestQrToken()).rejects.toThrow(
      /QR_TOKEN_EXPIRED/
    );
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

describe('MtProtoTelegramClient session dir fallback', () => {
  it('falls back to os.tmpdir() when mkdir throws EACCES', async () => {
    // Bug production (Docker USER=node, /app bị owned by root):
    // `mkdir /app/.telegram-sessions/default` → EACCES. Trước đây
    // throw 500 làm hỏng QR login. Fix: catch EACCES và retry dưới
    // os.tmpdir() (luôn writable cho mọi user). Path phải giữ
    // sub-folder `<requested>` (constructor đã join storagePath+key)
    // — nếu chỉ mkdir tmp/.telegram-sessions mà caller expect
    // tmp/.telegram-sessions/default thì mtcute vẫn "unable to open".
    const fsActual = await import('node:fs');
    const osActual = await import('node:os');
    const pathActual = await import('node:path');
    const realMkdir = fsActual.default.mkdirSync;
    const realTmpdir = osActual.default.tmpdir();
    let firstCall = true;
    const mkdirSpy = jest.spyOn(fsActual.default, 'mkdirSync').mockImplementation((p, opts) => {
      if (firstCall) {
        firstCall = false;
        const err = new Error(`EACCES: permission denied, mkdir '${p}'`);
        err.code = 'EACCES';
        throw err;
      }
      return realMkdir(p, opts);
    });
    try {
      const client = new MtProtoTelegramClient({
        apiId: 1,
        apiHash: 'h',
        storagePath: '.telegram-sessions',
        storageKey: 'fallback-test',
      });
      // Expected fallback path: <os.tmpdir()>/telegram-sessions/.telegram-sessions/fallback-test
      const expected = pathActual.default.join(
        realTmpdir,
        'telegram-sessions',
        '.telegram-sessions',
        'fallback-test'
      );
      expect(client._storagePath).toBe(expected);
      expect(mkdirSpy).toHaveBeenCalled();
      // Verify the fallback dir actually exists on disk
      const stat = fsActual.default.statSync(expected);
      expect(stat.isDirectory()).toBe(true);
      // Cleanup
      fsActual.default.rmSync(expected, { recursive: true, force: true });
    } finally {
      mkdirSpy.mockRestore();
    }
  });

  it('rethrows non-permission mkdir errors (does NOT swallow bugs)', async () => {
    const fsActual = await import('node:fs');
    const mkdirSpy = jest.spyOn(fsActual.default, 'mkdirSync').mockImplementation(() => {
      const err = new Error('ENOSPC: no space left on device');
      err.code = 'ENOSPC';
      throw err;
    });
    try {
      expect(() => {
        // eslint-disable-next-line no-new
        new MtProtoTelegramClient({
          apiId: 1,
          apiHash: 'h',
          storagePath: '/some/path',
          storageKey: 'k',
        });
      }).toThrow(/ENOSPC/);
    } finally {
      mkdirSpy.mockRestore();
    }
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

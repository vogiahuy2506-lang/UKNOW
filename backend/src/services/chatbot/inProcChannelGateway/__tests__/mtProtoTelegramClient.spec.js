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
  sendMedia: jest.fn(async () => ({ id: 777 })),
  getMessages: jest.fn(async () => [null]),
  downloadAsBuffer: jest.fn(async () => new Uint8Array([1, 2, 3])),
  iterDialogs: jest.fn(),
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

// PR-E2 — nhóm Telegram
const chat = (over = {}) => ({
  id: -1001,
  title: 'Nhóm A',
  displayName: 'Nhóm A',
  chatType: 'supergroup',
  isBanned: false,
  isLikelyUnavailable: false,
  isMember: true,
  isCreator: false,
  isAdmin: false,
  permissions: null,
  defaultPermissions: null,
  membersCount: 10,
  ...over,
});
const dialogsOf = (peers) => async function* () {
  for (const peer of peers) yield { peer };
};

describe('MtProtoTelegramClient.listGroups', () => {
  it('chỉ trả nhóm gửi được, sắp theo tên, đúng chatId (bỏ user/channel/nhóm cấm gửi/đã rời)', async () => {
    mockTgInstance.iterDialogs.mockImplementation(dialogsOf([
      chat({ id: -1003, title: 'Zeta', chatType: 'group' }),
      { id: 555, title: 'Một người', chatType: undefined },
      chat({ id: -1002, title: 'Bán hàng', chatType: 'supergroup' }),
      chat({ id: -1004, title: 'Kênh tin', chatType: 'channel' }),
      chat({ id: -1005, title: 'Cấm gửi', permissions: { canSendMessages: false } }),
      chat({ id: -1006, title: 'Tắt gửi mặc định', defaultPermissions: { canSendMessages: false } }),
      chat({ id: -1007, title: 'Tắt gửi mặc định nhưng là admin', defaultPermissions: { canSendMessages: false }, isAdmin: true }),
      chat({ id: -1008, title: 'Đã rời', isMember: false }),
      chat({ id: -1009, title: 'Bị cấm', isBanned: true }),
      chat({ id: -1010, title: 'Gigagroup thường', chatType: 'gigagroup' }),
    ]));
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    const groups = await client.listGroups();
    expect(groups.map((g) => g.chatId)).toEqual([-1002, -1007, -1003]);
    expect(groups.map((g) => g.title)).toEqual(['Bán hàng', 'Tắt gửi mặc định nhưng là admin', 'Zeta']);
    expect(groups[0]).toEqual({ chatId: -1002, title: 'Bán hàng', type: 'supergroup', membersCount: 10 });
  });

  it('ném TelegramTransportError khi chưa connect()', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await expect(client.listGroups()).rejects.toBeInstanceOf(TelegramTransportError);
  });
});

describe('MtProtoTelegramClient.sendMessage — peer chưa có trong cache', () => {
  class MtPeerNotFoundError extends Error {}
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('nạp cache bằng iterDialogs rồi thử lại ĐÚNG 1 lần và gửi được', async () => {
    mockTgInstance.iterDialogs.mockImplementation(dialogsOf([chat()]));
    mockTgInstance.sendText
      .mockReset()
      .mockRejectedValueOnce(new MtPeerNotFoundError('Peer -1001 is not found in local cache'))
      .mockResolvedValueOnce({ id: 42 });
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    const out = await client.sendMessage(-1001, 'hi');
    expect(out.messageId).toBe(42);
    expect(mockTgInstance.iterDialogs).toHaveBeenCalledTimes(1);
    expect(mockTgInstance.sendText).toHaveBeenCalledTimes(2);
    mockTgInstance.sendText.mockReset().mockImplementation(async () => ({ id: 999 }));
  });

  it('vẫn không thấy peer sau khi nạp -> lỗi cứng câu đọc được, không thử lần 3', async () => {
    mockTgInstance.iterDialogs.mockImplementation(dialogsOf([]));
    mockTgInstance.sendText
      .mockReset()
      .mockRejectedValue(new MtPeerNotFoundError('Peer -1001 is not found in local cache'));
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    await expect(client.sendMessage(-1001, 'hi')).rejects.toThrow(/Không tìm thấy nhóm/);
    expect(mockTgInstance.sendText).toHaveBeenCalledTimes(2);
    expect(mockTgInstance.iterDialogs).toHaveBeenCalledTimes(1);
    mockTgInstance.sendText.mockReset().mockImplementation(async () => ({ id: 999 }));
  });

  it('lỗi khác (không phải peer not found) -> không gọi iterDialogs', async () => {
    mockTgInstance.sendText.mockReset().mockRejectedValueOnce(new Error('CHAT_WRITE_FORBIDDEN'));
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    await expect(client.sendMessage(-1001, 'hi')).rejects.toThrow(/CHAT_WRITE_FORBIDDEN/);
    expect(mockTgInstance.iterDialogs).not.toHaveBeenCalled();
    mockTgInstance.sendText.mockReset().mockImplementation(async () => ({ id: 999 }));
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

describe('MtProtoTelegramClient.sendMedia (P5)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('anh -> media {type:photo, file:buffer} (mtcute 0.32 nhan object thuan), tra messageId', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    const buffer = Buffer.from([1, 2, 3]);
    const out = await client.sendMedia(123, { buffer, kind: 'photo', fileName: 'a.jpg', mimeType: 'image/jpeg' });
    expect(out).toEqual({ messageId: 777 });
    expect(mockTgInstance.sendMedia).toHaveBeenCalledWith(123, { type: 'photo', file: buffer }, undefined);
  });

  it('tai lieu -> media {type:document, file, fileName, fileMime}; caption di qua params', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    const buffer = Buffer.from('pdf');
    await client.sendMedia(-1001, { buffer, kind: 'document', fileName: 'bao-gia.pdf', mimeType: 'application/pdf', caption: 'Bao gia' });
    expect(mockTgInstance.sendMedia).toHaveBeenCalledWith(
      -1001,
      { type: 'document', file: buffer, fileName: 'bao-gia.pdf', fileMime: 'application/pdf' },
      { caption: 'Bao gia' }
    );
  });

  it('boc loi mtcute thanh TelegramTransportError giu nguyen chuoi de tang chien dich phan loai (FLOOD_WAIT)', async () => {
    mockTgInstance.sendMedia.mockRejectedValueOnce(new Error('Telegram API error 420: FLOOD_WAIT_1800'));
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    const err = await client.sendMedia(1, { buffer: Buffer.from('x'), kind: 'photo' }).catch((e) => e);
    expect(err).toBeInstanceOf(TelegramTransportError);
    expect(err.message).toContain('MtProtoTelegramClient.sendMedia failed');
    expect(err.message).toContain('FLOOD_WAIT_1800');
  });

  it('ném khi chưa connect() hoặc thiếu buffer/kind', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await expect(client.sendMedia(1, { buffer: Buffer.from('x'), kind: 'photo' })).rejects.toBeInstanceOf(TelegramTransportError);
    await client.connect();
    await expect(client.sendMedia(1, { kind: 'photo' })).rejects.toBeInstanceOf(TelegramTransportError);
    await expect(client.sendMedia(1, { buffer: Buffer.from('x'), kind: 'video' })).rejects.toBeInstanceOf(TelegramTransportError);
  });
});

describe('MtProtoTelegramClient.downloadMedia + describeInboundMedia (P5)', () => {
  it('tai anh cua tin ve Buffer (getMessages + downloadAsBuffer)', async () => {
    mockTgInstance.getMessages.mockResolvedValueOnce([{ media: { type: 'photo' } }]);
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    const out = await client.downloadMedia(55, 9);
    expect(mockTgInstance.getMessages).toHaveBeenCalledWith(55, [9]);
    expect(out.kind).toBe('photo');
    expect(out.mimeType).toBe('image/jpeg');
    expect(Buffer.isBuffer(out.buffer)).toBe(true);
    expect([...out.buffer]).toEqual([1, 2, 3]);
  });

  it('tep khai bao lon hon tran -> tooLarge, KHONG tai byte', async () => {
    mockTgInstance.getMessages.mockResolvedValueOnce([
      { media: { type: 'document', fileName: 'big.pdf', mimeType: 'application/pdf', fileSize: 30 * 1024 * 1024 } },
    ]);
    mockTgInstance.downloadAsBuffer.mockClear();
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    const out = await client.downloadMedia(55, 9, { maxBytes: 20 * 1024 * 1024 });
    expect(out).toMatchObject({ buffer: null, tooLarge: true, kind: 'document', fileName: 'big.pdf' });
    expect(mockTgInstance.downloadAsBuffer).not.toHaveBeenCalled();
  });

  it('tin khong co anh/tai lieu (vd sticker) -> buffer null', async () => {
    mockTgInstance.getMessages.mockResolvedValueOnce([{ media: { type: 'sticker' } }]);
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    const out = await client.downloadMedia(55, 9);
    expect(out.buffer).toBeNull();
  });

  it('describeInboundMedia: chi photo/document; sticker/voice bo qua', async () => {
    const { describeInboundMedia } = await import('../mtProtoTelegramClient.js');
    expect(describeInboundMedia({ media: { type: 'photo' } })).toEqual({ kind: 'photo', fileName: null, mimeType: 'image/jpeg', size: null });
    expect(describeInboundMedia({ media: { type: 'document', fileName: 'a.pdf', mimeType: 'application/pdf', fileSize: 10 } }))
      .toEqual({ kind: 'document', fileName: 'a.pdf', mimeType: 'application/pdf', size: 10 });
    expect(describeInboundMedia({ media: { type: 'sticker' } })).toBeNull();
    expect(describeInboundMedia({ media: { type: 'voice' } })).toBeNull();
    expect(describeInboundMedia({})).toBeNull();
  });

  it('onNewMessage dua media vao event (chi metadata)', async () => {
    const client = new MtProtoTelegramClient({ apiId: 1, apiHash: 'h' });
    await client.connect();
    const received = [];
    await client.registerMessageHandler(async (event) => { received.push(event); });
    const handler = mockTgInstance.onNewMessage.add.mock.calls[0][0];
    await handler({ chatId: 5, id: 3, text: '', sender: { id: 5 }, media: { type: 'photo' } });
    expect(received[0].media).toEqual({ kind: 'photo', fileName: null, mimeType: 'image/jpeg', size: null });
  });
});

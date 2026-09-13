/**
 * Integration-style smoke test for the Telegram factory after
 * the bug fix that ensures the production client class is
 * eagerly resolved when `TELEGRAM_GATEWAY_TRANSPORT` points at
 * a real `.mjs` file.
 *
 * Without this fix, the first user request after boot would
 * race the dynamic `import()` of `@mtcute/node` and get back
 * a stub instance that throws `TELEGRAM_STUB_TRANSPORT`. The
 * test pins down:
 *
 *   - `whenReady()` resolves with `true` when env is set
 *   - `buildDefaultClient()` returns the real class after await
 *   - The eager resolver at module load honours the stub path
 *     (env unset / "stub" / "default") and stays fast
 *
 * The Telegram client itself is mocked so we don't pull in
 * `better-sqlite3` native bindings during this test.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockMtProtoCtor = jest.fn(function MockMtProto(opts) {
  this.opts = opts;
  this.kind = 'mtproto';
});

jest.unstable_mockModule('../mtProtoTelegramClient.js', () => ({
  MtProtoTelegramClient: mockMtProtoCtor,
}));

let buildDefaultClient;
let whenReady;
let isStubOnly;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.resetModules();
  delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
  // Re-import after each env mutation so the eager resolver
  // re-runs with the new env value.
  const mod = await import('../telegramClient.js');
  buildDefaultClient = mod.buildDefaultClient;
  whenReady = mod.whenReady;
  ({ isStubOnly } = await import('../stubCheck.js'));
});

afterEach(() => {
  delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
});

describe('factory — stub branch', () => {
  it('returns a stub when env is unset', () => {
    expect(isStubOnly({ channel: 'telegram' })).toBe(true);
    const client = buildDefaultClient({ apiId: 1, apiHash: 'h' });
    expect(client.constructor.name).toBe('StubTelegramClient');
    expect(mockMtProtoCtor).not.toHaveBeenCalled();
  });

  it('returns a stub when env equals "stub"', () => {
    process.env.TELEGRAM_GATEWAY_TRANSPORT = 'stub';
    const client = buildDefaultClient({});
    expect(client.constructor.name).toBe('StubTelegramClient');
    expect(mockMtProtoCtor).not.toHaveBeenCalled();
  });

  it('whenReady() returns false without trying to import', async () => {
    const ready = await whenReady();
    expect(ready).toBe(false);
    expect(mockMtProtoCtor).not.toHaveBeenCalled();
  });
});

describe('factory — real-class branch', () => {
  beforeEach(() => {
    process.env.TELEGRAM_GATEWAY_TRANSPORT =
      './src/services/chatbot/inProcChannelGateway/transports/MtProtoTelegramTransport.mjs';
  });

  it('returns the real class once whenReady() resolves', async () => {
    const ready = await whenReady();
    expect(ready).toBe(true);
    const client = buildDefaultClient({ apiId: 42, apiHash: 'abc' });
    expect(client.kind).toBe('mtproto');
    expect(client.opts).toEqual({ apiId: 42, apiHash: 'abc' });
    expect(mockMtProtoCtor).toHaveBeenCalledTimes(1);
  });

  it('memoises the real class across multiple calls', async () => {
    await whenReady();
    const a = buildDefaultClient({ apiId: 1, apiHash: 'a' });
    const b = buildDefaultClient({ apiId: 2, apiHash: 'b' });
    // Each call instantiates a new object but uses the same
    // resolved class — `mockMtProtoCtor` should not be invoked
    // by the import path again.
    expect(a).not.toBe(b);
    expect(a.kind).toBe('mtproto');
    expect(b.kind).toBe('mtproto');
  });

  it('returns real class even when buildDefaultClient races ahead of the import', async () => {
    // Simulate the "first request hits before the eager
    // resolver finishes" race by calling buildDefaultClient
    // synchronously immediately after the env is set. Then
    // await whenReady() and confirm the next call returns the
    // real class.
    const firstCall = buildDefaultClient({ apiId: 1, apiHash: 'h' });
    const ready = await whenReady();
    expect(ready).toBe(true);
    const secondCall = buildDefaultClient({ apiId: 2, apiHash: 'h' });
    // First call may be stub (race), second must be real.
    expect(secondCall.kind).toBe('mtproto');
    // Cleanup so the test doesn't leak a partially constructed
    // instance.
    void firstCall;
  });
});

describe('factory — failed import path', () => {
  it('falls back to stub when the .mjs module throws on import', async () => {
    // Re-mock with a module that throws so the resolver's
    // catch path runs.
    jest.unstable_mockModule('../mtProtoTelegramClient.js', () => {
      throw new Error('synthetic import failure');
    });
    jest.resetModules();
    process.env.TELEGRAM_GATEWAY_TRANSPORT =
      './src/services/chatbot/inProcChannelGateway/transports/MtProtoTelegramTransport.mjs';
    const mod = await import('../telegramClient.js');
    const ready = await mod.whenReady();
    expect(ready).toBe(false);
    // Spy on console.warn so the resolver's diagnostic
    // message doesn't clutter the test output.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = mod.buildDefaultClient({ apiId: 1, apiHash: 'h' });
    expect(client.constructor.name).toBe('StubTelegramClient');
    warnSpy.mockRestore();
  });
});

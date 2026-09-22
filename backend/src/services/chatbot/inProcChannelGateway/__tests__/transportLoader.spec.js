/**
 * Tests for `transportLoader.js`. Verifies that:
 *   - No env var → returns null (caller falls back to stub)
 *   - `stub` / `default` magic values → returns null
 *   - Env var pointing at a real module with a default export → returns the class
 *   - Env var pointing at a missing module → returns null + one-shot warning
 *   - Env var with no class export → returns null + warning
 *   - Unknown channel → returns null and logs error
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { _resetWarnOnce } from '../warnOnce.js';

let loadTransportClass;
let getTransportPath;

beforeEach(async () => {
  jest.resetModules();
  _resetWarnOnce();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const mod = await import('../transportLoader.js');
  loadTransportClass = mod.loadTransportClass;
  getTransportPath = mod.getTransportPath;
});

describe('getTransportPath', () => {
  it('returns the env var name for known channels', () => {
    expect(getTransportPath('telegram')).toEqual({
      envVar: 'TELEGRAM_GATEWAY_TRANSPORT',
      path: null,
    });
  });

  it('returns path when env override is provided', () => {
    expect(
      getTransportPath('telegram', { TELEGRAM_GATEWAY_TRANSPORT: '/tmp/x.mjs' })
    ).toEqual({ envVar: 'TELEGRAM_GATEWAY_TRANSPORT', path: '/tmp/x.mjs' });
  });

  it('treats `stub` and `default` as null', () => {
    expect(
      getTransportPath('telegram', { TELEGRAM_GATEWAY_TRANSPORT: 'default' })
    ).toEqual({ envVar: 'TELEGRAM_GATEWAY_TRANSPORT', path: null });
  });

  it('returns null envVar for unknown channel and logs error', () => {
    expect(getTransportPath('whatsapp')).toEqual({ envVar: null, path: null });
    expect(console.error).toHaveBeenCalled();
  });
});

describe('loadTransportClass', () => {
  it('returns null when env var is unset', async () => {
    const cls = await loadTransportClass({
      channel: 'telegram',
      env: {},
    });
    expect(cls).toBeNull();
  });

  it('returns null for `stub` / `default`', async () => {
    expect(
      await loadTransportClass({ channel: 'telegram', env: { TELEGRAM_GATEWAY_TRANSPORT: 'default' } })
    ).toBeNull();
  });

  it('returns the default export of the imported module', async () => {
    class FakeTransport {}
    const importer = jest.fn(async () => ({ default: FakeTransport }));
    const cls = await loadTransportClass({
      channel: 'telegram',
      env: { TELEGRAM_GATEWAY_TRANSPORT: '/path/to/fake.mjs' },
      importer,
    });
    expect(cls).toBe(FakeTransport);
    // POSIX absolute path được `normaliseTransportPath` convert thành
    // `file://` URL để Node ESM `import()` chấp nhận trên Windows.
    // Trên mọi OS, importer phải nhận URL dạng file:// chứ không phải
    // raw absolute path.
    expect(importer).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/.+\/path\/to\/fake\.mjs$/)
    );
  });

  it('falls back to a named `Transport` export if `default` is missing', async () => {
    class NamedTransport {}
    const importer = jest.fn(async () => ({ Transport: NamedTransport }));
    const cls = await loadTransportClass({
      channel: 'telegram',
      env: { TELEGRAM_GATEWAY_TRANSPORT: '/path/to/named.mjs' },
      importer,
    });
    expect(cls).toBe(NamedTransport);
  });

  it('returns null + warns when the import throws', async () => {
    const importer = jest.fn(async () => {
      throw new Error('module not found');
    });
    const cls = await loadTransportClass({
      channel: 'telegram',
      env: { TELEGRAM_GATEWAY_TRANSPORT: '/missing.mjs' },
      importer,
    });
    expect(cls).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to import')
    );
  });

  it('returns null + warns when the module exports no class', async () => {
    const importer = jest.fn(async () => ({ default: { not: 'a class' } }));
    const cls = await loadTransportClass({
      channel: 'telegram',
      env: { TELEGRAM_GATEWAY_TRANSPORT: '/bad.mjs' },
      importer,
    });
    expect(cls).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('did not export a class')
    );
  });

  it('returns null and logs error for unknown channels', async () => {
    const cls = await loadTransportClass({ channel: 'whatsapp', env: {} });
    expect(cls).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('unknown channel')
    );
  });

  it('only logs the import-failure warning once per process', async () => {
    const importer = jest.fn(async () => {
      throw new Error('boom');
    });
    await loadTransportClass({
      channel: 'telegram',
      env: { TELEGRAM_GATEWAY_TRANSPORT: '/a.mjs' },
      importer,
    });
    await loadTransportClass({
      channel: 'telegram',
      env: { TELEGRAM_GATEWAY_TRANSPORT: '/a.mjs' },
      importer,
    });
    const warnCalls = console.warn.mock.calls.filter((c) =>
      String(c[0]).includes('failed to import')
    );
    expect(warnCalls).toHaveLength(1);
  });
});

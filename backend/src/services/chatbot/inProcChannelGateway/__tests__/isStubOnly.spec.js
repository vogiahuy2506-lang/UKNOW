/**
 * Tests for `isStubOnly` + `getState.stubOnly` in the in-process
 * gateway bootstrap. These are pure env reads so we can keep them
 * fast and dependency-free.
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';

let mod;

beforeEach(async () => {
  jest.resetModules();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mod = await import('../index.js');
});

describe('isStubOnly', () => {
  it('returns true for telegram when env var is unset', () => {
    delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
    expect(mod.isStubOnly({ channel: 'telegram' })).toBe(true);
  });

  it('returns true for the magic "stub"/"default" values', () => {
    process.env.TELEGRAM_GATEWAY_TRANSPORT = 'default';
    expect(mod.isStubOnly({ channel: 'telegram' })).toBe(true);
  });

  it('returns false when env var is a real path', () => {
    process.env.TELEGRAM_GATEWAY_TRANSPORT = 'file:///tmp/x.mjs';
    expect(mod.isStubOnly({ channel: 'telegram' })).toBe(false);
  });

  it('returns true for an unknown channel', () => {
    expect(mod.isStubOnly({ channel: 'whatsapp' })).toBe(true);
  });
});

describe('getState.stubOnly', () => {
  it('reflects isStubOnly for the telegram channel', () => {
    process.env.TELEGRAM_GATEWAY_TRANSPORT = '/abs/Path.mjs';
    const state = mod.getState();
    expect(state.telegram.stubOnly).toBe(false);
  });
});

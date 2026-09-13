/**
 * Tests for `warnOnce.js`. Validates that the same key triggers at
 * most one `console.warn` call regardless of how many times
 * `warnOnce(key, ...)` is invoked.
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { warnOnce, _resetWarnOnce } from '../warnOnce.js';

beforeEach(() => {
  _resetWarnOnce();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('warnOnce', () => {
  it('logs once per key', () => {
    warnOnce('a', 'message A1');
    warnOnce('a', 'message A2');
    warnOnce('a', 'message A3');
    warnOnce('b', 'message B1');
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenNthCalledWith(1, 'message A1');
    expect(console.warn).toHaveBeenNthCalledWith(2, 'message B1');
  });

  it('passes meta to console.warn when provided', () => {
    const meta = { code: 42 };
    warnOnce('m', 'with meta', meta);
    expect(console.warn).toHaveBeenCalledWith('with meta', meta);
  });

  it('omits meta when undefined', () => {
    warnOnce('n', 'no meta');
    expect(console.warn).toHaveBeenCalledWith('no meta');
  });

  it('forgets warned keys after _resetWarnOnce', () => {
    warnOnce('x', 'first');
    expect(console.warn).toHaveBeenCalledTimes(1);
    _resetWarnOnce();
    warnOnce('x', 'second');
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenNthCalledWith(2, 'second');
  });
});

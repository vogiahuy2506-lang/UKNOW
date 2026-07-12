import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import {
  decryptZaloCookie,
  decryptZaloCookieRow,
  decryptZaloCookieRows,
  encryptZaloCookie,
} from '../zaloCookieCrypto.util.js';

const ORIGINAL_KEY = process.env.SMTP_SECRET_KEY;

describe('zaloCookieCrypto.util', () => {
  beforeEach(() => {
    process.env.SMTP_SECRET_KEY = 'test-secret-key';
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.SMTP_SECRET_KEY;
    else process.env.SMTP_SECRET_KEY = ORIGINAL_KEY;
  });

  it('round-trips a cookie payload', () => {
    const cookie = JSON.stringify({ cookies: [{ name: 'zpsid', value: 'abc123' }] });
    const stored = encryptZaloCookie(cookie);
    expect(stored).toMatch(/^enc:v1:/);
    expect(stored).not.toContain('abc123');
    expect(decryptZaloCookie(stored)).toBe(cookie);
  });

  it('passes through legacy plaintext rows unchanged (backward compat)', () => {
    const legacy = 'zpsid=legacy-plain-cookie';
    expect(decryptZaloCookie(legacy)).toBe(legacy);
  });

  it('does not double-encrypt', () => {
    const once = encryptZaloCookie('cookie-value');
    expect(encryptZaloCookie(once)).toBe(once);
  });

  it('preserves null/empty semantics for COALESCE(NULLIF($n, \'\'), ...) writes', () => {
    expect(encryptZaloCookie(null)).toBeNull();
    expect(encryptZaloCookie('')).toBe('');
    expect(decryptZaloCookie(null)).toBeNull();
    expect(decryptZaloCookie('')).toBe('');
  });

  it('returns empty string when decrypting with the wrong key (treated as missing cookie)', () => {
    const stored = encryptZaloCookie('cookie-value');
    process.env.SMTP_SECRET_KEY = 'a-different-key';
    expect(decryptZaloCookie(stored)).toBe('');
  });

  it('falls back to plaintext write when the key is missing (không chặn kết nối Zalo)', () => {
    delete process.env.SMTP_SECRET_KEY;
    expect(encryptZaloCookie('cookie-value')).toBe('cookie-value');
  });

  it('decrypts cookie_text in-place for repository rows', () => {
    const stored = encryptZaloCookie('row-cookie');
    const rows = [
      { id: 1, cookie_text: stored },
      { id: 2, cookie_text: 'plain-cookie' },
      { id: 3, cookie_text: null },
    ];
    decryptZaloCookieRows(rows);
    expect(rows[0].cookie_text).toBe('row-cookie');
    expect(rows[1].cookie_text).toBe('plain-cookie');
    expect(rows[2].cookie_text).toBeNull();
    expect(decryptZaloCookieRow(null)).toBeNull();
  });
});

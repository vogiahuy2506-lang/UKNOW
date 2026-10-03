import { describe, it, expect } from '@jest/globals';
import {
  generateSecret,
  base32Encode,
  base32Decode,
  totpAt,
  verifyTotp,
  buildOtpauthUrl,
} from '../totp.util.js';

// RFC 6238 phụ lục B, SHA-1, secret ASCII "12345678901234567890"
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const VECTORS = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('totp.util — vector RFC 6238', () => {
  it.each(VECTORS)('T=%i → mã 8 số %s', (t, expected) => {
    expect(totpAt(RFC_SECRET, { timestampMs: t * 1000, digits: 8 })).toBe(expected);
  });

  it('mã 6 số = 6 ký tự cuối của mã 8 số', () => {
    for (const [t, expected] of VECTORS) {
      expect(totpAt(RFC_SECRET, { timestampMs: t * 1000 })).toBe(expected.slice(-6));
    }
  });
});

describe('totp.util — base32', () => {
  it('secret ASCII RFC ↔ base32', () => {
    expect(base32Encode(Buffer.from('12345678901234567890'))).toBe(RFC_SECRET);
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
  });

  it('round-trip và generateSecret dài 32 ký tự bảng A-Z2-7', () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
    expect(generateSecret()).not.toBe(s);
  });

  it('ký tự lạ → ném lỗi', () => {
    expect(() => base32Decode('abc1')).toThrow();
  });
});

describe('totp.util — verifyTotp', () => {
  const now = 1234567890 * 1000;
  const c = Math.floor(now / 1000 / 30);
  const at = (step) => totpAt(RFC_SECRET, { timestampMs: step * 30 * 1000 });

  it('nhận bước hiện tại và trả step', () => {
    expect(verifyTotp(RFC_SECRET, at(c), { timestampMs: now })).toEqual({ ok: true, step: c });
  });

  it('window=1 nhận ±1 bước, từ chối ±2', () => {
    expect(verifyTotp(RFC_SECRET, at(c - 1), { timestampMs: now }).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET, at(c + 1), { timestampMs: now }).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET, at(c - 2), { timestampMs: now }).ok).toBe(false);
    expect(verifyTotp(RFC_SECRET, at(c + 2), { timestampMs: now }).ok).toBe(false);
  });

  it('lastUsedStep = c từ chối mã bước c (và trước đó) nhưng nhận c+1', () => {
    expect(verifyTotp(RFC_SECRET, at(c), { timestampMs: now, lastUsedStep: c }).ok).toBe(false);
    expect(verifyTotp(RFC_SECRET, at(c - 1), { timestampMs: now, lastUsedStep: c }).ok).toBe(false);
    expect(verifyTotp(RFC_SECRET, at(c + 1), { timestampMs: now, lastUsedStep: c })).toEqual({ ok: true, step: c + 1 });
  });

  it('mã sai dạng → ok:false, không ném', () => {
    expect(verifyTotp(RFC_SECRET, '12345a', { timestampMs: now })).toEqual({ ok: false, step: null });
    expect(verifyTotp(RFC_SECRET, '12345', { timestampMs: now }).ok).toBe(false);
    expect(verifyTotp(RFC_SECRET, '1234567', { timestampMs: now }).ok).toBe(false);
    expect(verifyTotp(RFC_SECRET, null, { timestampMs: now }).ok).toBe(false);
  });
});

describe('totp.util — buildOtpauthUrl', () => {
  it('đúng định dạng hợp đồng', () => {
    expect(buildOtpauthUrl({ account: 'admin', secret: 'ABC' })).toBe(
      'otpauth://totp/Founder%20AI:admin?secret=ABC&issuer=Founder%20AI&algorithm=SHA1&digits=6&period=30'
    );
  });
});

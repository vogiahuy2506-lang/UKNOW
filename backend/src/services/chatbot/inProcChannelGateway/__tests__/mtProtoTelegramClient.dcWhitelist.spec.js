/**
 * Unit tests for the TELEGRAM_DC_WHITELIST plumbing in
 * `mtProtoTelegramClient.js`.
 *
 * Two pieces under test:
 *   - `parseDcWhitelist` — turns the env string into `BasicDcOption[]`
 *   - `buildDefaultDcs` — collapses that array into the
 *     `{ main, media }` object mtcute expects at
 *     `TelegramClient({ defaultDcs })`.
 *
 * Pin down:
 *   - empty / undefined → []
 *   - single entry parses with default port 443
 *   - explicit port honoured
 *   - malformed entries warn + are skipped (don't crash connect)
 *   - IPv6 entries are rejected
 *   - `buildDefaultDcs` always returns both `main` and `media`
 *     keys even when the whitelist is empty
 */

import { describe, it, expect } from '@jest/globals';

const mod = await import('../mtProtoTelegramClient.js');
const { parseDcWhitelist, buildDefaultDcs } = mod.__test__;

describe('parseDcWhitelist', () => {
  it('returns [] for missing / empty input', () => {
    expect(parseDcWhitelist(undefined)).toEqual([]);
    expect(parseDcWhitelist('')).toEqual([]);
    expect(parseDcWhitelist('   ')).toEqual([]);
  });

  it('parses a single entry with default port 443', () => {
    const out = parseDcWhitelist('2=149.154.167.50');
    expect(out).toEqual([
      { id: 2, ipAddress: '149.154.167.50', port: 443 },
    ]);
  });

  it('honours explicit port override', () => {
    const out = parseDcWhitelist('2=149.154.167.50:8443');
    expect(out).toEqual([
      { id: 2, ipAddress: '149.154.167.50', port: 8443 },
    ]);
  });

  it('parses multiple comma-separated entries', () => {
    const out = parseDcWhitelist(
      '2=149.154.167.50,2=91.108.56.130,4=149.154.167.50'
    );
    expect(out).toEqual([
      { id: 2, ipAddress: '149.154.167.50', port: 443 },
      { id: 2, ipAddress: '91.108.56.130', port: 443 },
      { id: 4, ipAddress: '149.154.167.50', port: 443 },
    ]);
  });

  it('trims whitespace around each entry', () => {
    const out = parseDcWhitelist('  2=149.154.167.50 , 4=1.2.3.4  ');
    expect(out).toEqual([
      { id: 2, ipAddress: '149.154.167.50', port: 443 },
      { id: 4, ipAddress: '1.2.3.4', port: 443 },
    ]);
  });

  it('rejects IPv6 addresses (caller should use SOCKS proxy instead)', () => {
    // The parser is IPv4-only by design — mtcute's `defaultDcs`
    // doesn't speak a `[…]:port` shape well, and the typical
    // dev-box egress issue is at the IPv4 boundary anyway.
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const out = parseDcWhitelist('2=2001:67c:4e8:f002::a');
      expect(out).toEqual([]);
    } finally {
      console.warn = originalWarn;
    }
  });

  it('warns and skips malformed entries without throwing', () => {
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      const out = parseDcWhitelist(
        '2=149.154.167.50, garbage-entry, =1.2.3.4, 2=evil-string, 5'
      );
      expect(out).toEqual([{ id: 2, ipAddress: '149.154.167.50', port: 443 }]);
      // At least one warn per malformed entry — sanity check.
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe('buildDefaultDcs', () => {
  // Regression test: an earlier version passed the parsed array
  // straight into `clientOpts.defaultDcs`, but mtcute expects an
  // object with `main` + `media` keys. Without this transform the
  // client crashed on the first connection attempt with
  // `Cannot read properties of undefined (reading 'id')`.
  it('returns null when the array is empty (use mtcute defaults)', () => {
    expect(buildDefaultDcs([])).toBeNull();
  });

  it('wraps the first entry as BOTH main and media', () => {
    const out = buildDefaultDcs([
      { id: 2, ipAddress: '149.154.167.50', port: 443 },
    ]);
    expect(out).toEqual({
      main: { id: 2, ipAddress: '149.154.167.50', port: 443 },
      media: { id: 2, ipAddress: '149.154.167.50', port: 443 },
    });
  });

  it('ignores extra entries (mtcute uses {main,media} only)', () => {
    // Multiple aliases for the same DC are accepted by the parser
    // for forward-compat but the `buildDefaultDcs` shape is
    // intentionally narrow — operators wanting failover should
    // rely on mtcute's own DC retry logic, not this list.
    const out = buildDefaultDcs([
      { id: 2, ipAddress: '149.154.167.50', port: 443 },
      { id: 2, ipAddress: '91.108.56.130', port: 443 },
      { id: 4, ipAddress: '149.154.167.50', port: 443 },
    ]);
    expect(out.main).toEqual({ id: 2, ipAddress: '149.154.167.50', port: 443 });
    expect(out.media).toBe(out.main);
  });

  it('end-to-end: env string → {main,media}', () => {
    const parsed = parseDcWhitelist('2=149.154.167.50');
    const built = buildDefaultDcs(parsed);
    expect(built).toEqual({
      main: { id: 2, ipAddress: '149.154.167.50', port: 443 },
      media: { id: 2, ipAddress: '149.154.167.50', port: 443 },
    });
  });
});

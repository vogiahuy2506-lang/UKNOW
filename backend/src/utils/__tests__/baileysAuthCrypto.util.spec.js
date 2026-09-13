/**
 * Unit tests for `baileysAuthCrypto.util.js`.
 *
 * The util is a thin wrapper around `smtpSecretCrypto` (AES-256-GCM
 * keyed off `SMTP_SECRET_KEY`) but it has its own shape contract
 * that we pin down here:
 *
 *   - Encrypt: object → `{ enc: "enc:v1:<iv>:<tag>:<cipher>" }`
 *   - Decrypt: wrapper → parsed JS object; legacy plaintext → unchanged
 *   - Idempotent: re-encrypting a wrapper is a no-op
 *   - Decrypt failure (wrong key) → `null` so the caller treats the
 *     row as "no session, user must re-scan"
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

beforeAll(() => {
  // Pin a stable key so the deterministic round-trip below matches.
  process.env.SMTP_SECRET_KEY = 'unit-test-smtp-secret-key';
});

const {
  encryptBaileysBlob,
  decryptBaileysBlob,
} = await import('../baileysAuthCrypto.util.js');

const sampleCreds = {
  noiseKey: { private: Buffer.from('priv').toString('base64'), public: 'pub' },
  registrationId: 4242,
  me: { id: '1234@s.whatsapp.net', name: 'Alice' },
  account: { details: 'x', accountSignature: 'y', deviceSignature: 'z' },
  apps: {},
  platform: 'android',
  processedHistoryMessages: [],
  nextPreKeyId: 1,
  firstUnuploadedPreKeyId: 1,
  accountSettings: { unarchiveChats: false },
  registered: true,
  pairingCode: undefined,
  lastPropHash: undefined,
  routingInfo: undefined,
  signedIdentityKey: { private: 'a', public: 'b' },
  signedPreKey: { keyPair: { private: 'c', public: 'd' }, signature: 's', keyId: 1 },
  advSecretKey: 'adv',
};

describe('encryptBaileysBlob', () => {
  it('wraps the object in `{ enc: "enc:v1:..." }`', () => {
    const wrapped = encryptBaileysBlob(sampleCreds);
    expect(wrapped).toMatchObject({ enc: expect.stringMatching(/^enc:v1:/) });
  });

  it('does NOT mutate the original object', () => {
    const before = JSON.stringify(sampleCreds);
    encryptBaileysBlob(sampleCreds);
    expect(JSON.stringify(sampleCreds)).toBe(before);
  });

  it('returns null/undefined inputs unchanged', () => {
    expect(encryptBaileysBlob(null)).toBeNull();
    expect(encryptBaileysBlob(undefined)).toBeUndefined();
  });

  it('is idempotent — re-encrypting a wrapper is a no-op', () => {
    const once = encryptBaileysBlob(sampleCreds);
    const twice = encryptBaileysBlob(once);
    expect(twice).toBe(once);
  });

  it('encrypts strings (any non-encrypted object becomes a wrapper)', () => {
    // Strings, primitives, etc. all pass through `encryptBaileysBlob`
    // and become wrappers. This is OK — only encrypted wrappers
    // round-trip cleanly, and the decrypt path tolerates them
    // (it checks for `enc:v1:` and otherwise treats the value as
    // legacy plaintext). Pinned here so a future refactor doesn't
    // quietly change the behaviour.
    expect(encryptBaileysBlob(42)).toMatchObject({
      enc: expect.stringMatching(/^enc:v1:/),
    });
  });
});

describe('decryptBaileysBlob', () => {
  it('round-trips an encrypted blob back to the original object', () => {
    const wrapped = encryptBaileysBlob(sampleCreds);
    expect(decryptBaileysBlob(wrapped)).toEqual(sampleCreds);
  });

  it('passes legacy plaintext blobs through unchanged', () => {
    // Pre-migration rows stored the raw AuthenticationCreds
    // object — decrypt must NOT try to AES-decrypt those bytes.
    expect(decryptBaileysBlob(sampleCreds)).toBe(sampleCreds);
  });

  it('returns null when the row is null/undefined', () => {
    expect(decryptBaileysBlob(null)).toBeNull();
    expect(decryptBaileysBlob(undefined)).toBeUndefined();
  });

  it('returns null on decryption failure (wrong SMTP_SECRET_KEY)', () => {
    const wrapped = encryptBaileysBlob(sampleCreds);
    const originalKey = process.env.SMTP_SECRET_KEY;
    try {
      process.env.SMTP_SECRET_KEY = 'a-different-key';
      expect(decryptBaileysBlob(wrapped)).toBeNull();
    } finally {
      process.env.SMTP_SECRET_KEY = originalKey;
    }
  });

  it('handles a wrapper whose `enc` field is not a real ciphertext', () => {
    // Object shaped like `{ enc: ... }` but the string is NOT
    // `enc:v1:` — treat as legacy plaintext to avoid corrupting
    // the shape downstream.
    const fake = { enc: 'definitely-not-encrypted', other: 'data' };
    expect(decryptBaileysBlob(fake)).toBe(fake);
  });
});

describe('round-trip with primitive key values (SignalDataType)', () => {
  // Signal keys can be JSON objects, arrays, or even primitives
  // depending on `type`. Make sure the util survives all three.
  it.each([
    ['object', { foo: 'bar', n: 1 }],
    ['array', [1, 2, 3]],
    ['string', 'opaque-string-key'],
    ['number', 0],
  ])('round-trips a %s key value', (_label, value) => {
    const wrapped = encryptBaileysBlob(value);
    expect(decryptBaileysBlob(wrapped)).toEqual(value);
  });
});

describe('Buffer revival (Postgres JSONB round-trip)', () => {
  // Postgres JSONB không tự rehydrate Buffer/Uint8Array sau khi
  // parse — chúng trở thành object `{ type: 'Buffer', data: [...] }`.
  // Baileys sẽ lỗi `ERR_INVALID_ARG_TYPE` nếu nhận nguyên object
  // đó làm input cho `Cipheriv.update`. Helper `reviveBufferInPlace`
  // (internal) phải convert ngược về `Buffer` cho cả encrypted
  // wrapper path lẫn legacy plaintext path.
  const corruptedBuffer = { type: 'Buffer', data: [1, 2, 3, 4, 5] };
  const credsWithCorruptedBuffer = {
    noiseKey: { private: corruptedBuffer, public: 'pub' },
    signedIdentityKey: { private: corruptedBuffer, public: 'pub' },
    registered: true,
    nested: { deep: [{ list: corruptedBuffer }] },
  };

  it('revives buffers inside a legacy plaintext blob (no SMTP_SECRET_KEY path)', () => {
    process.env.SMTP_SECRET_KEY = '';
    const out = decryptBaileysBlob(credsWithCorruptedBuffer);
    expect(Buffer.isBuffer(out.noiseKey.private)).toBe(true);
    expect(Buffer.isBuffer(out.signedIdentityKey.private)).toBe(true);
    expect(Buffer.isBuffer(out.nested.deep[0].list)).toBe(true);
    expect([...out.noiseKey.private]).toEqual([1, 2, 3, 4, 5]);
  });

  it('revives buffers inside an encrypted wrapper (JSON.parse → revive)', () => {
    process.env.SMTP_SECRET_KEY = 'unit-test-smtp-secret-key';
    // Round-trip qua encryptBaileysBlob (sẽ wrap thành { enc: ... }).
    // Bên trong ciphertext vẫn là JSON — khi decrypt parse lại
    // cũng phải revive Buffer.
    const creds = {
      noiseKey: { private: Buffer.from([9, 8, 7]) },
      registered: true,
    };
    const wrapped = encryptBaileysBlob(creds);
    const out = decryptBaileysBlob(wrapped);
    expect(Buffer.isBuffer(out.noiseKey.private)).toBe(true);
    expect([...out.noiseKey.private]).toEqual([9, 8, 7]);
  });

  it('ignores objects that merely have a string field named `type`', () => {
    // Tránh false-positive — chỉ revive khi `data` thực sự là
    // Array<0..255>. Object `{ type: 'foo', data: 'bar' }` phải
    // được để nguyên.
    process.env.SMTP_SECRET_KEY = '';
    const fake = { type: 'foo', data: 'bar', value: 1 };
    const out = decryptBaileysBlob(fake);
    expect(out).toBe(fake);
  });
});

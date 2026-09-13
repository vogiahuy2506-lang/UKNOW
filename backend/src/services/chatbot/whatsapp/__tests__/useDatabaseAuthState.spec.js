/**
 * Tests for `useDatabaseAuthState` — the DB-backed Baileys
 * auth-state provider. We mock the repo so this file stays a
 * pure unit test (no Postgres required) and pins down the
 * contract the WhatsApp service relies on:
 *
 *   - shape matches `useMultiFileAuthState` (so callers don't
 *     have to learn a new API)
 *   - keys.get returns a `{ [id]: value }` map
 *   - keys.set forwards to the repo without modification
 *   - saveCreds persists the current `creds` snapshot
 *   - creds defaults to `initAuthCreds()` when the repo has
 *     no row yet
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Pin SMTP_SECRET_KEY for encryption round-trips in `useDatabaseAuthState`.
// The util `baileysAuthCrypto` derives a 32-byte AES key from this env
// via SHA-256; the test only cares that encryption is deterministic
// across calls within the same process.
process.env.SMTP_SECRET_KEY = 'unit-test-smtp-secret-key';

const mockInitAuthCreds = jest.fn(() => ({
  noiseKey: { private: Buffer.from('priv'), public: Buffer.from('pub') },
  signedIdentityKey: { private: Buffer.from('a'), public: Buffer.from('b') },
  signedPreKey: { keyPair: { private: Buffer.from('c'), public: Buffer.from('d') }, signature: Buffer.from('sig'), keyId: 1 },
  registrationId: 12345,
  advSecretKey: 'adv',
  me: { id: 'init-me', name: 'init' },
  account: { details: 'init', accountSignature: 'sig', deviceSignature: 'sig2' },
  apps: {},
  platform: 'init',
  processedHistoryMessages: [],
  nextPreKeyId: 1,
  firstUnuploadedPreKeyId: 1,
  accountSettings: { unarchiveChats: false },
  registered: false,
  pairingCode: undefined,
  lastPropHash: undefined,
  routingInfo: undefined,
}));

jest.unstable_mockModule('@whiskeysockets/baileys', () => ({
  initAuthCreds: mockInitAuthCreds,
}));

const mockLoadCreds = jest.fn();
const mockSaveCreds = jest.fn();
const mockGetKeys = jest.fn();
const mockSetKeys = jest.fn();
const mockDeleteSession = jest.fn();

jest.unstable_mockModule(
  '../../../../repositories/chatbot/whatsappBaileysSession.repository.js',
  () => ({
    default: {
      loadCreds: mockLoadCreds,
      saveCreds: mockSaveCreds,
      getKeys: mockGetKeys,
      setKeys: mockSetKeys,
      deleteSession: mockDeleteSession,
    },
  })
);

let useDatabaseAuthState;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.resetModules();
  // Re-require so each test gets a fresh closure over the repo mocks.
  const mod = await import('../useDatabaseAuthState.js');
  useDatabaseAuthState = mod.useDatabaseAuthState;
});

describe('useDatabaseAuthState — creds lifecycle', () => {
  it('decrypts the stored blob and returns a parsed AuthenticationCreds', async () => {
    // Repo returns the on-disk wrapper `{ enc: "enc:v1:..." }`.
    // The wrapper must `decryptBaileysBlob` so callers see a
    // plain JS object Baileys can use.
    const { encryptBaileysBlob } = await import(
      '../../../../utils/baileysAuthCrypto.util.js'
    );
    const storedPlain = { me: { id: 'stored-me' }, registrationId: 999 };
    mockLoadCreds.mockResolvedValueOnce(encryptBaileysBlob(storedPlain));
    const { state } = await useDatabaseAuthState('sess-1');
    expect(state.creds).toEqual(storedPlain);
    expect(mockInitAuthCreds).not.toHaveBeenCalled();
    expect(mockLoadCreds).toHaveBeenCalledWith('sess-1');
  });

  it('returns the legacy plaintext blob unchanged when the row is not encrypted', async () => {
    // Backwards compatibility: rows written before this migration
    // contain the raw `AuthenticationCreds` object (no `.enc`).
    // The wrapper must hand them straight to the caller.
    const stored = { me: { id: 'legacy-me' }, registrationId: 7 };
    mockLoadCreds.mockResolvedValueOnce(stored);
    const { state } = await useDatabaseAuthState('sess-legacy');
    expect(state.creds).toBe(stored);
  });

  it('falls back to initAuthCreds() when the repo returns null', async () => {
    mockLoadCreds.mockResolvedValueOnce(null);
    const { state } = await useDatabaseAuthState('sess-fresh');
    expect(state.creds).toBeDefined();
    expect(state.creds.registrationId).toBe(12345);
    expect(mockInitAuthCreds).toHaveBeenCalledTimes(1);
  });

  it('saveCreds encrypts the snapshot before calling the repo', async () => {
    mockLoadCreds.mockResolvedValueOnce({ me: { id: 'a' } });
    const { state, saveCreds } = await useDatabaseAuthState('sess-2');
    // Caller mutates state.creds (Baileys emits a full new object
    // on each creds.update event). The wrapper must save what we
    // hold at the moment of the call, wrapped in `{ enc: ... }`.
    state.creds.registrationId = 999;
    await saveCreds();
    expect(mockSaveCreds).toHaveBeenCalledTimes(1);
    const [sessionKeyArg, payloadArg] = mockSaveCreds.mock.calls[0];
    expect(sessionKeyArg).toBe('sess-2');
    expect(payloadArg).toMatchObject({ enc: expect.stringMatching(/^enc:v1:/) });
    // Verify the encrypted payload actually round-trips back to
    // the original creds object.
    const { decryptBaileysBlob } = await import(
      '../../../../utils/baileysAuthCrypto.util.js'
    );
    expect(decryptBaileysBlob(payloadArg)).toEqual(state.creds);
  });
});

describe('useDatabaseAuthState — keys.get', () => {
  it('returns an empty object when called with no ids', async () => {
    mockLoadCreds.mockResolvedValueOnce({ me: { id: 'a' } });
    const { state } = await useDatabaseAuthState('sess-3');
    const result = await state.keys.get('app-state-sync-key', []);
    expect(result).toEqual({});
    expect(mockGetKeys).not.toHaveBeenCalled();
  });

  it('decrypts each value before returning it', async () => {
    mockLoadCreds.mockResolvedValueOnce({ me: { id: 'a' } });
    // Repo returns the on-disk wrapper shape (`{ enc: ... }`).
    const { encryptBaileysBlob } = await import(
      '../../../../utils/baileysAuthCrypto.util.js'
    );
    const plainValue = { key: { remoteJid: 'jid@x' }, keyId: 1 };
    mockGetKeys.mockResolvedValueOnce({
      abc123: encryptBaileysBlob(plainValue),
      legacy456: plainValue, // pre-encryption row stays plaintext
    });
    const { state } = await useDatabaseAuthState('sess-4');
    const result = await state.keys.get('app-state-sync-key', [
      'abc123',
      'legacy456',
    ]);
    expect(result).toEqual({
      abc123: plainValue,
      legacy456: plainValue,
    });
    expect(mockGetKeys).toHaveBeenCalledWith(
      'sess-4',
      'app-state-sync-key',
      ['abc123', 'legacy456']
    );
  });
});

describe('useDatabaseAuthState — keys.set', () => {
  it('encrypts each non-null value and forwards the wrapped payload', async () => {
    mockLoadCreds.mockResolvedValueOnce({ me: { id: 'a' } });
    const { state } = await useDatabaseAuthState('sess-5');
    const plainValue = { key: {}, keyId: 1 };
    await state.keys.set({
      'app-state-sync-key': { k1: plainValue, k2: null },
    });
    expect(mockSetKeys).toHaveBeenCalledTimes(1);
    const [sessionKeyArg, payloadArg] = mockSetKeys.mock.calls[0];
    expect(sessionKeyArg).toBe('sess-5');
    // k1 wrapped in `{ enc: ... }`, k2 left as null so the repo
    // DELETE branch runs against it.
    expect(payloadArg).toEqual({
      'app-state-sync-key': {
        k1: { enc: expect.stringMatching(/^enc:v1:/) },
        k2: null,
      },
    });
    // Round-trip the encrypted value to confirm it decodes back.
    const { decryptBaileysBlob } = await import(
      '../../../../utils/baileysAuthCrypto.util.js'
    );
    expect(decryptBaileysBlob(payloadArg['app-state-sync-key'].k1)).toEqual(
      plainValue
    );
  });

  it('treats a null/undefined data object as a no-op', async () => {
    mockLoadCreds.mockResolvedValueOnce({ me: { id: 'a' } });
    const { state } = await useDatabaseAuthState('sess-6');
    await state.keys.set(null);
    expect(mockSetKeys).not.toHaveBeenCalled();
  });
});

describe('useDatabaseAuthState — keys.clear', () => {
  it('delegates to deleteSession on the repo', async () => {
    mockLoadCreds.mockResolvedValueOnce({ me: { id: 'a' } });
    const { state } = await useDatabaseAuthState('sess-7');
    await state.keys.clear();
    expect(mockDeleteSession).toHaveBeenCalledWith('sess-7');
  });
});

describe('useDatabaseAuthState — input validation', () => {
  it('rejects an empty sessionKey', async () => {
    await expect(useDatabaseAuthState('')).rejects.toThrow(/non-empty sessionKey/);
    await expect(useDatabaseAuthState(null)).rejects.toThrow(/non-empty sessionKey/);
    await expect(useDatabaseAuthState(undefined)).rejects.toThrow(/non-empty sessionKey/);
    expect(mockLoadCreds).not.toHaveBeenCalled();
  });
});

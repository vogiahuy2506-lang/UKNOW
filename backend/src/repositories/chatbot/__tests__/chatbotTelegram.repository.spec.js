/**
 * Unit-ish tests for the Telegram repo's session methods.
 *
 * Verify SQL shape, parameter forwarding, and the encryption
 * round-trip using a mocked `db.query`. The integration tests
 * against a real DB live under `tests/integration/` and run via
 * the `integration` Jest project.
 *
 * Coverage map:
 *   - getSessionString: returns null on missing row, decrypts
 *     `enc:v1:` wrapper, falls through legacy plaintext as-is.
 *   - upsertSession: encrypted UPSERT on telegram_session_state,
 *     with a backwards-compat branch that also writes the profile
 *     row when callers still pass the legacy `sessionString`
 *     marker.
 *   - saveSessionState: direct encrypted UPSERT preferred new path.
 *   - clearSessionString / deleteSessionState: wipe the state row.
 *   - listAllSessions / listAllSessionStateKeys: hydrate + key
 *     listings.
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// From src/repositories/chatbot/__tests__ -> backend/src/config/database.js
const dbPath = path
  .resolve(__dirname, '..', '..', '..', 'config', 'database.js')
  .replace(/\\/g, '/');

// Pin a stable encryption key so the deterministic round-trip below
// matches across runs.
process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'unit-test-smtp-secret-key';

const dbMock = { query: jest.fn() };

let repo;

beforeEach(async () => {
  jest.resetModules();
  jest.unstable_mockModule(dbPath, () => ({ default: dbMock }));
  const mod = await import(
    '../../../repositories/chatbot/chatbotTelegram.repository.js'
  );
  repo = mod.default;
  dbMock.query.mockReset();
});

describe('ChatbotTelegramRepository session methods', () => {
  describe('getSessionString (encrypted blob)', () => {
    it('returns null when no row exists', async () => {
      dbMock.query.mockResolvedValueOnce({ rows: [] });
      const blob = await repo.getSessionString(12345);
      expect(blob).toBeNull();
      const [sql, params] = dbMock.query.mock.calls[0];
      expect(sql).toMatch(/SELECT state FROM telegram_session_state/);
      expect(sql).toMatch(/WHERE telegram_user_id = \$1/);
      expect(params).toEqual([12345]);
    });

    it('decrypts an `enc:v1:` wrapper before returning', async () => {
      // Pre-compute an encrypted blob with the same helper the
      // production code path uses, so we know the wire format.
      const { encryptBaileysBlob } = await import(
        '../../../utils/baileysAuthCrypto.util.js'
      );
      const inner = { kv: { 'auth_key': { dc: 2 } }, primaryDcs: { id: 2 } };
      const wrapped = encryptBaileysBlob(inner);
      dbMock.query.mockResolvedValueOnce({ rows: [{ state: wrapped }] });
      const blob = await repo.getSessionString(12345);
      expect(blob).toEqual(inner);
    });

    it('returns null when decryption fails (wrong SMTP_SECRET_KEY)', async () => {
      // Force a malformed wrapper that decryptBaileysBlob rejects.
      dbMock.query.mockResolvedValueOnce({
        rows: [{ state: { enc: 'enc:v1:not-hex:not-hex:not-hex' } }],
      });
      const blob = await repo.getSessionString(12345);
      expect(blob).toBeNull();
    });
  });

  describe('saveSessionState (preferred new path)', () => {
    it('encrypted UPSERT against telegram_session_state', async () => {
      dbMock.query.mockResolvedValueOnce({
        rows: [{ telegram_user_id: 12345, schema_version: 1, updated_at: '2026-09-13' }],
      });
      const state = { kv: { x: 1 }, authKeys: { 2: 'key' } };
      const ret = await repo.saveSessionState(12345, state);
      expect(ret.telegram_user_id).toBe(12345);
      const [sql, params] = dbMock.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO telegram_session_state/);
      expect(sql).toMatch(/ON CONFLICT \(telegram_user_id\) DO UPDATE/);
      expect(sql).toMatch(/state      = EXCLUDED\.state/);
      expect(params).toHaveLength(2);
      expect(params[0]).toBe(12345);
      // params[1] is the encrypted wrapper.
      expect(params[1]).toMatchObject({ enc: expect.stringMatching(/^enc:v1:/) });
    });

    it('rejects null/undefined state', async () => {
      await expect(repo.saveSessionState(1, null)).rejects.toThrow(/state is required/);
      await expect(repo.saveSessionState(1, undefined)).rejects.toThrow(/state is required/);
    });

    it('rejects non-object state', async () => {
      await expect(repo.saveSessionState(1, 'string')).rejects.toThrow(/must be an object/);
      await expect(repo.saveSessionState(1, 42)).rejects.toThrow(/must be an object/);
    });

    it('round-trip: save then load yields the original object', async () => {
      // We exercise encrypt + decrypt end-to-end via the repo:
      //   - First call: `saveSessionState` issues an UPSERT and
      //     the repo encrypts the blob before sending it to the
      //     mocked `db.query`.
      //   - Capture the encrypted value the mock saw and replay it
      //     as the response of the next `loadSessionState` call.
      const state = { kv: { foo: 'bar' }, authKeys: { 2: Buffer.from([1, 2, 3]) } };
      let captured;
      dbMock.query.mockImplementationOnce(async (_sql, params) => {
        captured = params[1];
        return { rows: [{ telegram_user_id: 12345 }] };
      });
      await repo.saveSessionState(12345, state);

      dbMock.query.mockImplementationOnce(async () => ({ rows: [{ state: captured }] }));
      const loaded = await repo.loadSessionState(12345);
      // Buffer fields round-trip via reviveBufferInPlace — verify
      // we get a real Buffer back, not the `{ type: 'Buffer', data }`
      // ghost that JSONB injects.
      expect(Buffer.isBuffer(loaded.authKeys[2])).toBe(true);
      expect(Array.from(loaded.authKeys[2])).toEqual([1, 2, 3]);
      expect(loaded.kv).toEqual({ foo: 'bar' });
    });
  });

  describe('upsertSession (back-compat shim)', () => {
    it('when sessionState is provided, only touches telegram_session_state', async () => {
      dbMock.query.mockResolvedValueOnce({
        rows: [{ telegram_user_id: 12345, schema_version: 1, updated_at: '2026-09-13' }],
      });
      await repo.upsertSession({
        telegramUserId: 12345,
        sessionState: { kv: { x: 1 } },
        phone: '+84',
        firstName: 'Alice',
        userId: 7,
      });
      // Exactly one query — the encrypted UPSERT on
      // telegram_session_state.
      expect(dbMock.query).toHaveBeenCalledTimes(1);
      const [sql, params] = dbMock.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO telegram_session_state/);
      expect(params[0]).toBe(12345);
      expect(params[1]).toMatchObject({ enc: expect.stringMatching(/^enc:v1:/) });
    });

    it('legacy `sessionString` marker still upserts the profile row', async () => {
      // When callers pass the legacy `sessionString` marker (e.g.
      // an internal helper that hasn't migrated yet), keep the old
      // two-statement behaviour: profile upsert + state upsert.
      dbMock.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, telegram_user_id: 12345, first_name: 'Alice' }],
        })
        .mockResolvedValueOnce({
          rows: [{ telegram_user_id: 12345, schema_version: 1 }],
        });
      await repo.upsertSession({
        telegramUserId: 12345,
        sessionString: 'mtcute:default',
        phone: '+84',
        firstName: 'Alice',
        lastName: null,
        username: 'alice',
        userId: 7,
      });
      expect(dbMock.query).toHaveBeenCalledTimes(2);
      // First query: profile upsert.
      const [profileSql, profileParams] = dbMock.query.mock.calls[0];
      expect(profileSql).toMatch(/INSERT INTO telegram_accounts/);
      expect(profileSql).toMatch(/ON CONFLICT \(telegram_user_id\) DO UPDATE/);
      expect(profileParams).toEqual([7, 12345, '+84', 'Alice', null, 'alice']);
      // Second query: encrypted state row.
      const [stateSql, stateParams] = dbMock.query.mock.calls[1];
      expect(stateSql).toMatch(/INSERT INTO telegram_session_state/);
      expect(stateParams[0]).toBe(12345);
      // The legacy marker is wrapped so the JSONB column gets a
      // proper `{ enc: ... }` payload instead of a plain string.
      expect(stateParams[1]).toMatchObject({ enc: expect.stringMatching(/^enc:v1:/) });
    });

    it('throws when neither sessionString nor sessionState is provided', async () => {
      await expect(
        repo.upsertSession({
          telegramUserId: 12345,
          phone: '+84',
          firstName: 'Alice',
        })
      ).rejects.toThrow(/requires sessionState or sessionString/);
    });
  });

  describe('clearSessionString / deleteSessionState', () => {
    it('clearSessionString issues DELETE on telegram_session_state', async () => {
      dbMock.query.mockResolvedValueOnce({ rows: [] });
      await repo.clearSessionString(12345);
      const [sql, params] = dbMock.query.mock.calls[0];
      expect(sql).toMatch(/DELETE FROM telegram_session_state WHERE telegram_user_id = \$1/);
      expect(params).toEqual([12345]);
    });

    it('deleteSessionState is an alias for clearSessionString', async () => {
      dbMock.query.mockResolvedValueOnce({ rows: [] });
      await repo.deleteSessionState(12345);
      const [sql, params] = dbMock.query.mock.calls[0];
      expect(sql).toMatch(/DELETE FROM telegram_session_state/);
      expect(params).toEqual([12345]);
    });
  });

  describe('listAllSessions / listAllSessionStateKeys', () => {
    it('listAllSessions joins telegram_session_state and orders by it', async () => {
      const fakeRows = [{ id: 1, telegram_user_id: 111 }];
      dbMock.query.mockResolvedValueOnce({ rows: fakeRows });
      const rows = await repo.listAllSessions();
      expect(rows).toEqual(fakeRows);
      const [sql] = dbMock.query.mock.calls[0];
      expect(sql).toMatch(/FROM telegram_accounts ta/);
      expect(sql).toMatch(/JOIN telegram_session_state tss/);
      expect(sql).toMatch(/ORDER BY tss\.updated_at DESC/);
    });

    it('listAllSessionStateKeys returns just the keys, ordered', async () => {
      dbMock.query.mockResolvedValueOnce({
        rows: [{ telegram_user_id: 111 }, { telegram_user_id: 222 }],
      });
      const keys = await repo.listAllSessionStateKeys();
      expect(keys).toEqual([111, 222]);
      const [sql] = dbMock.query.mock.calls[0];
      expect(sql).toMatch(/SELECT telegram_user_id\s+FROM telegram_session_state/);
      expect(sql).toMatch(/ORDER BY updated_at DESC/);
    });
  });
});

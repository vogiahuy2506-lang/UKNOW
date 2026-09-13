/**
 * Unit tests for `whatsappBaileysSession.repository.js`. We mock
 * the `db` module so the SQL is exercised as a contract (the
 * exact statements + parameter order) without needing a live
 * Postgres instance. The integration tests against a real DB
 * live under `tests/integration/` and run via the `integration`
 * Jest project.
 *
 * What we pin down here:
 *   - creds UPSERT statement shape (single-statement INSERT ON
 *     CONFLICT, no DELETE chained)
 *   - getKeys returns the right index lookup
 *   - setKeys expands per-row VALUES correctly for multi-row
 *     upserts and routes deletes through a separate query
 *   - deleteSession runs both DELETEs in one transaction
 *   - listSessionKeys returns just the keys column
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// In-memory mock for the pg pool. We capture every query so the
// test can assert on the SQL string + parameter array.
//
// Critical: every call to `getClient` must return the SAME
// client instance so the test can introspect the queries the
// repo issued. `jest.fn` would return a new client each call,
// which is wrong — it would mean the repo's `BEGIN`/`COMMIT`
// run against a different mock than the test sees.
const clientQueryLog = [];
const sharedClient = {
  query: jest.fn(async (sql, params) => {
    clientQueryLog.push({ sql, params });
    return { rows: [] };
  }),
  release: jest.fn(),
};
const getClient = jest.fn(async () => sharedClient);
const query = jest.fn(async (sql, params) => ({ rows: [] }));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query, getClient, pool: { end: jest.fn() } },
  pool: { end: jest.fn() },
}));

let sessionRepo;
beforeEach(async () => {
  jest.clearAllMocks();
  clientQueryLog.length = 0;
  jest.resetModules();
  // Re-require so the mock applies to a fresh module closure.
  sessionRepo = (await import('../whatsappBaileysSession.repository.js')).default;
});

describe('loadCreds', () => {
  it('selects the creds column by session_key', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await sessionRepo.loadCreds('sess-1');
    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0];
    expect(call[0]).toMatch(/SELECT creds FROM whatsapp_baileys_session_creds/);
    expect(call[0]).toMatch(/WHERE session_key = \$1/);
    expect(call[1]).toEqual(['sess-1']);
  });

  it('returns null when no rows come back', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const result = await sessionRepo.loadCreds('sess-empty');
    expect(result).toBeNull();
  });

  it('returns the creds value from the first row', async () => {
    query.mockResolvedValueOnce({ rows: [{ creds: { me: { id: 'a' } } }] });
    const result = await sessionRepo.loadCreds('sess-2');
    expect(result).toEqual({ me: { id: 'a' } });
  });
});

describe('saveCreds', () => {
  it('runs a single INSERT ... ON CONFLICT statement', async () => {
    const creds = { me: { id: 'x' }, registrationId: 1 };
    await sessionRepo.saveCreds('sess-3', creds);
    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0];
    expect(call[0]).toMatch(/INSERT INTO whatsapp_baileys_session_creds/);
    expect(call[0]).toMatch(/ON CONFLICT \(session_key\) DO UPDATE/);
    expect(call[0]).toMatch(/creds = EXCLUDED\.creds/);
    expect(call[1]).toEqual(['sess-3', creds]);
  });
});

describe('getKeys', () => {
  it('returns {} without hitting the DB when ids is empty', async () => {
    const result = await sessionRepo.getKeys('sess-4', 'pre-key', []);
    expect(result).toEqual({});
    expect(query).not.toHaveBeenCalled();
  });

  it('uses ANY($3::text[]) for the id list', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'k1', value: { foo: 1 } },
        { id: 'k2', value: { foo: 2 } },
      ],
    });
    const result = await sessionRepo.getKeys('sess-5', 'app-state-sync-key', ['k1', 'k2']);
    expect(result).toEqual({ k1: { foo: 1 }, k2: { foo: 2 } });
    const call = query.mock.calls[0];
    expect(call[0]).toMatch(/ANY\(\$3::text\[\]\)/);
    expect(call[1]).toEqual(['sess-5', 'app-state-sync-key', ['k1', 'k2']]);
  });
});

describe('setKeys', () => {
  it('opens a transaction via getClient + closes with COMMIT', async () => {
    await sessionRepo.setKeys('sess-6', {
      'pre-key': { p1: { k: 1 } },
    });
    const sqls = sharedClient.query.mock.calls.map((c) => c[0]);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls).toContain('COMMIT');
    expect(sharedClient.release).toHaveBeenCalled();
  });

  it('expands per-row VALUES placeholders for upserts', async () => {
    await sessionRepo.setKeys('sess-7', {
      'pre-key': {
        a: { x: 1 },
        b: { x: 2 },
        c: { x: 3 },
      },
    });
    // Find the INSERT statement (skip BEGIN).
    const insertCall = sharedClient.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('INSERT INTO whatsapp_baileys_session_keys')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toMatch(/VALUES \(\$1, \$2, \$3, \$4\), \(\$5, \$6, \$7, \$8\), \(\$9, \$10, \$11, \$12\)/);
    expect(insertCall[1]).toHaveLength(12);
    // Each row tuple is (sessionKey, type, id, JSON-serialised value).
    expect(insertCall[1][0]).toBe('sess-7');
    expect(insertCall[1][1]).toBe('pre-key');
    expect(insertCall[1][2]).toBe('a');
    expect(insertCall[1][3]).toBe(JSON.stringify({ x: 1 }));
    expect(insertCall[1][4]).toBe('sess-7');
    expect(insertCall[1][5]).toBe('pre-key');
    expect(insertCall[1][6]).toBe('b');
    expect(insertCall[1][7]).toBe(JSON.stringify({ x: 2 }));
  });

  it('runs a separate DELETE for null values', async () => {
    await sessionRepo.setKeys('sess-8', {
      'session': { drop: null, keep: { x: 1 } },
    });
    const deleteCall = sharedClient.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('DELETE FROM whatsapp_baileys_session_keys')
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall[0]).toMatch(/AND id = ANY\(\$3::text\[\]\)/);
    expect(deleteCall[1]).toEqual(['sess-8', 'session', ['drop']]);
  });

  it('rolls back when an UPSERT throws', async () => {
    sharedClient.query.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    await expect(
      sessionRepo.setKeys('sess-9', { 'pre-key': { a: { x: 1 } } })
    ).rejects.toThrow('boom');
    const allSql = sharedClient.query.mock.calls.map((c) => c[0]);
    expect(allSql).toContain('ROLLBACK');
    expect(sharedClient.release).toHaveBeenCalled();
  });

  it('treats a null/undefined data object as a no-op', async () => {
    const before = getClient.mock.calls.length;
    await sessionRepo.setKeys('sess-noop', null);
    await sessionRepo.setKeys('sess-noop', undefined);
    expect(getClient.mock.calls.length).toBe(before);
  });
});

describe('deleteSession', () => {
  it('runs two DELETEs in one transaction', async () => {
    await sessionRepo.deleteSession('sess-10');
    const sqls = sharedClient.query.mock.calls.map((c) => c[0]);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls).toContain('DELETE FROM whatsapp_baileys_session_keys WHERE session_key = $1');
    expect(sqls).toContain('DELETE FROM whatsapp_baileys_session_creds WHERE session_key = $1');
    expect(sqls).toContain('COMMIT');
    // Verify both DELETEs got the same sessionKey parameter.
    const deleteCalls = sharedClient.query.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('DELETE')
    );
    expect(deleteCalls).toHaveLength(2);
    expect(deleteCalls[0][1]).toEqual(['sess-10']);
    expect(deleteCalls[1][1]).toEqual(['sess-10']);
  });
});

describe('saveProfile', () => {
  it('runs a single INSERT ... ON CONFLICT statement', async () => {
    await sessionRepo.saveProfile('sess-prof-1', { meId: 'a@b', meName: 'Alice' });
    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0];
    expect(call[0]).toMatch(/INSERT INTO whatsapp_baileys_session_profile/);
    expect(call[0]).toMatch(/ON CONFLICT \(session_key\) DO UPDATE/);
    expect(call[0]).toMatch(/COALESCE\(EXCLUDED\.me_id/);
    expect(call[0]).toMatch(/COALESCE\(EXCLUDED\.me_name/);
    expect(call[1]).toEqual(['sess-prof-1', 'a@b', 'Alice']);
  });

  it('passes nulls through (so the COALESCE branch keeps existing values)', async () => {
    await sessionRepo.saveProfile('sess-prof-2', { meId: null, meName: null });
    expect(query.mock.calls[0][1]).toEqual(['sess-prof-2', null, null]);
  });
});

describe('loadProfile', () => {
  it('returns {} when no row exists', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const result = await sessionRepo.loadProfile('sess-prof-empty');
    expect(result).toEqual({});
  });

  it('returns snake-to-camel mapped fields', async () => {
    query.mockResolvedValueOnce({
      rows: [{ me_id: '5511…@s.whatsapp.net', me_name: 'Alice' }],
    });
    const result = await sessionRepo.loadProfile('sess-prof-3');
    expect(result).toEqual({ meId: '5511…@s.whatsapp.net', meName: 'Alice' });
  });

  it('maps NULL columns to null in the result', async () => {
    query.mockResolvedValueOnce({ rows: [{ me_id: null, me_name: null }] });
    const result = await sessionRepo.loadProfile('sess-prof-4');
    expect(result).toEqual({ meId: null, meName: null });
  });
});

describe('listSessionKeys', () => {
  it('selects only the session_key column ordered by updated_at', async () => {
    query.mockResolvedValueOnce({
      rows: [{ session_key: 'a' }, { session_key: 'b' }],
    });
    const result = await sessionRepo.listSessionKeys();
    expect(result).toEqual(['a', 'b']);
    const call = query.mock.calls[0];
    expect(call[0]).toMatch(/SELECT session_key FROM whatsapp_baileys_session_creds/);
    expect(call[0]).toMatch(/ORDER BY updated_at DESC/);
  });
});

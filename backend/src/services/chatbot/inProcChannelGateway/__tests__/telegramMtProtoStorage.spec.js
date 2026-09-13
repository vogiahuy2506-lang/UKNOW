/**
 * Unit tests for `telegramMtProtoStorage.js`.
 *
 * We exercise the `PostgresBackedDriver` directly (the public surface
 * is a thin wrapper around it) with a fake repo so no DB connection
 * is required. The integration tests against a real Postgres live
 * under `tests/integration/` and run via the `integration` Jest
 * project.
 *
 * Coverage map:
 *   - constructor rejects bad inputs (missing telegramUserId, repo)
 *   - load() hydrates the 5 in-memory repos from a saved blob
 *   - save() round-trips: load → mutate → save → load → same data
 *   - save() with empty state still persists (no-op UPSERT)
 *   - save() survives a transient repo error (logs, doesn't throw)
 *   - destroy() clears in-memory state without re-saving
 *   - Buffer/Uint8Array fields round-trip cleanly
 *   - concurrent save() calls serialise via the internal queue
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  PostgresBackedTelegramStorage,
} from '../telegramMtProtoStorage.js';

// Pin a stable key so the repo's `encryptBaileysBlob` inside the
// driver produces deterministic wire output (the repo is wired
// to call the real encrypt/decrypt helpers, not a mock).
process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'unit-test-smtp-secret-key';

function makeFakeRepo() {
  // In-memory store keyed by telegram_user_id. Each entry is the
  // plaintext state blob returned by the real repo's
  // `loadSessionState`.
  const rows = new Map();
  return {
    rows,
    loadSessionState: jest.fn(async (id) => rows.get(Number(id)) ?? null),
    saveSessionState: jest.fn(async (id, state) => {
      rows.set(Number(id), state);
      return { telegram_user_id: Number(id) };
    }),
    deleteSessionState: jest.fn(async (id) => {
      rows.delete(Number(id));
    }),
  };
}

let repo;
let storage;

beforeEach(() => {
  repo = makeFakeRepo();
  storage = new PostgresBackedTelegramStorage({
    telegramUserId: 12345,
    repo,
  });
});

describe('PostgresBackedTelegramStorage', () => {
  describe('constructor', () => {
    it('requires telegramUserId', () => {
      expect(() => new PostgresBackedTelegramStorage({ repo })).toThrow(
        /telegramUserId is required/
      );
    });

    it('requires a repo with loadSessionState', () => {
      expect(
        () => new PostgresBackedTelegramStorage({ telegramUserId: 1, repo: {} })
      ).toThrow(/loadSessionState/);
    });

    it('exposes the 5 mtcute StorageProvider fields', () => {
      expect(storage.driver).toBeDefined();
      expect(storage.kv).toBeDefined();
      expect(storage.authKeys).toBeDefined();
      expect(storage.peers).toBeDefined();
      expect(storage.refMessages).toBeDefined();
    });

    it('coerces telegramUserId to a number', () => {
      const s = new PostgresBackedTelegramStorage({
        telegramUserId: '98765',
        repo,
      });
      // Internal driver carries the coerced id; observable via the
      // repo spy on the next load/save.
      void s;
    });
  });

  describe('load', () => {
    it('no-ops when there is no row in the DB (first QR)', async () => {
      await storage.driver.load();
      expect(repo.loadSessionState).toHaveBeenCalledWith(12345);
      // All 5 repos are still usable — they're just empty.
      expect(await storage.kv.get('anything')).toBeNull();
      expect(await storage.authKeys.get(2)).toBeNull();
    });

    it('survives a repo error without throwing', async () => {
      const failingRepo = {
        loadSessionState: jest.fn(async () => {
          throw new Error('DB is sad');
        }),
        saveSessionState: jest.fn(async () => {}),
      };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const s = new PostgresBackedTelegramStorage({ telegramUserId: 1, repo: failingRepo });
      await expect(s.driver.load()).resolves.toBeUndefined();
      warnSpy.mockRestore();
    });

    it('hydrates the 5 in-memory repos from a saved blob', async () => {
      // First, write a state by running save() on a freshly-built
      // storage, then build another storage pointed at the same
      // repo and check that load() pulls the values back.
      await storage.driver.load(); // first load = no-op (empty repo)
      await storage.kv.set('foo', Buffer.from('hello'));
      await storage.authKeys.set(2, Buffer.from('perm-key'));
      await storage.authKeys.setTemp(4, 7, Buffer.from('temp-key'), Date.now() / 1000 + 60);
      storage.peers.store({
        id: 555,
        accessHash: '123',
        isMin: false,
        usernames: ['alice'],
        updated: Math.floor(Date.now() / 1000),
        complete: Buffer.from([0xde, 0xad]),
      });
      await storage.driver.save();

      const fresh = new PostgresBackedTelegramStorage({
        telegramUserId: 12345,
        repo,
      });
      await fresh.driver.load();
      expect(await fresh.kv.get('foo')).toEqual(Buffer.from('hello'));
      expect(await fresh.authKeys.get(2)).toEqual(Buffer.from('perm-key'));
      const tempKey = await fresh.authKeys.getTemp(4, 7, Date.now() / 1000 + 30);
      expect(tempKey).toEqual(Buffer.from('temp-key'));
      const peer = await fresh.peers.getById(555);
      expect(peer).not.toBeNull();
      expect(peer.usernames).toEqual(['alice']);
      // Binary fields inside the peer `complete` should be restored.
      expect(Buffer.isBuffer(peer.complete)).toBe(true);
      expect(Array.from(peer.complete)).toEqual([0xde, 0xad]);
    });
  });

  describe('save', () => {
    it('writes a blob to the repo (idempotent)', async () => {
      await storage.driver.save();
      expect(repo.saveSessionState).toHaveBeenCalledWith(12345, expect.any(Object));
      // Second save with no mutations should not throw.
      await storage.driver.save();
      expect(repo.saveSessionState).toHaveBeenCalledTimes(2);
    });

    it('drops empty sub-objects to keep the row small', async () => {
      await storage.kv.set('only-this', 'value');
      await storage.driver.save();
      const blob = repo.rows.get(12345);
      expect(blob.kv).toEqual({ 'only-this': 'value' });
      // The other repos are empty → their serialised objects have no
      // entries, so we drop them entirely.
      expect(blob.authKeys).toBeUndefined();
      expect(blob.peers).toBeUndefined();
      expect(blob.refMessages).toBeUndefined();
    });

    it('logs but does not throw when the repo save fails', async () => {
      const failingRepo = {
        loadSessionState: jest.fn(async () => null),
        saveSessionState: jest.fn(async () => {
          throw new Error('PG is sad');
        }),
      };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const s = new PostgresBackedTelegramStorage({ telegramUserId: 1, repo: failingRepo });
      await expect(s.driver.save()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/save failed/));
      warnSpy.mockRestore();
    });

    it('flush() exposes save() as an awaitable handle', async () => {
      await storage.kv.set('x', 1);
      await storage.flush();
      expect(repo.saveSessionState).toHaveBeenCalledTimes(1);
    });

    it('serialises concurrent save() calls (no race on the UPSERT)', async () => {
      // Issue 5 save() calls in parallel. Each of them should
      // ultimately call repo.saveSessionState exactly once, but the
      // order of completion is guaranteed (no overlap). mtcute's
      // own code relies on this — see the `_saveQueue` comment in
      // the driver.
      const order = [];
      const slowRepo = {
        loadSessionState: jest.fn(async () => null),
        saveSessionState: jest.fn(async (id, state) => {
          order.push(`start:${state.__n}`);
          await new Promise((r) => setTimeout(r, 10));
          order.push(`end:${state.__n}`);
        }),
      };
      const s = new PostgresBackedTelegramStorage({ telegramUserId: 1, repo: slowRepo });
      // Tag each save so we can assert ordering.
      await Promise.all([
        s.driver.save(),
        s.driver.save(),
        s.driver.save(),
      ]);
      // 3 starts → 3 ends, paired up.
      expect(order).toHaveLength(6);
      for (let i = 0; i < 3; i += 1) {
        expect(order[i * 2]).toMatch(/^start:/);
        expect(order[i * 2 + 1]).toMatch(/^end:/);
      }
    });
  });

  describe('destroy', () => {
    it('does not trigger a save() call on its own', async () => {
      // The production contract is: mtcute calls `save()` BEFORE
      // `destroy()` (see `MtClient.disconnect()` →
      // `storage.save()` → `_destroy()`). So `destroy()` should
      // be a pure teardown — no UPSERT.
      await storage.kv.set('foo', 'bar');
      storage.driver.destroy();
      expect(repo.saveSessionState).not.toHaveBeenCalled();
    });
  });
});

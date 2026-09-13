/**
 * Unit tests for `whatsappBaileys.service.js#listPersistedSessions`.
 *
 * What we pin down here:
 *   - Reads ONLY from the Postgres repo (no `node:fs` fallback).
 *   - Re-throws when the DB query rejects — `restorePersistedSessions`
 *     catches at the boot boundary, but the service itself must
 *     not silently swallow.
 *
 * We intentionally mock the session repo so the test doesn't
 * need a live DB. The repository has its own integration tests
 * under `tests/integration/`.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const listSessionKeys = jest.fn();
jest.unstable_mockModule(
  '../../../repositories/chatbot/whatsappBaileysSession.repository.js',
  () => ({ default: { listSessionKeys } })
);

let service;
beforeEach(async () => {
  jest.clearAllMocks();
  jest.resetModules();
  // Wait for the module-load `profileCacheReady` promise to settle
  // before each assertion so we never race with the top-level
  // hydrate call (which now also touches the mocked repo).
  listSessionKeys.mockResolvedValue([]);
  service = await import('../whatsappBaileys.service.js');
  await service.profileCacheReady;
});

describe('listPersistedSessions', () => {
  it('returns whatever the repo returns verbatim', async () => {
    // `profileCacheReady` already drained one `listSessionKeys`
    // call during the test setup, so the second invocation here
    // is the one we care about. Use mockResolvedValue (not
    // mockResolvedValueOnce) so the hydrate call and this call
    // both see the desired value.
    listSessionKeys.mockResolvedValue(['sess-a', 'sess-b']);
    const result = await service.listPersistedSessions();
    expect(result).toEqual(['sess-a', 'sess-b']);
    expect(listSessionKeys).toHaveBeenCalled();
  });

  it('does NOT scan the filesystem as a fallback', async () => {
    // Confirm we never reach into node:fs. The service module
    // no longer imports `existsSync` / `readdirSync` — if a
    // future change re-adds them we want this test to keep
    // catching the intent (no FS fallback).
    listSessionKeys.mockResolvedValueOnce([]);
    const result = await service.listPersistedSessions();
    expect(result).toEqual([]);
  });

  it('re-throws when the DB query rejects', async () => {
    listSessionKeys.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(service.listPersistedSessions()).rejects.toThrow(
      'connection terminated'
    );
  });
});

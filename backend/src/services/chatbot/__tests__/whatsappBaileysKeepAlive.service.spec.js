/**
 * Unit tests for `whatsappBaileysKeepAlive.service.js`.
 *
 * We mock the underlying `whatsappBaileys.service.js` because the
 * real one transitively imports Baileys native code (which doesn't
 * play nicely with jsdom-ish test envs) and connects to a real
 * socket. The keep-alive logic is a thin decision tree over three
 * primitives from that service — easy to pin down.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockListPersistedSessions = jest.fn();
const mockGetSession = jest.fn();
const mockConnectSession = jest.fn();

jest.unstable_mockModule('../whatsappBaileys.service.js', () => ({
  listPersistedSessions: mockListPersistedSessions,
  getSession: mockGetSession,
  connectSession: mockConnectSession,
}));

let keepAlive;
beforeEach(async () => {
  jest.clearAllMocks();
  jest.resetModules();
  mockListPersistedSessions.mockResolvedValue([]);
  mockGetSession.mockReturnValue(null);
  mockConnectSession.mockResolvedValue({ status: 'connecting' });
  keepAlive = await import('../whatsappBaileysKeepAlive.service.js');
});

describe('isSocketAlive', () => {
  it('returns true when ws.readyState === 1 (OPEN)', () => {
    expect(keepAlive.__test__.isSocketAlive({ ws: { readyState: 1 } })).toBe(true);
  });

  it('returns false for any other readyState', () => {
    for (const rs of [0, 2, 3]) {
      expect(keepAlive.__test__.isSocketAlive({ ws: { readyState: rs } })).toBe(false);
    }
  });

  it('returns false for null socket or null ws', () => {
    expect(keepAlive.__test__.isSocketAlive(null)).toBe(false);
    expect(keepAlive.__test__.isSocketAlive({})).toBe(false);
    expect(keepAlive.__test__.isSocketAlive({ ws: null })).toBe(false);
  });
});

describe('refreshSession', () => {
  it('marks session as alive when record exists and ws is OPEN', async () => {
    mockGetSession.mockReturnValueOnce({
      status: 'open',
      socket: { ws: { readyState: 1 } },
    });
    const result = await keepAlive.__test__.refreshSession('sess-a');
    expect(result).toEqual({ sessionKey: 'sess-a', status: 'alive', reason: 'socket_open' });
    expect(mockConnectSession).not.toHaveBeenCalled();
  });

  it('reconnects when ws is dead (readyState !== 1)', async () => {
    mockGetSession.mockReturnValueOnce({
      status: 'open',
      socket: { ws: { readyState: 3 } }, // CLOSED
    });
    const result = await keepAlive.__test__.refreshSession('sess-b');
    expect(result.status).toBe('restored');
    expect(mockConnectSession).toHaveBeenCalledWith('sess-b');
  });

  it('reconnects when no record exists in memory', async () => {
    mockGetSession.mockReturnValueOnce(null);
    const result = await keepAlive.__test__.refreshSession('sess-c');
    expect(result.status).toBe('restored');
    expect(mockConnectSession).toHaveBeenCalledWith('sess-c');
  });

  it('reconnects when status is not "open"', async () => {
    mockGetSession.mockReturnValueOnce({
      status: 'connecting',
      socket: { ws: { readyState: 1 } }, // ws alive but status stuck
    });
    // `status !== 'open'` short-circuits the alive check
    // (no point waiting on init-queries timeout forever).
    const result = await keepAlive.__test__.refreshSession('sess-d');
    expect(result.status).toBe('restored');
  });

  it('reports failed when connectSession rejects', async () => {
    mockGetSession.mockReturnValueOnce(null);
    mockConnectSession.mockRejectedValueOnce(new Error('boom'));
    const result = await keepAlive.__test__.refreshSession('sess-e');
    expect(result.status).toBe('failed');
    expect(result.reason).toContain('boom');
  });

  it('skips when another refresh of the same key is in flight', async () => {
    // Hold a pending refreshSession() call manually so we observe
    // the `refreshingKeys` Set guard from the test thread.
    let release;
    const blocker = new Promise((r) => {
      release = r;
    });
    mockConnectSession.mockReturnValueOnce(blocker);
    mockGetSession.mockReturnValueOnce(null);

    const first = keepAlive.__test__.refreshSession('sess-f');
    // Yield once so the first call reaches `refreshingKeys.add(...)`.
    await new Promise((r) => setImmediate(r));
    const second = await keepAlive.__test__.refreshSession('sess-f');
    expect(second.status).toBe('skipped');

    release();
    await first;
  });
});

describe('performKeepAlive', () => {
  it('returns zero counts when no persisted sessions', async () => {
    mockListPersistedSessions.mockResolvedValueOnce([]);
    const summary = await keepAlive.__test__.performKeepAlive();
    expect(summary).toEqual({ total: 0, alive: 0, restored: 0, failed: 0 });
  });

  it('aggregates alive/restored/failed counts', async () => {
    mockListPersistedSessions.mockResolvedValueOnce(['a', 'b', 'c']);
    mockGetSession.mockImplementation((k) => {
      if (k === 'a') return { status: 'open', socket: { ws: { readyState: 1 } } };
      if (k === 'b') return { status: 'open', socket: { ws: { readyState: 3 } } };
      return null;
    });
    mockConnectSession.mockImplementation((k) => {
      if (k === 'c') return Promise.reject(new Error('socket hangup'));
      return Promise.resolve({});
    });
    const summary = await keepAlive.__test__.performKeepAlive();
    expect(summary.total).toBe(3);
    expect(summary.alive).toBe(1);
    expect(summary.restored).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it('returns zero counts gracefully when listPersistedSessions throws', async () => {
    mockListPersistedSessions.mockRejectedValueOnce(new Error('db down'));
    const summary = await keepAlive.__test__.performKeepAlive();
    expect(summary.total).toBe(0);
  });
});

describe('scheduler lifecycle', () => {
  it('startKeepAliveScheduler is idempotent', async () => {
    // Mock setInterval so the timer doesn't keep jest alive.
    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    let intervals = 0;
    global.setInterval = jest.fn(() => {
      intervals += 1;
      return 123;
    });
    global.clearInterval = jest.fn();
    try {
      keepAlive.startKeepAliveScheduler();
      keepAlive.startKeepAliveScheduler();
      expect(global.setInterval).toHaveBeenCalledTimes(1);
      expect(intervals).toBe(1);
      keepAlive.stopKeepAliveScheduler();
      keepAlive.startKeepAliveScheduler();
      expect(global.setInterval).toHaveBeenCalledTimes(2);
    } finally {
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
      keepAlive.stopKeepAliveScheduler();
    }
  });
});

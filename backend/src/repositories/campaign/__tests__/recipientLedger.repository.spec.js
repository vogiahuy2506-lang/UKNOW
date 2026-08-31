import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const recipientLedgerRepository = (await import('../recipientLedger.repository.js')).default;

describe('RecipientLedgerRepository countPendingDue', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('uses the safe timestamp parser and returns the earliest valid future due time', async () => {
    const nextDueAt = new Date('2026-09-01T00:00:00.000Z');
    mockQuery.mockResolvedValueOnce({
      rows: [{
        pending_count: 2,
        pending_without_future_due: 0,
        pending_with_retry_meta: 1,
        next_due_at: nextDueAt,
      }],
    });

    await expect(recipientLedgerRepository.countPendingDue(42)).resolves.toEqual({
      pending_count: 2,
      pending_without_future_due: 0,
      pending_with_retry_meta: 1,
      next_due_at: nextDueAt,
    });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([42]);
    expect(sql).toContain('MIN(safe_due.next_due_at) FILTER');
    expect(sql).toContain('safe_due.next_due_at > NOW()');
    expect(sql).toContain('pending_without_future_due');
    expect(sql).toContain('make_timestamptz');
    expect(sql).not.toContain("(meta->>'nextDueAt')::timestamptz");
  });

  it('keeps a null earliest due time when no valid future recipient is pending', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(recipientLedgerRepository.countPendingDue(42)).resolves.toEqual({
      pending_count: 0,
      pending_without_future_due: 0,
      pending_with_retry_meta: 0,
      next_due_at: null,
    });
  });
});

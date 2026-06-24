import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

const db = (await import('../../../config/database.js')).default;
const unifiedInboxRepository = (await import('../unifiedInbox.repository.js')).default;

describe('unifiedInbox.repository conversation filters', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [] });
  });

  it('does not add status filter when status is omitted', async () => {
    await unifiedInboxRepository.getConversations(1, { limit: 20, offset: 0 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/status\s*=\s*'active'/i);
    expect(sql).not.toMatch(/status\s*=\s*'\$\{/);
    expect(params).toEqual([1, 20, 0]);
  });

  it('binds status=closed as a query parameter', async () => {
    await unifiedInboxRepository.getConversations(1, { status: 'closed', limit: 20, offset: 0 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/cc\.status = \$4/);
    expect(sql).toMatch(/zp\.status = \$4/);
    expect(sql).toMatch(/wc\.status = \$4/);
    expect(params).toEqual([1, 20, 0, 'closed']);
    expect(sql).not.toMatch(/status = 'closed'/);
  });

  it('binds date=today as a query parameter on last activity', async () => {
    await unifiedInboxRepository.getConversations(1, { date: 'today', limit: 20, offset: 0 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/COALESCE\(cc\.last_message_at, cc\.started_at\) >= \$4/);
    expect(params[3]).toBeInstanceOf(Date);
    expect(sql).not.toMatch(/cc\.status = '/);
  });

  it('ignores invalid status values', async () => {
    await unifiedInboxRepository.getConversations(1, { status: "'; DROP TABLE users; --", limit: 20, offset: 0 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(params).toEqual([1, 20, 0]);
  });

  it('applies status and date filters in getConversationsCount', async () => {
    db.query.mockResolvedValue({ rows: [{ total: '3' }] });

    const total = await unifiedInboxRepository.getConversationsCount(7, {
      status: 'active',
      date: 'week',
    });

    expect(total).toBe(3);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/cc\.status = \$2/);
    expect(sql).toMatch(/COALESCE\(cc\.last_message_at, cc\.started_at\) >= \$3/);
    expect(params[0]).toBe(7);
    expect(params[1]).toBe('active');
    expect(params[2]).toBeInstanceOf(Date);
  });
});

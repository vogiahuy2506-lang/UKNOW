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

  it('binds search on visitor_name and visitor_info per table alias', async () => {
    await unifiedInboxRepository.getConversations(1, { search: 'nguyen', limit: 20, offset: 0 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/cc\.visitor_name ILIKE \$4/);
    expect(sql).toMatch(/cc\.visitor_info::text ILIKE \$4/);
    expect(sql).toMatch(/zp\.visitor_name ILIKE \$4/);
    expect(sql).toMatch(/wc\.visitor_info::text ILIKE \$4/);
    expect(sql).not.toMatch(/\bcw\./);
    expect(params).toEqual([1, 20, 0, '%nguyen%']);
  });
});

describe('unifiedInbox.repository outbox search filters', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.query.mockResolvedValue({ rows: [] });
  });

  it('binds outbox search on conversation and message aliases per branch in getOutboxMessages', async () => {
    await unifiedInboxRepository.getOutboxMessages(1, { search: 'hello', limit: 20, offset: 0 });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/cc\.visitor_name ILIKE \$4/);
    expect(sql).toMatch(/cm\.content ILIKE \$4/);
    expect(sql).toMatch(/zpc\.visitor_name ILIKE \$4/);
    expect(sql).toMatch(/zpm\.content ILIKE \$4/);
    expect(sql).toMatch(/wc\.visitor_info::text ILIKE \$4/);
    expect(sql).toMatch(/wm\.content ILIKE \$4/);
    expect(sql).not.toMatch(/\bcw\./);
    expect(sql).not.toMatch(/zp\.visitor_name/);
    expect(params).toEqual([1, 20, 0, '%hello%']);
  });

  it('binds outbox search per branch in getOutboxMessagesCount', async () => {
    db.query.mockResolvedValue({ rows: [{ total: '5' }] });

    const total = await unifiedInboxRepository.getOutboxMessagesCount(3, { search: 'xin chao' });

    expect(total).toBe(5);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/cc\.visitor_name ILIKE \$2/);
    expect(sql).toMatch(/cm\.content ILIKE \$2/);
    expect(sql).toMatch(/zpc\.visitor_info::text ILIKE \$2/);
    expect(sql).toMatch(/zpm\.content ILIKE \$2/);
    expect(sql).toMatch(/wc\.visitor_name ILIKE \$2/);
    expect(sql).toMatch(/wm\.content ILIKE \$2/);
    expect(sql).not.toMatch(/\bcw\./);
    expect(params).toEqual([3, '%xin chao%']);
  });

  it('binds outbox date filter on message alias per branch in getOutboxMessages', async () => {
    const startDate = '2024-01-01';
    const endDate = '2024-12-31';

    await unifiedInboxRepository.getOutboxMessages(1, {
      startDate,
      endDate,
      limit: 20,
      offset: 0,
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/cm\.created_at >= \$4/);
    expect(sql).toMatch(/cm\.created_at <= \$5/);
    expect(sql).toMatch(/zpm\.created_at >= \$4/);
    expect(sql).toMatch(/zpm\.created_at <= \$5/);
    expect(sql).toMatch(/wm\.created_at >= \$4/);
    expect(sql).toMatch(/wm\.created_at <= \$5/);

    const zaloBranch = sql.split('UNION ALL')[1];
    const webBranch = sql.split('UNION ALL')[2];
    expect(zaloBranch).not.toMatch(/cm\.created_at/);
    expect(webBranch).not.toMatch(/cm\.created_at/);
    expect(params).toEqual([1, 20, 0, startDate, endDate]);
  });

  it('binds outbox date filter per branch in getOutboxMessagesCount', async () => {
    db.query.mockResolvedValue({ rows: [{ total: '2' }] });
    const startDate = '2024-06-01';

    const total = await unifiedInboxRepository.getOutboxMessagesCount(5, { startDate });

    expect(total).toBe(2);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/zpm\.created_at >= \$2/);
    expect(sql).toMatch(/wm\.created_at >= \$2/);
    expect(params).toEqual([5, startDate]);
  });

  it('gates zalo/web branches when channel is zalo_personal', async () => {
    await unifiedInboxRepository.getOutboxMessages(1, {
      channel: 'zalo_personal',
      limit: 20,
      offset: 0,
    });

    const [sql] = db.query.mock.calls[0];
    const zaloBranch = sql.split('UNION ALL')[1];
    const webBranch = sql.split('UNION ALL')[2];

    expect(zaloBranch).not.toMatch(/ch\.channel/);
    expect(zaloBranch).not.toMatch(/AND 1=0/);
    expect(webBranch).toMatch(/AND 1=0/);
  });

  it('gates zalo/web branches when channel is zalo_oa', async () => {
    await unifiedInboxRepository.getOutboxMessages(1, {
      channel: 'zalo_oa',
      limit: 20,
      offset: 0,
    });

    const [sql, params] = db.query.mock.calls[0];
    const channelBranch = sql.split('UNION ALL')[0];
    const zaloBranch = sql.split('UNION ALL')[1];
    const webBranch = sql.split('UNION ALL')[2];

    expect(channelBranch).toMatch(/ch\.channel = \$4/);
    expect(zaloBranch).toMatch(/AND 1=0/);
    expect(webBranch).toMatch(/AND 1=0/);
    expect(params).toEqual([1, 20, 0, 'zalo_oa']);
  });

  it('applies channel gates in getOutboxMessagesCount for zalo_oa', async () => {
    db.query.mockResolvedValue({ rows: [{ total: '1' }] });

    await unifiedInboxRepository.getOutboxMessagesCount(9, { channel: 'zalo_oa' });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/ch\.channel = \$2/);
    expect(sql.match(/AND 1=0/g)?.length).toBe(2);
    expect(params).toEqual([9, 'zalo_oa']);
  });
});

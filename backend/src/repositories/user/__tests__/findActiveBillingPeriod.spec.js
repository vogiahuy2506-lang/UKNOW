import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDb = {
  query: jest.fn(),
};

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: mockDb,
}));

const { findActiveBillingPeriod } = await import('../user.repository.js');

describe('findActiveBillingPeriod', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters out topup orders and returns billing_period from active plan order', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ billing_period: 'yearly' }],
    });

    const period = await findActiveBillingPeriod(10, 'user@example.com');
    expect(period).toBe('yearly');

    expect(mockDb.query).toHaveBeenCalledTimes(1);
    const [query, params] = mockDb.query.mock.calls[0];
    expect(query).toContain("note IS DISTINCT FROM 'topup'");
    expect(query).toContain("note IS DISTINCT FROM 'scheduled_change'");
    expect(query).toContain('topup_config IS NULL');
    expect(query).toContain('plan_id IS NOT NULL');
    expect(params).toEqual([10, 'user@example.com']);
  });

  it('defaults to monthly when no active orders found', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [],
    });

    const period = await findActiveBillingPeriod(10, null);
    expect(period).toBe('monthly');
  });

  it('defaults to monthly on database error', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB connection failed'));

    const period = await findActiveBillingPeriod(10, null);
    expect(period).toBe('monthly');
  });
});

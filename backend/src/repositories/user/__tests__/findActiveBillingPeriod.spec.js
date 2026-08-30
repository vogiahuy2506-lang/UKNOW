import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDb = {
  query: jest.fn(),
};

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: mockDb,
}));

const {
  findActiveBillingPeriod,
  findProfilePlan,
  lockUserForPlanActivation,
} = await import('../user.repository.js');

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
    expect(query).toContain('o.plan_id = u.effective_plan_id');
    expect(query).toContain('o.user_id IS NULL');
    expect(params).toEqual([10]);
  });

  it('defaults to monthly when no active orders found', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [],
    });

    const period = await findActiveBillingPeriod(10, null);
    expect(period).toBe('monthly');
  });

  it('rethrows database errors instead of guessing a monthly period', async () => {
    const error = new Error('DB connection failed');
    mockDb.query.mockRejectedValueOnce(error);

    await expect(findActiveBillingPeriod(10, null)).rejects.toBe(error);
  });

  it('does not display a historical order as an active plan when active_plan_id is null', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    await expect(findProfilePlan({
      activePlanId: null,
      userId: 10,
      email: 'expired@example.com',
    })).resolves.toBeNull();

    const [query, params] = mockDb.query.mock.calls[0];
    expect(query).toContain('WHERE p.id = $1::int');
    expect(query).not.toContain('FROM orders');
    expect(params).toEqual([null]);
  });

  it('locks the account row before a plan activation mutation', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: 10, email: 'user@example.com' }] });

    await expect(lockUserForPlanActivation(10)).resolves.toEqual({ id: 10, email: 'user@example.com' });

    const [query, params] = mockDb.query.mock.calls[0];
    expect(query).toContain('FROM users');
    expect(query).toContain('FOR UPDATE');
    expect(params).toEqual([10]);
  });
});

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const { getSubscriptionStatus } = await import('../subscriptionStatus.util.js');

describe('subscriptionStatus.util', () => {
  beforeEach(() => mockQuery.mockReset());

  it('không có userId → không có gói', async () => {
    const result = await getSubscriptionStatus(null);
    expect(result).toEqual({
      hasPlan: false,
      expiresAt: null,
      graceDays: 0,
      graceUntil: null,
      isExpired: false,
      isInGracePeriod: false,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('user không tồn tại → không có gói', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await getSubscriptionStatus(99);
    expect(result.hasPlan).toBe(false);
  });

  it('không có active_plan_id → không có gói (giữ hành vi cũ)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active_plan_id: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ active_plan_id: null, subscription_expires_at: null, grace_period_days: 0 }] });
    const result = await getSubscriptionStatus(10);
    expect(result.hasPlan).toBe(false);
    expect(result.isExpired).toBe(false);
  });

  it('còn hạn → không expired', async () => {
    const future = new Date(Date.now() + 7 * 86400000);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active_plan_id: 1 }] })
      .mockResolvedValueOnce({
        rows: [{
          active_plan_id: 1,
          subscription_expires_at: future.toISOString(),
          grace_period_days: 5,
        }],
      });

    const result = await getSubscriptionStatus(10);
    expect(result.hasPlan).toBe(true);
    expect(result.isExpired).toBe(false);
    expect(result.isInGracePeriod).toBe(false);
    expect(result.graceDays).toBe(5);
  });

  it('trong ân hạn → isInGracePeriod, chưa isExpired', async () => {
    const past = new Date(Date.now() - 2 * 86400000);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active_plan_id: 1 }] })
      .mockResolvedValueOnce({
        rows: [{
          active_plan_id: 1,
          subscription_expires_at: past.toISOString(),
          grace_period_days: 5,
        }],
      });

    const result = await getSubscriptionStatus(10);
    expect(result.hasPlan).toBe(true);
    expect(result.isInGracePeriod).toBe(true);
    expect(result.isExpired).toBe(false);
  });

  it('hết ân hạn → isExpired', async () => {
    const past = new Date(Date.now() - 10 * 86400000);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active_plan_id: 1 }] })
      .mockResolvedValueOnce({
        rows: [{
          active_plan_id: 1,
          subscription_expires_at: past.toISOString(),
          grace_period_days: 3,
        }],
      });

    const result = await getSubscriptionStatus(10);
    expect(result.hasPlan).toBe(true);
    expect(result.isExpired).toBe(true);
    expect(result.isInGracePeriod).toBe(false);
  });

  it('nhân viên không có gói → dùng gói owner', async () => {
    const future = new Date(Date.now() + 5 * 86400000);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ active_plan_id: null }] })
      .mockResolvedValueOnce({ rows: [{ owner_id: 20 }] })
      .mockResolvedValueOnce({
        rows: [{
          active_plan_id: 2,
          subscription_expires_at: future.toISOString(),
          grace_period_days: 0,
        }],
      });

    const result = await getSubscriptionStatus(15);
    expect(result.hasPlan).toBe(true);
    expect(result.isExpired).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});

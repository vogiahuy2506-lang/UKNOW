import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query, getClient: jest.fn() },
}));

const usageTrackingRepository = (await import('../usageTracking.repository.js')).default;
const { AUDIT_ACTIONS } = await import('../../../services/audit.service.js');

describe('KPI attribution (Phần 0)', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('trackUsage writes actor_user_id from metadata.actorUserId', async () => {
    query.mockResolvedValue({ rows: [{ id: 1 }] });
    await usageTrackingRepository.trackUsage(10, 'ai_credit', 1, { actorUserId: 42, feature: 'chat' });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO usage_logs \(id_user, actor_user_id/),
      expect.arrayContaining([10, 42, 'ai_credit', 1])
    );
  });

  it('trackUsage leaves actor_user_id null when metadata has no actor', async () => {
    query.mockResolvedValue({ rows: [{ id: 2 }] });
    await usageTrackingRepository.trackUsage(10, 'ai_token', 100, {});
    const params = query.mock.calls[0][1];
    expect(params[0]).toBe(10);
    expect(params[1]).toBeNull();
  });

  it('AUDIT_ACTIONS includes channel connection events', () => {
    expect(AUDIT_ACTIONS.EMAIL_ACCOUNT_CONNECTED).toBe('EMAIL_ACCOUNT_CONNECTED');
    expect(AUDIT_ACTIONS.ZALO_ACCOUNT_CONNECTED).toBe('ZALO_ACCOUNT_CONNECTED');
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockActivateFreePlan = jest.fn();

jest.unstable_mockModule('../../payment/payment.service.js', () => ({
  activateFreePlan: mockActivateFreePlan,
}));

const { grantSignupTrialInTx } = await import('../signupTrialTx.service.js');

function fakeClient(planRow = null) {
  return {
    query: jest.fn().mockResolvedValue({ rows: planRow ? [planRow] : [] }),
  };
}

describe('signupTrialTx.grantSignupTrialInTx', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SIGNUP_TRIAL_ENABLED = 'true';
  });

  it('returns null without calling activateFreePlan when disabled', async () => {
    process.env.SIGNUP_TRIAL_ENABLED = 'false';
    const client = fakeClient();
    const result = await grantSignupTrialInTx(client, { userId: 1, userEmail: 'a@b.com' });
    expect(result).toBeNull();
    expect(mockActivateFreePlan).not.toHaveBeenCalled();
  });

  it('returns the granted plan on success', async () => {
    mockActivateFreePlan.mockResolvedValueOnce({ orderCode: 123 });
    const client = fakeClient({
      active_plan_id: 12,
      subscription_expires_at: '2026-09-04',
      code: 'trial',
      name: 'Dùng thử',
      duration_days: 14,
      messages_per_period: 100,
      ai_credits_per_period: 3,
      max_chatbots: 1,
    });
    const result = await grantSignupTrialInTx(client, { userId: 1, userEmail: 'a@b.com' });
    expect(result).toEqual(expect.objectContaining({ activePlanId: 12, planCode: 'trial', durationDays: 14 }));
  });

  it('config error (plain Error, no .code — e.g. plan not found) is swallowed, returns null, does NOT rethrow', async () => {
    mockActivateFreePlan.mockRejectedValueOnce(new Error('Gói không tồn tại'));
    const client = fakeClient();
    const result = await grantSignupTrialInTx(client, { userId: 1, userEmail: 'a@b.com' });
    expect(result).toBeNull();
  });

  it('config error from the post-check (plan not applied) is also swallowed', async () => {
    mockActivateFreePlan.mockResolvedValueOnce({ orderCode: 123 });
    const client = fakeClient(null); // no row → "plan not applied" Error, no .code
    const result = await grantSignupTrialInTx(client, { userId: 1, userEmail: 'a@b.com' });
    expect(result).toBeNull();
  });

  it('transient infra error (pg error with .code) is rethrown so the caller rolls back registration', async () => {
    const pgErr = new Error('connection terminated');
    pgErr.code = '57P01';
    mockActivateFreePlan.mockRejectedValueOnce(pgErr);
    const client = fakeClient();
    await expect(grantSignupTrialInTx(client, { userId: 1, userEmail: 'a@b.com' }))
      .rejects.toThrow('connection terminated');
  });

  it('missing userId/userEmail throws regardless (programmer error, not a trial-config issue)', async () => {
    const client = fakeClient();
    await expect(grantSignupTrialInTx(client, { userId: null, userEmail: null }))
      .rejects.toThrow('missing userId/userEmail');
    expect(mockActivateFreePlan).not.toHaveBeenCalled();
  });
});

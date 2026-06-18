import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findProfileBase = jest.fn();
const findProfilePlan = jest.fn();
const findProfilePlanFallback = jest.fn();
const findProfileUsageCounts = jest.fn();
const getResourceUsage = jest.fn();

jest.unstable_mockModule('../../repositories/user/user.repository.js', () => ({
  createLegacyEmployee: jest.fn(),
  findLegacyEmployees: jest.fn(),
  findPasswordHashByUserId: jest.fn(),
  findProfileBase,
  findProfileBaseFallback: jest.fn(),
  findProfilePlan,
  findProfilePlanFallback,
  findProfileUsageCounts,
  findRoleAndLimits: jest.fn(),
  findRoleAndLimitsFallback: jest.fn(),
  findSuccessfulOrdersForUser: jest.fn(),
  findUserByEmailExceptId: jest.fn(),
  resetLegacyEmployeePassword: jest.fn(),
  updateLegacyEmployeeLimits: jest.fn(),
  updateLegacyEmployeeStatus: jest.fn(),
  updatePasswordHash: jest.fn(),
  updateProfile: jest.fn(),
}));

jest.unstable_mockModule('../../services/payment/usageTracking.service.js', () => ({
  default: { getResourceUsage },
}));

const userController = (await import('../user.controller.js')).default;

describe('UserController.getProfile', () => {
  let res;

  beforeEach(() => {
    findProfileBase.mockReset();
    findProfilePlan.mockReset();
    findProfilePlanFallback.mockReset();
    findProfileUsageCounts.mockReset();
    getResourceUsage.mockReset();

    findProfileBase.mockResolvedValue({
      id: 42,
      username: 'subscriber',
      email: 'sub@test.local',
      full_name: 'Sub User',
      avatar_url: null,
      phone: null,
      status: 'active',
      role: 'user',
      active_plan_id: 7,
      subscription_expires_at: null,
      max_campaigns: null,
      max_zalo_accounts: null,
      max_email_accounts: null,
      max_email_templates: null,
      max_zalo_templates: null,
      max_landing_pages: null,
      created_at: new Date('2026-06-01'),
      last_login_at: new Date('2026-06-18'),
      role_code: 'user',
      role_name: 'Người dùng',
    });
    findProfileUsageCounts.mockResolvedValue({
      email_sent_today: 1,
      email_sent_month: 2,
      zalo_sent_today: 3,
      zalo_sent_month: 4,
    });
    getResourceUsage.mockResolvedValue({ used: 100 });

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it('falls back to findProfilePlanFallback when primary plan query fails', async () => {
    findProfilePlan.mockRejectedValue(new Error('column p.ai_tokens_per_period does not exist'));
    findProfilePlanFallback.mockResolvedValue({
      plan_id: 7,
      plan_name: 'Trial',
      plan_code: 'trial',
      plan_price: 0,
      plan_features: '[]',
      plan_max_employees: 1,
      daily_email_limit: null,
      monthly_email_limit: null,
      daily_zalo_limit: null,
      monthly_zalo_limit: null,
      ai_tokens_per_period: null,
    });

    await userController.getProfile({ user: { id: 42 } }, res);

    expect(findProfilePlanFallback).toHaveBeenCalledWith({
      activePlanId: 7,
      userId: 42,
      email: 'sub@test.local',
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        activePlanId: 7,
        activePlanCode: 'trial',
        activePlanName: 'Trial',
      }),
    });
  });

  it('still exposes activePlanId from users.active_plan_id when both plan queries fail', async () => {
    findProfilePlan.mockRejectedValue(new Error('column p.ai_tokens_per_period does not exist'));
    findProfilePlanFallback.mockRejectedValue(new Error('connection reset'));

    await userController.getProfile({ user: { id: 42 } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        activePlanId: 7,
        activePlanCode: null,
        activePlanName: null,
      }),
    });
  });
});

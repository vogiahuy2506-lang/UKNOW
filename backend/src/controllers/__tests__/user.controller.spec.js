import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findProfileBase = jest.fn();
const findProfilePlan = jest.fn();
const findProfilePlanFallback = jest.fn();
const findProfileUsageCounts = jest.fn();
const getResourceUsage = jest.fn();
const getCreditUsageForCycle = jest.fn();
const resolveBillingUserId = jest.fn();
const sumActiveTopupGrants = jest.fn();
const getWalletBalance = jest.fn();
const findSuccessfulOrdersForUser = jest.fn();
const findInvoiceProfileByUserId = jest.fn();
const saveInvoiceProfile = jest.fn();
const clearInvoiceProfile = jest.fn();

jest.unstable_mockModule('../../repositories/user/user.repository.js', () => ({
  findLegacyEmployees: jest.fn(),
  findPasswordHashByUserId: jest.fn(),
  findProfileBase,
  findProfileBaseFallback: jest.fn(),
  findProfilePlan,
  findProfilePlanByUserId: jest.fn(),
  findProfilePlanByUserIdFallback: jest.fn(),
  findProfilePlanFallback,
  findProfileUsageCounts,
  findStructuralUsageCounts: jest.fn().mockResolvedValue({}),
  findActiveBillingPeriod: jest.fn().mockResolvedValue('monthly'),
  findRoleAndLimits: jest.fn(),
  findRoleAndLimitsFallback: jest.fn(),
  findSuccessfulOrdersForUser,
  findInvoiceProfileByUserId,
  saveInvoiceProfile,
  clearInvoiceProfile,
  findUserByEmailExceptId: jest.fn(),
  findUserByPhoneExceptId: jest.fn(),
  isCurrentlyAnyonesEmployee: jest.fn().mockResolvedValue(false),
  resetLegacyEmployeePassword: jest.fn(),
  revokeAllRefreshTokensForUser: jest.fn(),
  updateLegacyEmployeeLimits: jest.fn(),
  updateLegacyEmployeeStatus: jest.fn(),
  updateBotDailyReplyCap: jest.fn(),
  updateAiHandoffAutoResumeMinutes: jest.fn(),
  updatePasswordHash: jest.fn(),
  updateProfile: jest.fn(),
}));

jest.unstable_mockModule('../../utils/billingCycle.util.js', () => ({
  resolveBillingUserId,
}));

jest.unstable_mockModule('../../services/payment/usageTracking.service.js', () => ({
  default: {
    getResourceUsage,
    getCreditUsageForCycle,
  },
}));

jest.unstable_mockModule('../../repositories/payment/topup.repository.js', () => ({
  sumActiveTopupGrants,
  getWalletBalance,
  findAllTopupPricing: jest.fn(),
  insertTopupGrants: jest.fn(),
  findGrantsByOrderId: jest.fn(),
}));

const getOwnerUsedToday = jest.fn(async () => 0);
const invalidateOwnerCapCache = jest.fn();

jest.unstable_mockModule('../../services/chatbot/chatbotRateLimit.service.js', () => ({
  default: {
    systemLimits: {
      perSenderPerMin: 8,
      perSenderPerHour: 20,
      perSenderPerDay: 50,
      perChatbotPerHour: 500,
    },
    getOwnerUsedToday,
    invalidateOwnerCapCache,
  },
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
    getCreditUsageForCycle.mockReset();
    resolveBillingUserId.mockReset();
    sumActiveTopupGrants.mockReset();
    getWalletBalance.mockReset();
    findSuccessfulOrdersForUser.mockReset();
    getOwnerUsedToday.mockReset();
    invalidateOwnerCapCache.mockReset();
    getOwnerUsedToday.mockResolvedValue(0);

    resolveBillingUserId.mockImplementation(async (userId, options = {}) => {
      if (options.ownerContextId != null && options.ownerContextId !== '') {
        return Number(options.ownerContextId);
      }
      return userId;
    });
    sumActiveTopupGrants.mockResolvedValue(0);
    getWalletBalance.mockResolvedValue({ granted: 0, used: 0, remaining: 0, rawRemaining: 0 });

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
    getCreditUsageForCycle.mockResolvedValue({ used: 3, cycle: { billingUserId: 42 } });

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

  it('uses billing owner plan when employee works in owner context', async () => {
    findProfileBase.mockImplementation(async (id) => {
      if (Number(id) === 42) {
        return {
          id: 42,
          username: 'owner',
          email: 'owner@test.local',
          active_plan_id: 7,
          subscription_expires_at: new Date('2026-08-01'),
        };
      }
      return {
        id: 99,
        username: 'employee',
        email: 'employee@test.local',
        full_name: 'Employee User',
        avatar_url: null,
        phone: null,
        status: 'active',
        role: 'user',
        active_plan_id: null,
        subscription_expires_at: new Date('2025-01-01'),
        max_campaigns: null,
        max_zalo_accounts: null,
        max_email_accounts: null,
        max_email_templates: null,
        max_zalo_templates: null,
        max_landing_pages: null,
        created_at: new Date('2026-06-01'),
        last_login_at: null,
        role_code: 'user',
        role_name: 'Người dùng',
      };
    });
    findProfilePlan.mockResolvedValue({
      plan_id: 7,
      plan_name: 'Starter',
      plan_code: 'starter',
      plan_price: 199000,
      plan_features: '[]',
      plan_max_employees: 3,
      daily_email_limit: null,
      monthly_email_limit: null,
      daily_zalo_limit: null,
      monthly_zalo_limit: null,
      ai_tokens_per_period: null,
      ai_credits_per_period: 10,
      grace_period_days: 0,
    });
    getCreditUsageForCycle.mockResolvedValue({ used: 8, cycle: { billingUserId: 42 } });
    getWalletBalance.mockImplementation(async (_uid, itemKey) => (
      itemKey === 'zalo_messages'
        ? { granted: 300, used: 0, remaining: 300, rawRemaining: 300 }
        : { granted: 0, used: 0, remaining: 0, rawRemaining: 0 }
    ));

    await userController.getProfile({
      user: {
        id: 99,
        activeContext: { type: 'employee', ownerId: 42 },
      },
    }, res);

    expect(resolveBillingUserId).toHaveBeenCalledWith(99, { ownerContextId: 42 });
    expect(findProfilePlan).toHaveBeenCalledWith({
      activePlanId: 7,
      userId: 42,
      email: 'owner@test.local',
    });
    expect(getCreditUsageForCycle).toHaveBeenCalledWith(99, null, { ownerContextId: 42 });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        activePlanId: 7,
        activePlanCode: 'starter',
        aiCreditsUsed: 8,
        aiCreditsPerPeriod: 10,
        addons: expect.objectContaining({
          zaloMessages: { granted: 300, used: 0, remaining: 300 },
        }),
      }),
    });
  });

  it('addons expiresAt lấy từ billing owner khi employee tự resolve qua user_members (không có context)', async () => {
    resolveBillingUserId.mockResolvedValue(42);
    findProfileBase.mockImplementation(async (id) => {
      if (Number(id) === 42) {
        return {
          id: 42,
          username: 'owner',
          email: 'owner@test.local',
          active_plan_id: 7,
          subscription_expires_at: new Date('2026-09-15'),
        };
      }
      return {
        id: 99,
        username: 'emp2',
        email: 'emp2@test.local',
        full_name: 'Emp',
        avatar_url: null,
        phone: null,
        status: 'active',
        role: 'user',
        active_plan_id: null,
        subscription_expires_at: new Date('2025-02-02'),
        max_campaigns: null,
        max_zalo_accounts: null,
        max_email_accounts: null,
        max_email_templates: null,
        max_zalo_templates: null,
        max_landing_pages: null,
        created_at: new Date('2026-06-01'),
        last_login_at: null,
        role_code: 'user',
        role_name: 'Người dùng',
      };
    });
    findProfilePlan.mockResolvedValue({
      plan_id: 7,
      plan_name: 'Starter',
      plan_code: 'starter',
      monthly_zalo_limit: 2000,
    });
    getWalletBalance.mockResolvedValueOnce({
      granted: 100, used: 0, remaining: 100, rawRemaining: 100,
    }).mockResolvedValue({ granted: 0, used: 0, remaining: 0, rawRemaining: 0 });

    await userController.getProfile({ user: { id: 99 } }, res);

    expect(res.json.mock.calls[0][0].data.addons.zaloMessages.remaining).toBe(100);
    expect(res.json.mock.calls[0][0].data.addons.expiresAt).toBeUndefined();
  });

  it('trả addons wallet theo billing owner, không cộng vào monthlyZaloLimit', async () => {
    findProfilePlan.mockResolvedValue({
      plan_id: 7,
      plan_name: 'Starter',
      plan_code: 'starter',
      monthly_zalo_limit: 2000,
      monthly_email_limit: 5000,
      ai_credits_per_period: 100,
    });
    getWalletBalance.mockImplementation(async (_uid, itemKey) => {
      if (itemKey === 'zalo_messages') {
        return { granted: 300, used: 0, remaining: 300, rawRemaining: 300 };
      }
      if (itemKey === 'ai_credits') {
        return { granted: 50, used: 0, remaining: 50, rawRemaining: 50 };
      }
      return { granted: 0, used: 0, remaining: 0, rawRemaining: 0 };
    });

    await userController.getProfile({ user: { id: 42 } }, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        monthlyZaloLimit: 2000,
        addons: {
          zaloMessages: { granted: 300, used: 0, remaining: 300 },
          emails: { granted: 0, used: 0, remaining: 0 },
          aiCredits: { granted: 50, used: 0, remaining: 50 },
          zaloAccounts: 0,
          emailAccounts: 0,
          landingPages: 0,
          chatbots: 0,
          employees: 0,
        },
      }),
    });
  });

  it('addons = null khi chưa mua thêm', async () => {
    findProfilePlan.mockResolvedValue({ plan_id: 7, monthly_zalo_limit: 2000 });
    await userController.getProfile({ user: { id: 42 } }, res);
    expect(res.json.mock.calls[0][0].data.addons).toBeNull();
  });
});

describe('UserController.getMyOrders', () => {
  let res;

  beforeEach(() => {
    findSuccessfulOrdersForUser.mockReset();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  it("gắn kind=topup khi note=topup, lọc qty=0, kind=plan khi có plan_id", async () => {
    findSuccessfulOrdersForUser.mockResolvedValue([
      {
        id: 1,
        order_code: 100,
        amount: 60000,
        status: 'success',
        created_at: new Date('2026-08-01'),
        updated_at: new Date('2026-08-01'),
        note: 'topup',
        topup_config: { quantities: { zalo_messages: 300, emails: 0, ai_credits: 50 } },
        plan_id: null,
        plan_name: null,
      },
      {
        id: 2,
        order_code: 200,
        amount: 99000,
        status: 'success',
        created_at: new Date('2026-07-01'),
        updated_at: new Date('2026-07-01'),
        note: null,
        topup_config: null,
        plan_id: 7,
        plan_name: 'Starter',
        plan_code: 'starter',
        daily_email_limit: null,
        monthly_email_limit: 5000,
        daily_zalo_limit: null,
        monthly_zalo_limit: 2000,
      },
    ]);

    await userController.getMyOrders(
      { user: { id: 42, email: 'sub@test.local' } },
      res
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          kind: 'topup',
          topup: {
            items: [
              { itemKey: 'zalo_messages', qty: 300 },
              { itemKey: 'ai_credits', qty: 50 },
            ],
          },
          plan: null,
          invoice: null,
        }),
        expect.objectContaining({
          kind: 'plan',
          topup: null,
          plan: expect.objectContaining({ name: 'Starter', code: 'starter' }),
          invoice: null,
        }),
      ],
    });
  });

  it("gắn object invoice khi order có einvoice_status", async () => {
    findSuccessfulOrdersForUser.mockResolvedValue([
      {
        id: 3,
        order_code: 300,
        amount: 548900,
        status: 'success',
        created_at: new Date('2026-08-16'),
        updated_at: new Date('2026-08-16'),
        plan_id: 1,
        plan_name: 'Pro',
        einvoice_status: 'issued',
        so_hdon: '00000772',
        khhdon: 'C26TAT',
        einvoice_email_status: 'sent',
        einvoice_issued_at: new Date('2026-08-16T10:00:00Z'),
      },
    ]);

    await userController.getMyOrders(
      { user: { id: 42, email: 'sub@test.local' } },
      res
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          invoice: {
            status: 'issued',
            soHdon: '00000772',
            khhdon: 'C26TAT',
            emailStatus: 'sent',
            issuedAt: expect.any(Date),
          },
        }),
      ],
    });
  });
});

describe('UserController Invoice Profile', () => {
  let res;

  beforeEach(() => {
    findInvoiceProfileByUserId.mockReset();
    saveInvoiceProfile.mockReset();
    clearInvoiceProfile.mockReset();
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  it('getInvoiceProfile returns saved profile or null', async () => {
    findInvoiceProfileByUserId.mockResolvedValue({
      buyerType: 'company',
      taxCode: '0312345678',
      companyName: 'Cong Ty ABC',
    });

    await userController.getInvoiceProfile({ user: { id: 42 } }, res);

    expect(findInvoiceProfileByUserId).toHaveBeenCalledWith(42);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        buyerType: 'company',
        taxCode: '0312345678',
        companyName: 'Cong Ty ABC',
      },
    });
  });

  it('updateInvoiceProfile validates and saves normalized profile', async () => {
    saveInvoiceProfile.mockImplementation((userId, profile) => Promise.resolve(profile));

    await userController.updateInvoiceProfile(
      {
        user: { id: 42 },
        body: {
          buyerType: 'company',
          taxCode: '0312345678',
          companyName: 'Cong Ty ABC',
          saveProfile: true,
          gross: 999999,
        },
      },
      res
    );

    expect(saveInvoiceProfile).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        buyerType: 'company',
        taxCode: '0312345678',
        companyName: 'Cong Ty ABC',
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        buyerType: 'company',
        taxCode: '0312345678',
      }),
    });
  });

  it('updateInvoiceProfile returns 400 on invalid data', async () => {
    await userController.updateInvoiceProfile(
      {
        user: { id: 42 },
        body: { buyerType: 'company', taxCode: '123' },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  it('deleteInvoiceProfile clears profile', async () => {
    clearInvoiceProfile.mockResolvedValue(null);

    await userController.deleteInvoiceProfile({ user: { id: 42 } }, res);

    expect(clearInvoiceProfile).toHaveBeenCalledWith(42);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Đã xoá thông tin xuất hoá đơn đã lưu',
    });
  });
});

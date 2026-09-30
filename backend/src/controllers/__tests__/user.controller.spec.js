import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findProfileBase = jest.fn();
const findProfilePlan = jest.fn();
const findProfilePlanFallback = jest.fn();
const getProfileSendUsage = jest.fn();
const getProfileResourceUsage = jest.fn();
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
  updatePhoneAndResetVerification: jest.fn(),
}));

jest.unstable_mockModule('../../utils/billingCycle.util.js', () => ({
  resolveBillingUserId,
}));

// PR-3 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30): số "đã dùng" do service riêng tính bằng chính hàm của cổng chặn —
// controller chỉ ghép vào payload. Phần tính (đúng hàm, đúng kỳ, lỗi từng phần) có spec riêng ở
// services/user/__tests__/profileUsage.service.spec.js và integration profileUsageSnapshot.test.js.
jest.unstable_mockModule('../../services/user/profileUsage.service.js', () => ({
  getProfileSendUsage,
  getProfileResourceUsage,
}));

// Hình dạng thật service trả khi gói không có trần ngày / trần tổng và chưa có kỳ.
const SEND_USAGE_EMPTY = {
  cycleStart: null,
  cycleEnd: null,
  emailSentCycle: null,
  messagingSentCycle: null,
  combinedSentCycle: null,
  telegramSentCycle: null,
  whatsappSentCycle: null,
  emailSentToday: null,
  messagingSentToday: null,
};
const RESOURCE_USAGE_EMPTY = {
  chatbots: null,
  landingPages: null,
  zaloAccounts: null,
  emailAccounts: null,
  whatsappAccounts: null,
  telegramAccounts: null,
  employees: null,
};

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
  findTopupPricingByKey: jest.fn().mockResolvedValue(null),
  insertTopupGrants: jest.fn(),
  findGrantsByOrderId: jest.fn(),
  findExpiringUnrenewedGrants: jest.fn(),
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
    getProfileSendUsage.mockReset();
    getProfileResourceUsage.mockReset();
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
    getProfileSendUsage.mockResolvedValue(SEND_USAGE_EMPTY);
    getProfileResourceUsage.mockResolvedValue(RESOURCE_USAGE_EMPTY);
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
          telegramMessages: { granted: 0, used: 0, remaining: 0 },
          whatsappMessages: { granted: 0, used: 0, remaining: 0 },
          emails: { granted: 0, used: 0, remaining: 0 },
          aiCredits: { granted: 50, used: 0, remaining: 50 },
          zaloAccounts: 0,
          telegramAccounts: 0,
          whatsappAccounts: 0,
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

  // PR-2 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30): trang khách cần ngày làm mới hạn mức AI. Kỳ lấy từ ĐÚNG `cycle` mà
  // getCreditUsageForCycle đã dùng để tính aiCreditsUsed (không dựng kỳ lần hai) và trả dạng ISO.
  it('trả aiCreditCycleStart/aiCreditCycleEnd (ISO) lấy từ cycle của getCreditUsageForCycle, giữ nguyên các trường cũ', async () => {
    findProfilePlan.mockResolvedValue({ plan_id: 7, plan_code: 'starter', ai_credits_per_period: 100 });
    getCreditUsageForCycle.mockResolvedValue({
      used: 37,
      cycle: {
        hasPlan: true,
        billingUserId: 42,
        cycleStart: new Date('2026-09-10T02:30:00.000Z'),
        cycleEnd: new Date('2026-10-10T02:30:00.000Z'),
      },
    });

    await userController.getProfile({ user: { id: 42 } }, res);

    const { data } = res.json.mock.calls[0][0];
    expect(data.aiCreditCycleStart).toBe('2026-09-10T02:30:00.000Z');
    expect(data.aiCreditCycleEnd).toBe('2026-10-10T02:30:00.000Z');
    // trường cũ không đổi
    expect(data.aiCreditsUsed).toBe(37);
    expect(data.aiCreditsPerPeriod).toBe(100);
    expect(data.aiTokensUsed).toBe(100);
  });

  it('chưa có gói / không dựng được kỳ → aiCreditCycleStart/End = null (không phải chuỗi "Invalid Date")', async () => {
    getCreditUsageForCycle.mockResolvedValue({
      used: 0,
      cycle: { hasPlan: false, billingUserId: 42, cycleStart: null, cycleEnd: null },
    });
    await userController.getProfile({ user: { id: 42 } }, res);
    expect(res.json.mock.calls[0][0].data.aiCreditCycleStart).toBeNull();
    expect(res.json.mock.calls[0][0].data.aiCreditCycleEnd).toBeNull();
  });

  // PR-3: đồng hồ lỗi là null (FE hiện "—"), KHÔNG đổi thành 0 giả — trước đây trả 0 nên trang hiện "0 / N" như thể
  // khách chưa dùng gì.
  it('getCreditUsageForCycle ném lỗi → hồ sơ vẫn trả được, kỳ = null, aiCreditsUsed = null (không phải 0 giả)', async () => {
    getCreditUsageForCycle.mockRejectedValue(new Error('db down'));
    await userController.getProfile({ user: { id: 42 } }, res);
    const { data } = res.json.mock.calls[0][0];
    expect(data.aiCreditCycleStart).toBeNull();
    expect(data.aiCreditCycleEnd).toBeNull();
    expect(data.aiCreditsUsed).toBeNull();
  });
});

// PR-3 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30): GET /users/profile ghép số "đã dùng" do profileUsage.service tính.
describe('UserController.getProfile — số đã dùng lấy từ profileUsage.service (hàm của cổng chặn)', () => {
  let res;

  beforeEach(() => {
    findProfileBase.mockReset();
    findProfilePlan.mockReset();
    getProfileSendUsage.mockReset();
    getProfileResourceUsage.mockReset();
    getCreditUsageForCycle.mockReset();
    getResourceUsage.mockReset();
    resolveBillingUserId.mockReset();
    sumActiveTopupGrants.mockReset();
    getWalletBalance.mockReset();
    getOwnerUsedToday.mockReset();

    resolveBillingUserId.mockImplementation(async (userId, options = {}) => (
      options.ownerContextId != null && options.ownerContextId !== '' ? Number(options.ownerContextId) : userId
    ));
    sumActiveTopupGrants.mockResolvedValue(0);
    getWalletBalance.mockResolvedValue({ granted: 0, used: 0, remaining: 0, rawRemaining: 0 });
    getOwnerUsedToday.mockResolvedValue(0);
    getResourceUsage.mockResolvedValue({ used: 0 });
    getCreditUsageForCycle.mockResolvedValue({ used: 3, cycle: { billingUserId: 42 } });
    findProfileBase.mockImplementation(async (id) => ({
      id,
      username: `u${id}`,
      email: `u${id}@test.local`,
      status: 'active',
      role: 'user',
      active_plan_id: 7,
      subscription_expires_at: null,
      created_at: new Date('2026-06-01'),
      last_login_at: null,
      role_code: 'user',
      role_name: 'Người dùng',
    }));
    findProfilePlan.mockResolvedValue({
      plan_id: 7,
      plan_code: 'starter',
      daily_email_limit: 500,
      monthly_email_limit: 10000,
      daily_zalo_limit: null,
      monthly_zalo_limit: 5000,
      messages_per_period: 100,
      max_chatbots: 3,
      ai_credits_per_period: 100,
    });
    getProfileSendUsage.mockResolvedValue(SEND_USAGE_EMPTY);
    getProfileResourceUsage.mockResolvedValue(RESOURCE_USAGE_EMPTY);
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  });

  it('ghép kỳ + số tin trong kỳ + số hôm nay + tài nguyên vào payload; kỳ trả dạng ISO', async () => {
    getProfileSendUsage.mockResolvedValue({
      cycleStart: new Date('2026-09-10T02:30:00.000Z'),
      cycleEnd: new Date('2026-10-10T02:30:00.000Z'),
      emailSentCycle: 3400,
      messagingSentCycle: 120,
      combinedSentCycle: 3520,
      emailSentToday: 12,
      messagingSentToday: null,
    });
    getProfileResourceUsage.mockResolvedValue({
      ...RESOURCE_USAGE_EMPTY,
      chatbots: { used: 2, limit: 3 },
      landingPages: { used: 1, limit: null },
      employees: { used: 0, limit: 1 },
    });

    await userController.getProfile({ user: { id: 42 } }, res);

    const { data } = res.json.mock.calls[0][0];
    expect(data.sendCycleStart).toBe('2026-09-10T02:30:00.000Z');
    expect(data.sendCycleEnd).toBe('2026-10-10T02:30:00.000Z');
    expect(data).toMatchObject({
      emailSentCycle: 3400,
      messagingSentCycle: 120,
      combinedSentCycle: 3520,
      emailSentToday: 12,
      messagingSentToday: null,
      // Trần lấy từ chính dòng gói: trần tổng kỳ + trần ngày/tháng theo kênh.
      messagesPerPeriod: 100,
      dailyEmailLimit: 500,
      monthlyEmailLimit: 10000,
      dailyZaloLimit: null,
      monthlyZaloLimit: 5000,
      maxChatbots: 3,
    });
    expect(data.resourceUsage).toEqual({
      ...RESOURCE_USAGE_EMPTY,
      chatbots: { used: 2, limit: 3 },
      landingPages: { used: 1, limit: null },
      employees: { used: 0, limit: 1 },
    });
  });

  // P10 — hạn mức tin/tháng RIÊNG Telegram/WhatsApp: trần lấy từ dòng gói, số đã dùng từ service (hàm của cổng chặn);
  // ví tin riêng trong addons. 0 giữ là 0 (gói không có kênh), thiếu cột -> null (không giới hạn).
  it('P10: trả monthlyTelegramLimit/monthlyWhatsappLimit + telegramSentCycle/whatsappSentCycle; ví tin riêng trong addons', async () => {
    findProfilePlan.mockResolvedValue({
      plan_id: 7,
      monthly_zalo_limit: 5000,
      monthly_telegram_limit: 300,
      monthly_whatsapp_limit: 0,
    });
    getProfileSendUsage.mockResolvedValue({
      ...SEND_USAGE_EMPTY,
      messagingSentCycle: 120,
      telegramSentCycle: 11,
      whatsappSentCycle: 22,
    });
    getWalletBalance.mockImplementation(async (_uid, itemKey) => (
      itemKey === 'telegram_messages'
        ? { granted: 100, used: 40, remaining: 60, rawRemaining: 60 }
        : { granted: 0, used: 0, remaining: 0, rawRemaining: 0 }
    ));

    await userController.getProfile({ user: { id: 42 } }, res);

    const { data } = res.json.mock.calls[0][0];
    expect(data).toMatchObject({
      monthlyZaloLimit: 5000,
      monthlyTelegramLimit: 300,
      monthlyWhatsappLimit: 0,
      messagingSentCycle: 120,
      telegramSentCycle: 11,
      whatsappSentCycle: 22,
    });
    expect(data.addons.telegramMessages).toEqual({ granted: 100, used: 40, remaining: 60 });
  });

  it('P10: gói thiếu cột hạn mức riêng -> null (không giới hạn), số đã dùng null khi đồng hồ lỗi', async () => {
    findProfilePlan.mockResolvedValue({ plan_id: 7, monthly_zalo_limit: 5000 });
    await userController.getProfile({ user: { id: 42 } }, res);
    expect(res.json.mock.calls[0][0].data).toMatchObject({
      monthlyTelegramLimit: null,
      monthlyWhatsappLimit: null,
      telegramSentCycle: null,
      whatsappSentCycle: null,
    });
  });

  it('service được gọi với chủ tài khoản (billing user) và dòng gói của hồ sơ — nhân viên ở ngữ cảnh chủ thấy số của chủ', async () => {
    const req = { user: { id: 99, activeContext: { type: 'employee', ownerId: 42 } } };

    await userController.getProfile(req, res);

    expect(getProfileSendUsage).toHaveBeenCalledWith(42, expect.objectContaining({
      daily_email_limit: 500,
      messages_per_period: 100,
    }));
    expect(getProfileResourceUsage).toHaveBeenCalledWith(42);
  });

  it('đồng hồ lỗi (null từ service) được giữ nguyên là null, KHÔNG bị ép thành 0 ở trường mới', async () => {
    getProfileSendUsage.mockResolvedValue({
      ...SEND_USAGE_EMPTY,
      cycleStart: new Date('2026-09-10T02:30:00.000Z'),
      cycleEnd: new Date('2026-10-10T02:30:00.000Z'),
      emailSentCycle: 50,
      messagingSentCycle: null, // đồng hồ này lỗi
    });
    getProfileResourceUsage.mockResolvedValue({
      ...RESOURCE_USAGE_EMPTY,
      chatbots: null, // đồng hồ này lỗi
      zaloAccounts: { used: 1, limit: 2 },
    });

    await userController.getProfile({ user: { id: 42 } }, res);

    const { data } = res.json.mock.calls[0][0];
    expect(data.emailSentCycle).toBe(50);
    expect(data.messagingSentCycle).toBeNull();
    expect(data.resourceUsage.chatbots).toBeNull();
    expect(data.resourceUsage.zaloAccounts).toEqual({ used: 1, limit: 2 });
  });

  // Tương thích ngược: FE cũ (chưa nạp lại) truyền thẳng data.emailSentMonth… vào UsageBar (used.toLocaleString());
  // thiếu là TypeError. Tên cũ vẫn có mặt, mang số MỚI (theo kỳ, đúng hàm cổng), không phải số đếm journey sai.
  it('tên cũ (emailSentMonth, zaloSentMonth, zaloSentToday, *Used) vẫn có mặt và mang số mới', async () => {
    getProfileSendUsage.mockResolvedValue({
      ...SEND_USAGE_EMPTY,
      emailSentCycle: 3400,
      messagingSentCycle: 120,
      messagingSentToday: 7,
    });
    getProfileResourceUsage.mockResolvedValue({
      chatbots: { used: 2, limit: 3 },
      landingPages: { used: 4, limit: 5 },
      zaloAccounts: { used: 1, limit: 2 },
      emailAccounts: { used: 3, limit: 4 },
      whatsappAccounts: { used: 5, limit: null },
      telegramAccounts: { used: 6, limit: null },
      employees: null,
    });

    await userController.getProfile({ user: { id: 42 } }, res);

    const { data } = res.json.mock.calls[0][0];
    expect(data).toMatchObject({
      emailSentMonth: 3400,
      zaloSentMonth: 120,
      zaloSentToday: 7,
      chatbotsUsed: 2,
      landingPagesUsed: 4,
      zaloAccountsUsed: 1,
      emailAccountsUsed: 3,
      whatsappAccountsUsed: 5,
      telegramAccountsUsed: 6,
      employeesUsed: 0, // đồng hồ lỗi → tên cũ về 0 (chỉ để FE cũ khỏi vỡ); trường mới ở resourceUsage.employees là null
    });
    expect(data.resourceUsage.employees).toBeNull();
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

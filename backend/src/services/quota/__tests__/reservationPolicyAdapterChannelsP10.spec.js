/**
 * P10 (PLAN_TG_WA_DAY_DU mục 17) — `evaluateReservationQuotaPolicy` (nhánh atomic của hệ đặt chỗ, production đang SHADOW) cho kênh
 * Telegram/WhatsApp: đọc cột hạn mức tin/tháng của CHÍNH kênh, đếm bằng `countAdapterSentInCycleWithLedger` (không phải bộ đếm
 * Zalo), nhãn kênh + đơn vị 'tin' trong thông điệp, ví `<kênh>_messages`, không áp trần nhân viên/ngày. Zalo/email giữ nguyên.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const repo = {
  acquireWorkspaceQuotaLock: jest.fn(),
  createReservation: jest.fn(),
  findReservationByKey: jest.fn(),
  findReservationById: jest.fn(),
  transitionReservationState: jest.fn(),
  validateReservationKey: jest.fn((k) => k),
  validateProviderReference: jest.fn(),
  validateFailureCode: jest.fn(),
  countEmailSentTodayWithLedger: jest.fn(async () => 0),
  countZaloSentTodayWithLedger: jest.fn(async () => 0),
  countEmailSentInCycleWithLedger: jest.fn(async () => 0),
  countZaloSentInCycleWithLedger: jest.fn(async () => 0),
  countAdapterSentInCycleWithLedger: jest.fn(async () => 0),
  countCombinedSentInCycleWithLedger: jest.fn(async () => 0),
  countEmployeeSentTodayWithLedger: jest.fn(async () => 0),
  countEmployeeSentInCycleWithLedger: jest.fn(async () => 0),
  getWorkspacePlanLimits: jest.fn(),
  getEmployeeSendLimits: jest.fn(),
  getWalletAvailableBalance: jest.fn(),
};

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn(), getClient: jest.fn() },
  isConnectionError: () => false,
}));
jest.unstable_mockModule('../../../repositories/sendQuota.repository.js', () => repo);
jest.unstable_mockModule('../../../repositories/payment/topup.repository.js', () => ({
  acquireWalletLock: jest.fn(),
  insertTopupDebit: jest.fn(),
}));
jest.unstable_mockModule('../../../utils/billingCycle.util.js', () => ({
  EFFECTIVE_PLAN_ID_SQL: 'u.active_plan_id',
  resolveBillingUserId: jest.fn(async (userId) => userId),
  getBillingCycle: jest.fn(),
}));
jest.unstable_mockModule('../../../utils/subscriptionStatus.util.js', () => ({ getSubscriptionStatus: jest.fn() }));
jest.unstable_mockModule('../../payment/topupWallet.service.js', () => ({
  WALLET_ITEM_BY_CHANNEL: { email: 'emails', zalo: 'zalo_messages' },
  maybeDebitWalletForSend: jest.fn(),
  getWalletSnapshot: jest.fn(),
}));

const { evaluateReservationQuotaPolicy } = await import('../sendQuotaReservation.service.js');

const CYCLE_START = new Date('2025-12-31T17:00:00.000Z');
const CYCLE_END = new Date('2026-01-31T17:00:00.000Z');
const DAY_START = new Date('2026-01-10T17:00:00.000Z');
const DAY_END = new Date('2026-01-11T17:00:00.000Z');

const plan = (overrides = {}) => ({
  has_plan: true,
  plan_id: 9,
  is_subscription_expired: false,
  daily_email_limit: null,
  monthly_email_limit: null,
  daily_zalo_limit: null,
  monthly_zalo_limit: 5, // KHÁC telegram/whatsapp
  monthly_telegram_limit: 100,
  monthly_whatsapp_limit: 200,
  messages_per_period: null,
  ...overrides,
});

const run = (channel, extra = {}) => evaluateReservationQuotaPolicy({}, {
  billingUserId: 10,
  userId: 10,
  channel,
  quantity: 1,
  isMetered: true,
  vnDayStart: DAY_START,
  vnDayEnd: DAY_END,
  cycleStart: CYCLE_START,
  cycleEnd: CYCLE_END,
  ...extra,
});

describe('evaluateReservationQuotaPolicy — kênh adapter (P10)', () => {
  beforeEach(() => {
    Object.values(repo).forEach((fn) => fn.mockClear?.());
    repo.getWorkspacePlanLimits.mockResolvedValue(plan());
    repo.getWalletAvailableBalance.mockResolvedValue({ available: 0 });
    repo.countAdapterSentInCycleWithLedger.mockResolvedValue(0);
    repo.getEmployeeSendLimits.mockResolvedValue(null);
  });

  it.each([
    ['telegram', 100],
    ['whatsapp', 200],
  ])('%s: còn hạn mức riêng (%i) dù đã vượt trần Zalo (5) → cho phép; đếm bằng bộ đếm adapter đúng kênh', async (channel) => {
    repo.countAdapterSentInCycleWithLedger.mockResolvedValue(50);
    const result = await run(channel);
    expect(result.allowed).toBe(true);
    expect(repo.countAdapterSentInCycleWithLedger).toHaveBeenCalledWith({}, 10, channel, CYCLE_START, CYCLE_END);
    expect(repo.countZaloSentInCycleWithLedger).not.toHaveBeenCalled();
    expect(repo.countZaloSentTodayWithLedger).not.toHaveBeenCalled();
  });

  it.each([
    ['telegram', 100, 'Telegram'],
    ['whatsapp', 200, 'WhatsApp'],
  ])('%s: chạm trần → 403 monthly, thông điệp nêu kênh + "tin", resetAt = hết chu kỳ', async (channel, limit, label) => {
    repo.countAdapterSentInCycleWithLedger.mockResolvedValue(limit);
    await expect(run(channel)).rejects.toMatchObject({
      status: 403,
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limitType: 'monthly',
      limit,
      currentCount: limit,
      resetAt: CYCLE_END,
      message: `Đã đạt giới hạn gửi ${label} trong tháng (${limit}/${limit} tin). Vui lòng mua thêm hoặc liên hệ admin để nâng gói.`,
    });
  });

  it('hết hạn mức nhưng ví telegram_messages đủ → cho phép, giữ chỗ ví đúng món/đúng số', async () => {
    repo.countAdapterSentInCycleWithLedger.mockResolvedValue(100);
    repo.getWalletAvailableBalance.mockResolvedValue({ available: 3 });
    const result = await run('telegram', { quantity: 2 });
    expect(result).toMatchObject({ allowed: true, walletItemKey: 'telegram_messages', walletQuantity: 2 });
    expect(repo.getWalletAvailableBalance).toHaveBeenCalledWith({}, 10, 'telegram_messages');
  });

  it('whatsapp dùng ví whatsapp_messages (không phải zalo_messages)', async () => {
    repo.countAdapterSentInCycleWithLedger.mockResolvedValue(200);
    repo.getWalletAvailableBalance.mockResolvedValue({ available: 1 });
    const result = await run('whatsapp');
    expect(result.walletItemKey).toBe('whatsapp_messages');
  });

  it('cột NULL = không giới hạn (không đếm); cột 0 = disabled', async () => {
    repo.getWorkspacePlanLimits.mockResolvedValue(plan({ monthly_telegram_limit: null, monthly_whatsapp_limit: 0 }));
    expect((await run('telegram')).allowed).toBe(true);
    expect(repo.countAdapterSentInCycleWithLedger).not.toHaveBeenCalled();
    await expect(run('whatsapp')).rejects.toMatchObject({ limitType: 'disabled', limit: 0 });
  });

  it('không áp trần NGÀY của Zalo và trần nhân viên của Zalo cho kênh adapter', async () => {
    repo.getWorkspacePlanLimits.mockResolvedValue(plan({ daily_zalo_limit: 0 }));
    repo.getEmployeeSendLimits.mockResolvedValue({
      status: 'active', daily_zalo_limit: 0, monthly_zalo_limit: 0, daily_email_limit: null, monthly_email_limit: null,
    });
    const result = await run('telegram', { userId: 20, actorUserId: 20, ownerContextId: 10 });
    expect(result.allowed).toBe(true);
    expect(repo.countEmployeeSentTodayWithLedger).not.toHaveBeenCalled();
  });

  it('Zalo vẫn dùng cột + bộ đếm Zalo (không đổi hành vi)', async () => {
    repo.countZaloSentInCycleWithLedger.mockResolvedValue(5);
    await expect(run('zalo')).rejects.toMatchObject({ limitType: 'monthly', limit: 5 });
    expect(repo.countAdapterSentInCycleWithLedger).not.toHaveBeenCalled();
  });
});

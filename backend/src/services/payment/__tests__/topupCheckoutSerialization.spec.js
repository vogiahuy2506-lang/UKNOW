import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockDbQuery = jest.fn();
const mockGetClient = jest.fn();
const mockCreateOrder = jest.fn();
const mockCancelRecentPendingTopupOrders = jest.fn();
const mockCreatePayosPaymentLink = jest.fn();
const mockBestEffortCancelPayosLinks = jest.fn();
const mockLockUserForPlanActivation = jest.fn();

const client = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockDbQuery, getClient: mockGetClient },
}));

jest.unstable_mockModule('../../../utils/payos.util.js', () => ({
  default: { paymentRequests: { create: mockCreatePayosPaymentLink } },
}));

jest.unstable_mockModule('../../../utils/billingCycle.util.js', () => ({
  EFFECTIVE_PLAN_ID_SQL: 'u.active_plan_id',
  resolveBillingUserId: jest.fn().mockResolvedValue(10),
}));

jest.unstable_mockModule('../../../utils/subscriptionStatus.util.js', () => ({
  getSubscriptionStatus: jest.fn().mockResolvedValue({
    hasPlan: true,
    isExpired: false,
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  }),
}));

jest.unstable_mockModule('../../../utils/customPlanPricing.util.js', () => ({
  getConfigValue: jest.fn((_rows, _key, fallback) => fallback),
}));

jest.unstable_mockModule('../../../utils/topupPricing.util.js', () => ({
  validateTopupQuantities: jest.fn().mockReturnValue({
    ok: true,
    quantities: { email_messages: 1000 },
  }),
  computeTopupPrice: jest.fn().mockReturnValue({
    items: [{ itemKey: 'email_messages', quantity: 1000 }],
    total: 100000,
    meetsMinimum: true,
    shortfall: 0,
    minOrderAmount: 50000,
  }),
  checkTopupZaloCapacity: jest.fn().mockReturnValue({ ok: true, remaining: 100000 }),
  checkTopupStorageCapacity: jest.fn().mockReturnValue({ ok: true, remaining: 100 }),
  resolveMaxTopupMonths: jest.fn().mockReturnValue(12),
  filterAllowedTopupMonths: jest.fn().mockReturnValue([1, 3, 6, 12]),
  resolveTopupMonths: jest.fn().mockReturnValue({
    ok: true,
    months: 1,
    maxMonths: 12,
    allowedMonths: [1, 3, 6, 12],
  }),
  TOPUP_MIN_ORDER_AMOUNT: 50000,
  TOPUP_CONSUMABLE_KEYS: ['email_messages'],
}));

jest.unstable_mockModule('../../../repositories/payment/topup.repository.js', () => ({
  findAllTopupPricing: jest.fn().mockResolvedValue([{ item_key: 'email_messages', unit_price: 100 }]),
  sumActiveTopupGrants: jest.fn().mockResolvedValue(0),
  sumWalletGrants: jest.fn().mockResolvedValue(0),
  insertTopupGrants: jest.fn(),
}));

jest.unstable_mockModule('../../../repositories/payment/customPlan.repository.js', () => ({
  findAllPricingRows: jest.fn().mockResolvedValue([]),
}));

jest.unstable_mockModule('../../../repositories/payment/payment.repository.js', () => ({
  createOrder: mockCreateOrder,
  cancelRecentPendingTopupOrders: mockCancelRecentPendingTopupOrders,
}));

jest.unstable_mockModule('../../../repositories/voucher.repository.js', () => ({
  getPayosPendingWindowMinutes: jest.fn().mockReturnValue(15),
}));

jest.unstable_mockModule('../../../utils/payosLink.util.js', () => ({
  bestEffortCancelPayosLinks: mockBestEffortCancelPayosLinks,
}));

jest.unstable_mockModule('../../../utils/invoiceVat.util.js', () => ({
  resolveOrderAmountWithInvoice: jest.fn((_invoiceInfo, amount) => ({ amount, invoiceInfo: null })),
  normalizeBuyerInvoiceProfile: jest.fn(),
}));

jest.unstable_mockModule('../../../repositories/user/user.repository.js', () => ({
  lockUserForPlanActivation: mockLockUserForPlanActivation,
  saveInvoiceProfile: jest.fn(),
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
}));

const { createTopupPaymentLink } = await import('../topup.service.js');

describe('createTopupPaymentLink checkout serialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClient.mockResolvedValue(client);
    client.query.mockResolvedValue({ rows: [] });
    mockDbQuery.mockImplementation(async (sql) => ({
      rows: String(sql).includes('COUNT(*)')
        ? [{ total: 0 }]
        : [{ monthly_zalo_limit: 100000, max_zalo_accounts: 1 }],
    }));
    mockLockUserForPlanActivation.mockResolvedValue({ id: 10, email: 'user@example.com' });
    mockCreateOrder.mockResolvedValue({ id: 99, order_code: 1234 });
    mockCreatePayosPaymentLink.mockResolvedValue({ qrCode: 'qr', checkoutUrl: 'https://payos.test/topup' });
    mockCancelRecentPendingTopupOrders.mockResolvedValue([]);
    mockBestEffortCancelPayosLinks.mockResolvedValue(undefined);
  });

  it('creates the replacement link before cancelling only older top-up orders', async () => {
    mockCancelRecentPendingTopupOrders.mockResolvedValue([{ id: 80, order_code: 8000 }]);

    const result = await createTopupPaymentLink({
      userId: 10,
      userEmail: 'user@example.com',
      quantities: { email_messages: 1000 },
    });

    expect(result.checkoutUrl).toBe('https://payos.test/topup');
    expect(mockLockUserForPlanActivation.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateOrder.mock.invocationCallOrder[0]
    );
    expect(mockCreatePayosPaymentLink.mock.invocationCallOrder[0]).toBeLessThan(
      mockCancelRecentPendingTopupOrders.mock.invocationCallOrder[0]
    );
    expect(mockCancelRecentPendingTopupOrders).toHaveBeenCalledWith(expect.objectContaining({
      olderThanOrderId: 99,
      queryable: client,
    }));
    expect(mockBestEffortCancelPayosLinks).toHaveBeenCalledWith([8000]);
  });

  it('does not cancel the old top-up order when PayOS replacement creation fails', async () => {
    mockCreatePayosPaymentLink.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(createTopupPaymentLink({
      userId: 10,
      userEmail: 'user@example.com',
      quantities: { email_messages: 1000 },
    })).rejects.toThrow('provider unavailable');

    expect(mockCancelRecentPendingTopupOrders).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindPlanByCode = jest.fn();
const mockFindUserById = jest.fn();
const mockLockUserForPlanActivation = jest.fn();
const mockGetPlanByUserId = jest.fn();
const mockFindActiveBillingPeriod = jest.fn();
const mockHasSuccessfulOrderForPlanByUser = jest.fn();
const mockCreateOrder = jest.fn();
const mockActivateUserPlan = jest.fn();
const mockReconcileResourceLocks = jest.fn();
const mockCancelRecentPendingPlanOrders = jest.fn();
const mockFindRecentPendingPlanOrders = jest.fn();
const mockResolveCheckoutDiscount = jest.fn();
const mockCreatePayosPaymentLink = jest.fn();
const mockBestEffortCancelPayosLinks = jest.fn();
const mockResolveOrderAmountWithInvoice = jest.fn();
const mockResolvePlanChange = jest.fn();
const mockFindOrderByCode = jest.fn();
const mockClaimOrderSuccess = jest.fn();
const mockVerifyPayosWebhook = jest.fn();
const mockFulfillPaidOrder = jest.fn();

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
const mockDb = {
  getClient: jest.fn(),
  query: jest.fn(),
};

jest.unstable_mockModule('../../../config/database.js', () => ({ default: mockDb }));
jest.unstable_mockModule('../../../repositories/payment/plan.repository.js', () => ({
  findPlanByCode: mockFindPlanByCode,
  getPlanByUserId: mockGetPlanByUserId,
}));
jest.unstable_mockModule('../../../repositories/payment/payment.repository.js', () => ({
  createOrder: mockCreateOrder,
  findOrderStatusByCode: jest.fn(),
  findOrderByCode: mockFindOrderByCode,
  claimOrderSuccess: mockClaimOrderSuccess,
  markOrderFailedForReview: jest.fn(),
  activateUserPlan: mockActivateUserPlan,
  hasSuccessfulOrderForPlanByUser: mockHasSuccessfulOrderForPlanByUser,
  deleteOrderByCode: jest.fn(),
  cancelRecentPendingPlanOrders: mockCancelRecentPendingPlanOrders,
  findRecentPendingPlanOrders: mockFindRecentPendingPlanOrders,
}));
jest.unstable_mockModule('../../../repositories/voucher.repository.js', () => ({
  redeemVoucherForOrder: jest.fn(),
  getPayosPendingWindowMinutes: () => 15,
}));
jest.unstable_mockModule('../../../repositories/admin/adminPlans.repository.js', () => ({ createPlan: jest.fn() }));
jest.unstable_mockModule('../../../repositories/payment/customPlan.repository.js', () => ({
  findCustomPlanOwnedByUser: jest.fn(),
  updateCustomPlanLimits: jest.fn(),
}));
jest.unstable_mockModule('../../../repositories/user/user.repository.js', () => ({
  findUserById: mockFindUserById,
  lockUserForPlanActivation: mockLockUserForPlanActivation,
  findActiveBillingPeriod: mockFindActiveBillingPeriod,
  findActiveUserByEmail: jest.fn(),
  saveInvoiceProfile: jest.fn(),
}));
jest.unstable_mockModule('../../voucher.service.js', () => ({ resolveCheckoutDiscount: mockResolveCheckoutDiscount }));
jest.unstable_mockModule('../../../utils/voucherOffer.util.js', () => ({ toValidatedCodeDto: jest.fn() }));
jest.unstable_mockModule('../../../utils/payos.util.js', () => ({
  default: {
    paymentRequests: { create: mockCreatePayosPaymentLink },
    webhooks: { verify: mockVerifyPayosWebhook },
  },
}));
jest.unstable_mockModule('../payosOrderFulfillment.service.js', () => ({ fulfillPaidOrder: mockFulfillPaidOrder }));
jest.unstable_mockModule('../payosReconcile.service.js', () => ({ tryFulfillPendingOrderOnStatusCheck: jest.fn() }));
jest.unstable_mockModule('../../../utils/payosLink.util.js', () => ({ bestEffortCancelPayosLinks: mockBestEffortCancelPayosLinks }));
jest.unstable_mockModule('../../../utils/invoiceVat.util.js', () => ({
  resolveOrderAmountWithInvoice: mockResolveOrderAmountWithInvoice,
  normalizeBuyerInvoiceProfile: jest.fn(),
}));
jest.unstable_mockModule('../matbaoInvoice.service.js', () => ({ scheduleDispatchEinvoiceAfterCommit: jest.fn() }));
jest.unstable_mockModule('../../../utils/planChange.util.js', () => ({ resolvePlanChange: mockResolvePlanChange }));
jest.unstable_mockModule('../../../utils/customPlanPricing.util.js', () => ({ CUSTOM_PLAN_VOUCHER_CODE: 'custom' }));
jest.unstable_mockModule('../customPlan.service.js', () => ({ resolveCustomPlanQuote: jest.fn() }));
jest.unstable_mockModule('../../../repositories/payment/scheduledPlanChange.repository.js', () => ({
  scheduledPlanChangeRepository: { findPendingByUserId: jest.fn() },
}));
jest.unstable_mockModule('../topupLock.service.js', () => ({
  reconcileResourceLocks: mockReconcileResourceLocks,
}));

const { activateFreePlan, createPaymentLink, handleWebhook } = await import('../payment.service.js');

describe('activateFreePlan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue({ rows: [] });
    mockDb.getClient.mockResolvedValue(mockClient);
    mockFindPlanByCode.mockResolvedValue({ id: 7, code: 'trial', price: 0, price_yearly: 0 });
    mockLockUserForPlanActivation.mockResolvedValue({ id: 10, email: 'trial@example.com' });
    mockHasSuccessfulOrderForPlanByUser.mockResolvedValue(false);
    mockFindUserById.mockResolvedValue(null);
    mockCreateOrder.mockResolvedValue({ id: 99 });
    mockActivateUserPlan.mockResolvedValue({ active_plan_id: 7 });
    mockReconcileResourceLocks.mockResolvedValue({ locked: [], unlocked: [] });
    mockCancelRecentPendingPlanOrders.mockResolvedValue([]);
    mockFindRecentPendingPlanOrders.mockResolvedValue([]);
    mockResolveCheckoutDiscount.mockResolvedValue({
      voucher: null,
      discountAmount: 0,
      finalAmount: 100000,
      discount: null,
      snapshot: {},
    });
    mockCreatePayosPaymentLink.mockResolvedValue({
      qrCode: 'qr',
      checkoutUrl: 'https://payos.test/checkout',
    });
    mockBestEffortCancelPayosLinks.mockResolvedValue(undefined);
    mockResolveOrderAmountWithInvoice.mockImplementation((_invoiceInfo, amount) => ({ amount, invoiceInfo: null }));
    mockResolvePlanChange.mockReturnValue({ action: 'upgrade_now' });
    mockGetPlanByUserId.mockResolvedValue({ id: 3, code: 'starter', price: 50000 });
    mockFindActiveBillingPeriod.mockResolvedValue('monthly');
  });

  it('commits order and entitlement together when it owns the database client', async () => {
    await activateFreePlan({
      planCode: 'trial',
      userId: 10,
      userEmail: 'trial@example.com',
    });

    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockLockUserForPlanActivation).toHaveBeenCalledWith(10, mockClient);
    expect(mockCreateOrder).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }), mockClient);
    expect(mockActivateUserPlan).toHaveBeenCalledWith(10, 7, 'monthly', mockClient);
    expect(mockReconcileResourceLocks).toHaveBeenCalledWith(10, mockClient, { unlockOnly: true });
    expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back the success order when entitlement activation fails', async () => {
    mockActivateUserPlan.mockRejectedValueOnce(new Error('activation failed'));

    await expect(activateFreePlan({
      planCode: 'trial',
      userId: 10,
      userEmail: 'trial@example.com',
    })).rejects.toThrow('activation failed');

    expect(mockCreateOrder).toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('rejects an anonymous free activation before creating an order', async () => {
    await expect(activateFreePlan({
      planCode: 'trial',
      userId: null,
      userEmail: 'trial@example.com',
    })).rejects.toMatchObject({ status: 401 });

    expect(mockDb.getClient).not.toHaveBeenCalled();
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('rolls back without creating an order when the account cannot be locked', async () => {
    mockLockUserForPlanActivation.mockResolvedValueOnce(null);

    await expect(activateFreePlan({
      planCode: 'trial',
      userId: 10,
      userEmail: 'trial@example.com',
    })).rejects.toMatchObject({ status: 404 });

    expect(mockCreateOrder).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

describe('createPaymentLink checkout serialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue({ rows: [] });
    mockDb.getClient.mockResolvedValue(mockClient);
    mockLockUserForPlanActivation.mockResolvedValue({ id: 10, email: 'paid@example.com' });
    mockFindUserById.mockResolvedValue({
      id: 10,
      email: 'paid@example.com',
      subscription_expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    mockFindPlanByCode.mockResolvedValue({ id: 7, code: 'pro', price: 100000, price_yearly: 1000000 });
    mockGetPlanByUserId.mockResolvedValue({ id: 3, code: 'starter', price: 50000 });
    mockFindActiveBillingPeriod.mockResolvedValue('monthly');
    mockHasSuccessfulOrderForPlanByUser.mockResolvedValue(false);
    mockResolvePlanChange.mockReturnValue({ action: 'upgrade_now' });
    mockResolveCheckoutDiscount.mockResolvedValue({
      voucher: null,
      discountAmount: 0,
      finalAmount: 100000,
      discount: null,
      snapshot: {},
    });
    mockResolveOrderAmountWithInvoice.mockImplementation((_invoiceInfo, amount) => ({ amount, invoiceInfo: null }));
    mockCreateOrder.mockResolvedValue({ id: 99, order_code: 123, amount: 100000 });
    mockCreatePayosPaymentLink.mockResolvedValue({ qrCode: 'qr', checkoutUrl: 'https://payos.test/new' });
    mockCancelRecentPendingPlanOrders.mockResolvedValue([]);
    mockFindRecentPendingPlanOrders.mockResolvedValue([]);
    mockBestEffortCancelPayosLinks.mockResolvedValue(undefined);
  });

  it('locks the account before reading entitlement and creates the PayOS link before replacing older orders', async () => {
    mockFindRecentPendingPlanOrders.mockResolvedValue([{ id: 80, order_code: 8000 }]);
    mockCancelRecentPendingPlanOrders.mockResolvedValue([{ id: 80, order_code: 8000 }]);

    const result = await createPaymentLink({
      planCode: 'pro',
      userId: 10,
      userEmail: 'paid@example.com',
    });

    expect(result.checkoutUrl).toBe('https://payos.test/new');
    expect(mockLockUserForPlanActivation.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetPlanByUserId.mock.invocationCallOrder[0]
    );
    expect(mockCreatePayosPaymentLink.mock.invocationCallOrder[0]).toBeLessThan(
      mockCancelRecentPendingPlanOrders.mock.invocationCallOrder[0]
    );
    expect(mockCancelRecentPendingPlanOrders).toHaveBeenCalledWith(expect.objectContaining({
      olderThanOrderId: 99,
      queryable: mockClient,
    }));
    expect(mockResolveCheckoutDiscount).toHaveBeenCalledWith(expect.objectContaining({
      excludedPendingOrderIds: [80],
    }));
    const commitOrder = mockClient.query.mock.calls.findIndex(([sql]) => sql === 'COMMIT');
    expect(commitOrder).toBeGreaterThanOrEqual(0);
    expect(mockBestEffortCancelPayosLinks).toHaveBeenCalledWith([8000]);
    expect(mockBestEffortCancelPayosLinks.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockClient.query.mock.invocationCallOrder[commitOrder]
    );
  });

  it('keeps the older checkout intact when PayOS cannot create the replacement link', async () => {
    mockCreatePayosPaymentLink.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(createPaymentLink({
      planCode: 'pro',
      userId: 10,
      userEmail: 'paid@example.com',
    })).rejects.toMatchObject({ status: 502 });

    expect(mockCancelRecentPendingPlanOrders).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('cancels the newly-created PayOS link if committing its database order fails', async () => {
    mockClient.query.mockImplementation(async (sql) => {
      if (sql === 'COMMIT') throw new Error('commit failed');
      return { rows: [] };
    });

    await expect(createPaymentLink({
      planCode: 'pro',
      userId: 10,
      userEmail: 'paid@example.com',
    })).rejects.toThrow('commit failed');

    expect(mockCreatePayosPaymentLink).toHaveBeenCalled();
    expect(mockBestEffortCancelPayosLinks).toHaveBeenCalledWith([
      expect.any(Number),
    ]);
  });
});

describe('handleWebhook lock ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue({ rows: [] });
    mockDb.getClient.mockResolvedValue(mockClient);
    mockVerifyPayosWebhook.mockResolvedValue({ code: '00', orderCode: 1234, amount: 100000 });
    mockFindOrderByCode.mockResolvedValue({
      id: 80,
      order_code: 1234,
      status: 'pending',
      amount: 100000,
      user_id: 10,
      user_email: 'paid@example.com',
    });
    mockLockUserForPlanActivation.mockResolvedValue({ id: 10, email: 'paid@example.com' });
    mockClaimOrderSuccess.mockResolvedValue({
      id: 80,
      order_code: 1234,
      amount: 100000,
      user_id: 10,
      user_email: 'paid@example.com',
    });
    mockFulfillPaidOrder.mockResolvedValue(null);
  });

  it('locks the account before claiming the order to match checkout lock ordering', async () => {
    await handleWebhook({ signature: 'valid' });

    expect(mockLockUserForPlanActivation).toHaveBeenCalledWith(10, mockClient);
    expect(mockLockUserForPlanActivation.mock.invocationCallOrder[0]).toBeLessThan(
      mockClaimOrderSuccess.mock.invocationCallOrder[0]
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });
});

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockGetPlanByUserId = jest.fn();
const mockFindCustomPlanOwnedByUser = jest.fn();
const mockUpdateCustomPlanLimits = jest.fn();
const mockCreatePlan = jest.fn();
const mockCreateOrder = jest.fn();
const mockCancelRecentPendingPlanOrders = jest.fn().mockResolvedValue([]);
const mockResolveCheckoutDiscount = jest.fn();
const mockRedeemVoucherForOrder = jest.fn().mockResolvedValue(undefined);
const mockActivateUserPlan = jest.fn().mockResolvedValue(undefined);
const mockCreatePaymentLink = jest.fn().mockResolvedValue({ checkoutUrl: 'https://pay.payos.vn/test' });

const mockClient = {
  query: jest.fn().mockResolvedValue({ rows: [] }),
  release: jest.fn(),
};

const mockDb = {
  getClient: jest.fn().mockResolvedValue(mockClient),
  query: jest.fn().mockResolvedValue({ rows: [] }),
};

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: mockDb,
}));

jest.unstable_mockModule('../../../repositories/payment/payment.repository.js', () => ({
  getPlanByUserId: mockGetPlanByUserId,
  createOrder: mockCreateOrder,
  cancelRecentPendingPlanOrders: mockCancelRecentPendingPlanOrders,
  cancelRecentPendingTopupOrders: jest.fn().mockResolvedValue([]),
  cancelPendingOrderWithNote: jest.fn().mockResolvedValue(null),
  activateUserPlan: mockActivateUserPlan,
  claimOrderSuccess: jest.fn(),
  findOrderByCode: jest.fn(),
  findOrderStatusByCode: jest.fn(),
  markOrderFailedForReview: jest.fn(),
  deleteOrderByCode: jest.fn(),
  hasSuccessfulOrderForPlanByUser: jest.fn(),
  findUserIdByEmail: jest.fn(),
  updateOrderStatus: jest.fn(),
  findPendingPayosOrdersSinceHours: jest.fn().mockResolvedValue([]),
  findStalePendingPayosOrders: jest.fn().mockResolvedValue([]),
}));

jest.unstable_mockModule('../../../repositories/voucher.repository.js', () => ({
  redeemVoucherForOrder: mockRedeemVoucherForOrder,
  getPayosPendingWindowMinutes: () => 15,
}));

jest.unstable_mockModule('../../../repositories/payment/customPlan.repository.js', () => ({
  findCustomPlanOwnedByUser: mockFindCustomPlanOwnedByUser,
  updateCustomPlanLimits: mockUpdateCustomPlanLimits,
  findAllPricingRows: jest.fn().mockResolvedValue([]),
  findAllPricingConfig: jest.fn().mockResolvedValue([]),
  findPricingRowByKey: jest.fn().mockResolvedValue(null),
  updatePricingRow: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../../repositories/payment/plan.repository.js', () => ({
  createPlan: mockCreatePlan,
  findPlanById: jest.fn().mockResolvedValue(null),
  findPlanByCode: jest.fn().mockResolvedValue(null),
  findAllPlans: jest.fn().mockResolvedValue([]),
  getUserFeatures: jest.fn().mockResolvedValue([]),
  getPlanByUserId: mockGetPlanByUserId,
}));

jest.unstable_mockModule('../../voucher.service.js', () => ({
  resolveCheckoutDiscount: mockResolveCheckoutDiscount,
}));

jest.unstable_mockModule('../../../utils/payos.util.js', () => ({
  default: {
    paymentRequests: {
      create: mockCreatePaymentLink,
    },
  },
  getPayosPendingWindowMinutes: () => 15,
  bestEffortCancelPayosLinks: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../customPlan.service.js', () => ({
  resolveCustomPlanQuote: jest.fn().mockImplementation(async ({ quantities, billingPeriod }) => ({
    quantities,
    billingPeriod,
    monthlyTotal: (quantities.emails || 1000) * 100,
    yearlyTotal: (quantities.emails || 1000) * 1000,
    total: (quantities.emails || 1000) * 100,
    planColumns: {
      monthlyEmailLimit: quantities.emails || 1000,
    },
  })),
}));

const { createCustomPaymentLink } = await import('../payment.service.js');

describe('PR-1 Custom Plan Payment Loophole, Renewal & Downgrade Check', () => {
  beforeEach(() => {
    mockGetPlanByUserId.mockReset();
    mockFindCustomPlanOwnedByUser.mockReset();
    mockUpdateCustomPlanLimits.mockReset();
    mockCreatePlan.mockReset();
    mockCreateOrder.mockReset();
    mockCancelRecentPendingPlanOrders.mockReset().mockResolvedValue([]);
    mockResolveCheckoutDiscount.mockReset();
    mockRedeemVoucherForOrder.mockReset().mockResolvedValue(undefined);
    mockActivateUserPlan.mockReset().mockResolvedValue(undefined);
    mockCreatePaymentLink.mockReset().mockResolvedValue({ checkoutUrl: 'https://pay.payos.vn/test' });
  });

  it('chặn hạ gói ngay khi cùng reusePlanId nhưng cấu hình thay đổi và giá mới thấp hơn giá gói hiện tại', async () => {
    // Current plan: 500,000 monthly
    mockGetPlanByUserId.mockResolvedValueOnce({
      id: 99,
      price: 500000,
    });

    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn của test@example.com',
      price: 500000,
      custom_config: { quantities: { emails: 5000 } }, // Cấu hình cũ: 5000 emails
    });

    // Cấu hình mới giảm xuống 1000 emails = 100,000 monthly
    await expect(
      createCustomPaymentLink({
        quantities: { emails: 1000 },
        billingPeriod: 'monthly',
        userId: 1,
        userEmail: 'test@example.com',
        reusePlanId: 99,
      })
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Không thể hạ gói ngay'),
    });

    expect(mockUpdateCustomPlanLimits).not.toHaveBeenCalled();
  });

  it('cho phép gia hạn (renewal) đúng cấu hình cũ ngay cả khi giá mới thấp hơn do admin giảm giá đơn vị', async () => {
    // Current plan in DB has old frozen price: 500,000 monthly
    mockGetPlanByUserId.mockResolvedValueOnce({
      id: 99,
      price: 500000,
    });

    // Same configuration (1000 emails)
    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn của test@example.com',
      price: 500000,
      custom_config: { quantities: { emails: 1000 } },
    });

    mockResolveCheckoutDiscount.mockResolvedValueOnce({
      voucher: null,
      discountAmount: 0,
      finalAmount: 100000,
      discount: null,
      snapshot: {},
    });

    mockCreateOrder.mockResolvedValueOnce({
      id: 1,
      order_code: 123457,
      amount: 100000,
    });

    // Customer re-orders the SAME 1000 emails (quote = 100,000 < currentPlan.price 500,000)
    const result = await createCustomPaymentLink({
      quantities: { emails: 1000 },
      billingPeriod: 'monthly',
      userId: 1,
      userEmail: 'test@example.com',
      reusePlanId: 99,
    });

    expect(result).toHaveProperty('checkoutUrl');
    expect(mockUpdateCustomPlanLimits).not.toHaveBeenCalled();
  });

  it('chặn hạ gói khi reusePlanId là gói custom cũ cấu hình không đổi nhưng gói đang dùng là gói khác đắt hơn', async () => {
    // Current active plan is Professional: id 7, 799,000 monthly
    mockGetPlanByUserId.mockResolvedValueOnce({
      id: 7,
      price: 799000,
    });

    // Old custom plan owned by user: id 99, 1000 emails, quote = 100,000 monthly
    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn cũ của test@example.com',
      price: 100000,
      custom_config: { quantities: { emails: 1000 } },
    });

    // User attempts to reuse plan 99 with the same 1000 emails (isRenewalOfActivePlan must be false because currentPlan.id (7) !== plan.id (99))
    await expect(
      createCustomPaymentLink({
        quantities: { emails: 1000 },
        billingPeriod: 'monthly',
        userId: 1,
        userEmail: 'test@example.com',
        reusePlanId: 99,
      })
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Không thể hạ gói ngay'),
    });

    expect(mockUpdateCustomPlanLimits).not.toHaveBeenCalled();
  });

  it('cho phép nâng gói cùng reusePlanId và KHÔNG cập nhật limits vào DB khi tạo link', async () => {
    // Current plan: 50,000 monthly
    mockGetPlanByUserId.mockResolvedValueOnce({
      id: 99,
      price: 50000,
    });

    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn của test@example.com',
      price: 50000,
      custom_config: { quantities: { emails: 500 } },
    });

    mockResolveCheckoutDiscount.mockResolvedValueOnce({
      voucher: null,
      discountAmount: 0,
      finalAmount: 200000,
      discount: null,
      snapshot: {},
    });

    mockCreateOrder.mockResolvedValueOnce({
      id: 1,
      order_code: 123456,
      amount: 200000,
    });

    const result = await createCustomPaymentLink({
      quantities: { emails: 2000 }, // quote total = 200,000 monthly
      billingPeriod: 'monthly',
      userId: 1,
      userEmail: 'test@example.com',
      reusePlanId: 99,
    });

    // QUAN TRỌNG: Không được gọi updateCustomPlanLimits khi tạo link
    expect(mockUpdateCustomPlanLimits).not.toHaveBeenCalled();

    // customPlanConfig phải được gửi vào createOrder để lưu vào orders.custom_plan_config
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 99,
        amount: 200000,
        customPlanConfig: expect.objectContaining({
          name: 'Gói tự chọn của test@example.com',
          price: 200000,
          monthlyEmailLimit: 2000,
        }),
      }),
      mockClient
    );

    expect(result).toHaveProperty('checkoutUrl');
  });

  it('nhánh đơn 0đ (voucher 100%) cập nhật limits và kích hoạt plan ngay khi tạo đơn', async () => {
    mockGetPlanByUserId.mockResolvedValueOnce({
      id: 99,
      price: 50000,
    });

    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn của test@example.com',
      price: 50000,
      custom_config: { quantities: { emails: 500 } },
    });

    // Voucher giảm 100% -> finalAmount = 0
    mockResolveCheckoutDiscount.mockResolvedValueOnce({
      voucher: { id: 1, code: 'FREE100' },
      discountAmount: 200000,
      finalAmount: 0,
      discount: { type: 'percent', value: 100 },
      snapshot: {},
    });

    mockCreateOrder.mockResolvedValueOnce({
      id: 2,
      order_code: 999000,
      amount: 0,
    });

    const result = await createCustomPaymentLink({
      quantities: { emails: 2000 },
      billingPeriod: 'monthly',
      userId: 1,
      userEmail: 'test@example.com',
      reusePlanId: 99,
    });

    expect(result).toEqual(
      expect.objectContaining({
        noPayment: true,
        amount: 0,
        orderCode: expect.any(Number),
      })
    );

    // Khi 0đ, phải cập nhật limits và kích hoạt plan ngay
    expect(mockUpdateCustomPlanLimits).toHaveBeenCalledWith(
      99,
      expect.objectContaining({
        monthlyEmailLimit: 2000,
      }),
      mockClient
    );
    expect(mockRedeemVoucherForOrder).toHaveBeenCalledTimes(1);
    expect(mockActivateUserPlan).toHaveBeenCalledWith(1, 99, 'monthly', mockClient);
    expect(mockUpdateCustomPlanLimits.mock.invocationCallOrder[0]).toBeLessThan(
      mockActivateUserPlan.mock.invocationCallOrder[0]
    );
  });
});

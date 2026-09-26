import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockGetPlanByUserId = jest.fn();
const mockFindCustomPlanOwnedByUser = jest.fn();
const mockUpdateCustomPlanLimits = jest.fn();
const mockCreatePlan = jest.fn();
const mockCreateOrder = jest.fn();
const mockCancelRecentPendingPlanOrders = jest.fn().mockResolvedValue([]);
const mockFindRecentPendingPlanOrders = jest.fn().mockResolvedValue([]);
const mockResolveCheckoutDiscount = jest.fn();
const mockRedeemVoucherForOrder = jest.fn().mockResolvedValue(undefined);
const mockActivateUserPlan = jest.fn().mockResolvedValue(undefined);
const mockCreatePaymentLink = jest.fn().mockResolvedValue({ checkoutUrl: 'https://pay.payos.vn/test' });
const mockLockUserForPlanActivation = jest.fn();
const mockBestEffortCancelPayosLinks = jest.fn();
const mockHasSuccessfulOrderForPlanByUser = jest.fn();

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
  findRecentPendingPlanOrders: mockFindRecentPendingPlanOrders,
  cancelRecentPendingTopupOrders: jest.fn().mockResolvedValue([]),
  cancelPendingOrderWithNote: jest.fn().mockResolvedValue(null),
  activateUserPlan: mockActivateUserPlan,
  claimOrderSuccess: jest.fn(),
  findOrderByCode: jest.fn(),
  findOrderStatusByCode: jest.fn(),
  markOrderFailedForReview: jest.fn(),
  deleteOrderByCode: jest.fn(),
  hasSuccessfulOrderForPlanByUser: mockHasSuccessfulOrderForPlanByUser,
  findUserIdByEmail: jest.fn(),
  lockUserForPaidPlanFulfillment: jest.fn(),
  findNewerSuccessfulPlanEntitlement: jest.fn(),
  findNewerSuccessfulPlanCheckout: jest.fn(),
  updateOrderStatus: jest.fn(),
  findPendingPayosOrdersSinceHours: jest.fn().mockResolvedValue([]),
  findStalePendingPayosOrders: jest.fn().mockResolvedValue([]),
}));

jest.unstable_mockModule('../../../repositories/user/user.repository.js', () => ({
  findUserById: jest.fn().mockResolvedValue({
    id: 1,
    email: 'test@example.com',
    subscription_expires_at: new Date(Date.now() + 15 * 86400000).toISOString(),
  }),
  findActiveUserByEmail: jest.fn().mockResolvedValue({
    id: 1,
    email: 'test@example.com',
    subscription_expires_at: new Date(Date.now() + 15 * 86400000).toISOString(),
  }),
  findActiveBillingPeriod: jest.fn().mockResolvedValue('monthly'),
  lockUserForPlanActivation: mockLockUserForPlanActivation,
  saveInvoiceProfile: jest.fn().mockResolvedValue(undefined),
}));

const mockFindPendingByUserId = jest.fn();
const mockSupersedePendingByUserId = jest.fn();
const mockScheduledPlanChangeCreate = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/scheduledPlanChange.repository.js', () => ({
  scheduledPlanChangeRepository: {
    findPendingByUserId: mockFindPendingByUserId,
    supersedePendingByUserId: mockSupersedePendingByUserId,
    create: mockScheduledPlanChangeCreate,
  },
  findPendingByUserId: mockFindPendingByUserId,
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

jest.unstable_mockModule('../../../utils/payosLink.util.js', () => ({
  bestEffortCancelPayosLinks: mockBestEffortCancelPayosLinks,
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
    mockFindRecentPendingPlanOrders.mockReset().mockResolvedValue([]);
    mockResolveCheckoutDiscount.mockReset();
    mockRedeemVoucherForOrder.mockReset().mockResolvedValue(undefined);
    mockActivateUserPlan.mockReset().mockResolvedValue(undefined);
    mockCreatePaymentLink.mockReset().mockResolvedValue({ checkoutUrl: 'https://pay.payos.vn/test' });
    mockLockUserForPlanActivation.mockReset().mockResolvedValue({ id: 1, email: 'test@example.com' });
    mockBestEffortCancelPayosLinks.mockReset().mockResolvedValue(undefined);
    // PR-3 (đợt rà soát 26/09), Việc 2.3 — mặc định TRUE (gói đang tái dùng đã từng trả tiền),
    // đúng với mọi ca CŨ trong file này (đều là nâng/hạ gói ĐANG DÙNG THẬT). Ca riêng cho gói
    // "mồ côi" (chưa từng trả) đặt lại thành false.
    mockHasSuccessfulOrderForPlanByUser.mockReset().mockResolvedValue(true);
    mockFindPendingByUserId.mockReset().mockResolvedValue(null);
    mockSupersedePendingByUserId.mockReset().mockResolvedValue([]);
    mockScheduledPlanChangeCreate.mockReset().mockResolvedValue({ id: 1 });
  });

  it('chặn khi cùng reusePlanId và cùng kỳ hạn thanh toán (SAME_PLAN)', async () => {
    // Current plan: 500,000 monthly
    mockGetPlanByUserId.mockResolvedValue({
      id: 99,
      price: 500000,
    });

    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn của test@example.com',
      price: 500000,
      custom_config: { quantities: { emails: 5000 } }, // Cấu hình cũ: 5000 emails
    });

    await expect(
      createCustomPaymentLink({
        quantities: { emails: 5000 },
        billingPeriod: 'monthly',
        userId: 1,
        userEmail: 'test@example.com',
        reusePlanId: 99,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'SAME_PLAN',
      message: expect.stringContaining('Bạn đang sử dụng gói này với cùng kỳ hạn thanh toán'),
    });

    expect(mockUpdateCustomPlanLimits).not.toHaveBeenCalled();
  });

  it('cho phép gia hạn (renewal) đúng cấu hình cũ ngay cả khi giá mới thấp hơn do admin giảm giá đơn vị', async () => {
    // Current plan in DB has old frozen price: 500,000 monthly
    mockGetPlanByUserId.mockResolvedValue({
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
    // Note: When plan id is the same, PR-2 blocks if SAME_PLAN, but if yearly->yearly or different, it allows renewal
    // If expired, isCurrentlyActive is false -> allows upgrade_now
  });

  it('cho phép đặt lịch hẹn đổi gói (schedule) khi đổi từ gói đắt hơn sang gói custom rẻ hơn', async () => {
    // Current active plan is Professional: id 7, 799,000 monthly
    mockGetPlanByUserId.mockResolvedValue({
      id: 7,
      price: 799000,
    });

    // Custom plan owned by user: id 99, 1000 emails, quote = 100,000 monthly
    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn cũ của test@example.com',
      price: 100000,
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
      order_code: 123458,
      amount: 100000,
    });

    // User downgrades from plan 7 (799k) to custom plan 99 (100k) -> PR-2 allows scheduling
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

  it('cho phép nâng gói cùng reusePlanId và KHÔNG cập nhật limits vào DB khi tạo link', async () => {
    // Current plan: 50,000 monthly
    mockGetPlanByUserId.mockResolvedValue({
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

  it('giữ nguyên đơn custom cũ nếu PayOS không tạo được link thay thế', async () => {
    mockGetPlanByUserId.mockResolvedValue({ id: 99, price: 50000 });
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
    mockCreateOrder.mockResolvedValueOnce({ id: 101, order_code: 123456, amount: 200000 });
    mockCreatePaymentLink.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(createCustomPaymentLink({
      quantities: { emails: 2000 },
      billingPeriod: 'monthly',
      userId: 1,
      userEmail: 'test@example.com',
      reusePlanId: 99,
    })).rejects.toMatchObject({ status: 503 });

    expect(mockCancelRecentPendingPlanOrders).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('nhánh đơn 0đ (voucher 100%) cập nhật limits và kích hoạt plan ngay khi tạo đơn', async () => {
    mockGetPlanByUserId.mockResolvedValue({
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

  it('khi đơn 0đ nhưng là hạ gói (schedule), KHÔNG được cập nhật limits ngay vào plan đang dùng', async () => {
    // Current plan has price: 500,000 monthly
    mockGetPlanByUserId.mockResolvedValue({
      id: 99,
      price: 500000,
    });

    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn của test@example.com',
      price: 500000,
      custom_config: { quantities: { emails: 5000 } },
    });

    // Lower quantities: 1000 emails (quote = 100,000 < 500,000 -> action: schedule)
    // Voucher 100% -> finalAmount = 0
    mockResolveCheckoutDiscount.mockResolvedValueOnce({
      voucher: { id: 1, code: 'FREE100' },
      discountAmount: 100000,
      finalAmount: 0,
      discount: { type: 'percent', value: 100 },
      snapshot: {},
    });

    mockCreateOrder.mockResolvedValueOnce({
      id: 3,
      order_code: 999001,
      amount: 0,
    });

    const result = await createCustomPaymentLink({
      quantities: { emails: 1000 },
      billingPeriod: 'monthly',
      userId: 1,
      userEmail: 'test@example.com',
      reusePlanId: 99,
    });

    expect(result).toEqual(
      expect.objectContaining({
        noPayment: true,
        amount: 0,
      })
    );

    // Không được sửa trần gói live của khách
    expect(mockUpdateCustomPlanLimits).not.toHaveBeenCalled();
    // Không được kích hoạt gói ngay
    expect(mockActivateUserPlan).not.toHaveBeenCalled();
  });

  // PR-3 (đợt rà soát 26/09), Việc 2.2 — đã có một lệnh hẹn hạ gói Tùy chọn đang chờ (đã trả
  // 100.000đ cho gói 100.000đ/tháng), khách đổi ý chọn cấu hình LỚN HƠN nữa (300.000đ/tháng) TRƯỚC
  // khi lệnh hẹn cũ kích hoạt. Phải thu đúng PHẦN CHÊNH (300.000 - 100.000 = 200.000), không phải
  // thu lại nguyên 300.000 (đã thu 100.000 ở lệnh hẹn trước, thu tiếp 300.000 nữa là thu 2 lần).
  it('Việc 2.2 — đang hẹn gói Tùy chọn đã trả 100k, đổi lên cấu hình 300k/tháng: chỉ thu phần chênh 200k', async () => {
    mockGetPlanByUserId.mockResolvedValue({ id: 7, price: 799000 }); // đang có gói Professional 799k
    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn của test@example.com',
      price: 100000,
      custom_config: { quantities: { emails: 1000 } },
    });
    mockFindPendingByUserId.mockResolvedValue({
      id: 5,
      status: 'pending',
      amount_paid: 100000,
      plan_price: 100000,
      plan_price_yearly: null,
      billing_period: 'monthly',
      activate_after: new Date(Date.now() + 10 * 86400000),
    });
    mockResolveCheckoutDiscount.mockImplementationOnce(async ({ originalAmount }) => ({
      voucher: null,
      discountAmount: 0,
      finalAmount: originalAmount,
      discount: null,
      snapshot: {},
    }));
    mockCreateOrder.mockResolvedValueOnce({ id: 10, order_code: 700001, amount: 200000 });

    const result = await createCustomPaymentLink({
      quantities: { emails: 3000 }, // quote.monthlyTotal = 300.000 (theo mock resolveCustomPlanQuote)
      billingPeriod: 'monthly',
      userId: 1,
      userEmail: 'test@example.com',
      reusePlanId: 99,
    });

    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ originalAmount: 200000, amount: 200000 }),
      mockClient
    );
    expect(result).toHaveProperty('checkoutUrl');
  });

  // PR-3 (đợt rà soát 26/09), Việc 2.3 — reusePlanId trỏ tới một gói Tùy chọn CHƯA TỪNG được thanh
  // toán thành công (đơn nháp bị bỏ dở) đang được dùng làm ĐÍCH của một lệnh hẹn đổi-theo-lịch mới.
  it('Việc 2.3 — chặn lên lịch (schedule) đổi sang gói Tùy chọn CHƯA TỪNG trả tiền thành công', async () => {
    mockGetPlanByUserId.mockResolvedValue({ id: 7, price: 799000 }); // đang có gói Professional 799k -> hạ xuống custom là "schedule"
    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn mồ côi của test@example.com',
      price: 100000,
      custom_config: { quantities: { emails: 1000 } },
    });
    mockHasSuccessfulOrderForPlanByUser.mockResolvedValueOnce(false); // chưa từng có đơn success cho plan 99

    await expect(
      createCustomPaymentLink({
        quantities: { emails: 1000 },
        billingPeriod: 'monthly',
        userId: 1,
        userEmail: 'test@example.com',
        reusePlanId: 99,
      })
    ).rejects.toMatchObject({
      status: 403,
      code: 'CUSTOM_PLAN_NOT_PAID',
    });

    expect(mockHasSuccessfulOrderForPlanByUser).toHaveBeenCalledWith({
      planId: 99,
      userId: 1,
      userEmail: 'test@example.com',
      queryable: mockClient,
    });
    expect(mockCreateOrder).not.toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('Việc 2.3 — chặn cả nâng lệnh hẹn (upgrade_pending) sang gói Tùy chọn CHƯA TỪNG trả tiền', async () => {
    // Review PR-2: đột biến "chỉ chặn schedule" từng lọt vì chưa có ca upgrade_pending.
    mockGetPlanByUserId.mockResolvedValue({ id: 7, price: 799000 });
    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn mồ côi của test@example.com',
      price: 100000,
      custom_config: { quantities: { emails: 1000 } },
    });
    mockFindPendingByUserId.mockResolvedValue({
      id: 5,
      status: 'pending',
      amount_paid: 100000,
      plan_price: 100000,
      plan_price_yearly: null,
      billing_period: 'monthly',
      activate_after: new Date(Date.now() + 10 * 86400000),
    });
    mockHasSuccessfulOrderForPlanByUser.mockResolvedValueOnce(false);

    await expect(
      createCustomPaymentLink({
        quantities: { emails: 3000 }, // 300.000 > gói đang hẹn 100.000 -> upgrade_pending
        billingPeriod: 'monthly',
        userId: 1,
        userEmail: 'test@example.com',
        reusePlanId: 99,
      })
    ).rejects.toMatchObject({ status: 403, code: 'CUSTOM_PLAN_NOT_PAID' });

    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('Việc 2.3 — KHÔNG chặn đường trả-thẳng (upgrade_now) dù gói Tùy chọn tái dùng chưa từng trả tiền', async () => {
    // upgrade_now (nâng gói ngay) luôn ghi đè cấu hình MỚI qua updateCustomPlanLimits trước khi
    // activateUserPlan, không phụ thuộc giá trị cũ trên hàng plans — nên không cần chặn theo lịch sử
    // thanh toán như đường "schedule"/"upgrade_pending".
    mockGetPlanByUserId.mockResolvedValue({ id: 1, price: 10000 }); // gói hiện tại RẺ hơn -> upgrade_now
    mockFindCustomPlanOwnedByUser.mockResolvedValueOnce({
      id: 99,
      name: 'Gói tự chọn mồ côi của test@example.com',
      price: 50000,
      custom_config: { quantities: { emails: 500 } },
    });
    mockHasSuccessfulOrderForPlanByUser.mockResolvedValueOnce(false);
    mockResolveCheckoutDiscount.mockResolvedValueOnce({
      voucher: null,
      discountAmount: 0,
      finalAmount: 100000,
      discount: null,
      snapshot: {},
    });
    mockCreateOrder.mockResolvedValueOnce({ id: 11, order_code: 700002, amount: 100000 });

    const result = await createCustomPaymentLink({
      quantities: { emails: 1000 }, // quote 100.000 > gói hiện tại 10.000 -> upgrade_now
      billingPeriod: 'monthly',
      userId: 1,
      userEmail: 'test@example.com',
      reusePlanId: 99,
    });

    expect(result).toHaveProperty('checkoutUrl');
    expect(mockHasSuccessfulOrderForPlanByUser).not.toHaveBeenCalled();
  });
});

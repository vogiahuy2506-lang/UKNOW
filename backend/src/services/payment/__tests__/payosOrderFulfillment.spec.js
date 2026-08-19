import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockFulfillTopupOrder = jest.fn();
const mockActivateUserPlan = jest.fn();
const mockRedeemVoucher = jest.fn();
const mockFindUserIdByEmail = jest.fn();
const mockFindActiveUserByEmail = jest.fn();
const mockFindPlanById = jest.fn();
const mockSendSystemEmail = jest.fn().mockResolvedValue(undefined);
const mockReconcileResourceLocks = jest.fn().mockResolvedValue({ locked: [], unlocked: [] });

const mockUpdateCustomPlanLimits = jest.fn();

jest.unstable_mockModule('../../../repositories/payment/customPlan.repository.js', () => ({
  updateCustomPlanLimits: mockUpdateCustomPlanLimits,
}));

jest.unstable_mockModule('../topup.service.js', () => ({
  fulfillTopupOrder: mockFulfillTopupOrder,
}));

jest.unstable_mockModule('../../../repositories/payment/payment.repository.js', () => ({
  findUserIdByEmail: mockFindUserIdByEmail,
  activateUserPlan: mockActivateUserPlan,
}));

jest.unstable_mockModule('../../../repositories/voucher.repository.js', () => ({
  redeemVoucherForOrder: mockRedeemVoucher,
}));

jest.unstable_mockModule('../../../repositories/user/user.repository.js', () => ({
  findActiveUserByEmail: mockFindActiveUserByEmail,
}));

jest.unstable_mockModule('../../../repositories/payment/plan.repository.js', () => ({
  findPlanById: mockFindPlanById,
}));

jest.unstable_mockModule('../topupLock.service.js', () => ({
  reconcileResourceLocks: mockReconcileResourceLocks,
}));

jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
  buildPaymentSuccessEmail: (p) => ({ subject: 'ok', html: 'ok', ...p }),
}));

jest.unstable_mockModule('../matbaoInvoice.service.js', () => ({
  prepareEinvoiceForPaidOrder: jest.fn().mockResolvedValue(null),
}));

const { fulfillPaidOrder } = await import('../payosOrderFulfillment.service.js');

describe('fulfillPaidOrder', () => {
  const client = {};

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('top-up orders call fulfillTopupOrder and skip activateUserPlan', async () => {
    await fulfillPaidOrder({
      order_code: 1,
      note: 'topup',
      topup_config: { quantities: { zalo: 1 } },
      amount: 50000,
    }, client);

    expect(mockFulfillTopupOrder).toHaveBeenCalledTimes(1);
    expect(mockActivateUserPlan).not.toHaveBeenCalled();
    expect(mockRedeemVoucher).not.toHaveBeenCalled();
  });

  it('plan orders activate plan and redeem voucher', async () => {
    mockFindUserIdByEmail.mockResolvedValue(null);
    mockFindActiveUserByEmail.mockResolvedValue({ full_name: 'A' });
    mockFindPlanById.mockResolvedValue({ name: 'Starter', duration_days: 30 });

    await fulfillPaidOrder({
      order_code: 2,
      user_id: 9,
      plan_id: 3,
      user_email: 'a@test.com',
      billing_period: 'monthly',
      amount: 99000,
      payment_method: 'payos',
    }, client);

    expect(mockFulfillTopupOrder).not.toHaveBeenCalled();
    expect(mockActivateUserPlan).toHaveBeenCalledWith(9, 3, 'monthly', client);
    expect(mockRedeemVoucher).toHaveBeenCalledTimes(1);
    expect(mockSendSystemEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@test.com' }),
    );
  });

  it('gia hạn gói mở khoá tài nguyên bị khoá lúc gói hết hạn', async () => {
    mockFindUserIdByEmail.mockResolvedValue(null);
    mockFindActiveUserByEmail.mockResolvedValue({ full_name: 'A' });
    mockFindPlanById.mockResolvedValue({ name: 'Starter', duration_days: 30 });

    await fulfillPaidOrder({
      order_code: 3,
      user_id: 9,
      plan_id: 3,
      user_email: 'a@test.com',
      billing_period: 'monthly',
      amount: 99000,
      payment_method: 'payos',
    }, client);

    expect(mockReconcileResourceLocks).toHaveBeenCalledWith(9, client, { unlockOnly: true });
  });

  it('gói tự chọn có custom_plan_config được cập nhật limits trước khi kích hoạt', async () => {
    mockFindUserIdByEmail.mockResolvedValue(null);
    mockFindActiveUserByEmail.mockResolvedValue({ full_name: 'Custom User' });
    mockFindPlanById.mockResolvedValue({ name: 'Custom Plan', duration_days: 30 });

    const customConfig = {
      name: 'Custom Plan',
      price: 500000,
      priceYearly: 5000000,
      monthlyEmailLimit: 5000,
    };

    await fulfillPaidOrder({
      order_code: 4,
      user_id: 10,
      plan_id: 99,
      user_email: 'custom@test.com',
      billing_period: 'monthly',
      amount: 500000,
      payment_method: 'payos',
      custom_plan_config: customConfig,
    }, client);

    expect(mockUpdateCustomPlanLimits).toHaveBeenCalledWith(99, customConfig, client);
    expect(mockActivateUserPlan).toHaveBeenCalledWith(10, 99, 'monthly', client);
    expect(mockUpdateCustomPlanLimits.mock.invocationCallOrder[0]).toBeLessThan(
      mockActivateUserPlan.mock.invocationCallOrder[0]
    );
  });
});

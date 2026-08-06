import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockFulfillTopupOrder = jest.fn();
const mockActivateUserPlan = jest.fn();
const mockRedeemVoucher = jest.fn();
const mockFindUserIdByEmail = jest.fn();
const mockFindActiveUserByEmail = jest.fn();
const mockFindPlanById = jest.fn();
const mockSendSystemEmail = jest.fn().mockResolvedValue(undefined);

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

jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  sendSystemEmail: mockSendSystemEmail,
  buildPaymentSuccessEmail: (p) => p,
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
  });
});

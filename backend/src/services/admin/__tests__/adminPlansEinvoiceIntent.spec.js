import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PR-5 Việc 5.2 (PLAN_VA_LOI_LUONG_TIEN_2026-09-26) — đơn "tạo gói + link thanh toán" qua admin
// (createCustomPlanWithPayment) trước đây gọi createOrder() KHÔNG kèm invoiceInfo. Cổng ý định
// hasInvoiceIntent (matbaoInvoice.service.js) coi "không có invoice_info" = "không có ý định xuất
// hoá đơn" nên đơn này trả tiền xong KHÔNG BAO GIỜ có dòng einvoices, kể cả bản consumer.

const mockFindUserAdminByEmail = jest.fn();
const mockCreatePlan = jest.fn();
const mockDeletePlan = jest.fn().mockResolvedValue(null);
const mockCreateOrder = jest.fn();
const mockDeleteOrderByCode = jest.fn().mockResolvedValue(null);
const mockPaymentRequestsCreate = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn() },
}));

jest.unstable_mockModule('../../../repositories/admin/adminPlans.repository.js', () => ({
  findAllPlans: jest.fn(),
  findCustomPlans: jest.fn(),
  findPlanById: jest.fn(),
  findPlanByCode: jest.fn(),
  createPlan: mockCreatePlan,
  updatePlan: jest.fn(),
  deletePlan: mockDeletePlan,
  countOrdersForPlan: jest.fn(),
  softDeletePlan: jest.fn(),
  unassignPlanFromUsers: jest.fn(),
  findUserAdminByEmail: mockFindUserAdminByEmail,
  searchUserAdminsByEmail: jest.fn(),
  assignPlanToUser: jest.fn(),
  createAndAssignCustomPlan: jest.fn(),
  getPlanUserCounts: jest.fn(),
}));

jest.unstable_mockModule('../../../repositories/payment/payment.repository.js', () => ({
  createOrder: mockCreateOrder,
  deleteOrderByCode: mockDeleteOrderByCode,
}));

jest.unstable_mockModule('../../../repositories/user/user.repository.js', () => ({
  findUserById: jest.fn(),
}));

jest.unstable_mockModule('../../../repositories/subscription/subscription.repository.js', () => ({
  expireUserPlan: jest.fn(),
}));

jest.unstable_mockModule('../../../repositories/payment/scheduledPlanChange.repository.js', () => ({
  scheduledPlanChangeRepository: {},
}));

jest.unstable_mockModule('../../payment/topupLock.service.js', () => ({
  reconcileResourceLocks: jest.fn(),
}));

jest.unstable_mockModule('../../../utils/payos.util.js', () => ({
  default: {
    paymentRequests: { create: mockPaymentRequestsCreate },
  },
}));

const { createCustomPlanWithPayment } = await import('../adminPlans.service.js');

describe('adminPlans.service createCustomPlanWithPayment — ý định xuất hoá đơn (PR-5 Việc 5.2)', () => {
  let prevVat, prevClientId, prevApiKey, prevChecksum, prevFrontendUrl;

  beforeEach(() => {
    jest.clearAllMocks();
    prevVat = process.env.INVOICE_VAT_ENABLED;
    prevClientId = process.env.PAYOS_CLIENT_ID;
    prevApiKey = process.env.PAYOS_API_KEY;
    prevChecksum = process.env.PAYOS_CHECKSUM_KEY;
    prevFrontendUrl = process.env.FRONTEND_URL;
    process.env.INVOICE_VAT_ENABLED = 'true';
    process.env.PAYOS_CLIENT_ID = 'test-client-id';
    process.env.PAYOS_API_KEY = 'test-api-key';
    process.env.PAYOS_CHECKSUM_KEY = 'test-checksum';
    process.env.FRONTEND_URL = 'https://test.local';

    mockFindUserAdminByEmail.mockResolvedValue({
      id: 42, email: 'khach-admin@test.local', fullName: 'Khách Admin',
    });
    mockCreatePlan.mockResolvedValue({ id: 900, price: 299000, name: 'Gói riêng' });
    mockCreateOrder.mockResolvedValue({ id: 1, order_code: 123 });
    mockPaymentRequestsCreate.mockResolvedValue({
      checkoutUrl: 'https://payos.test/checkout', qrCode: 'qr-data',
    });
  });

  afterEach(() => {
    const restore = (key, prev) => {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    };
    restore('INVOICE_VAT_ENABLED', prevVat);
    restore('PAYOS_CLIENT_ID', prevClientId);
    restore('PAYOS_API_KEY', prevApiKey);
    restore('PAYOS_CHECKSUM_KEY', prevChecksum);
    restore('FRONTEND_URL', prevFrontendUrl);
  });

  it('createOrder nhận invoiceInfo mặc định wantInvoice:true, buyerType:consumer, deliverEmail:false', async () => {
    await createCustomPlanWithPayment('khach-admin@test.local', {
      name: 'Gói riêng', price: 299000, storageLimitBytes: 1073741824,
    });

    expect(mockCreateOrder).toHaveBeenCalledTimes(1);
    const call = mockCreateOrder.mock.calls[0][0];
    expect(call.amount).toBe(299000);
    expect(call.invoiceInfo).toEqual(
      expect.objectContaining({
        wantInvoice: true,
        deliverEmail: false,
        buyerType: 'consumer',
        taxType: 'KCT',
        net: 299000,
        vatAmount: 0,
        gross: 299000,
      }),
    );
  });

  it('tắt INVOICE_VAT_ENABLED thì invoiceInfo là null (đúng hành vi cổng chung, không ép xuất khi tắt tính năng)', async () => {
    process.env.INVOICE_VAT_ENABLED = 'false';

    await createCustomPlanWithPayment('khach-admin@test.local', {
      name: 'Gói riêng', price: 299000, storageLimitBytes: 1073741824,
    });

    const call = mockCreateOrder.mock.calls[0][0];
    expect(call.invoiceInfo).toBeNull();
  });
});

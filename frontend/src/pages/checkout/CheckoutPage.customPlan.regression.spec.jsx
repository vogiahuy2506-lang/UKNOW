import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import CheckoutPage from './CheckoutPage';

// File riêng cho đường custom-plan checkout (finding review: guard race chỉ được test qua
// đường standard plan — createCustomPayment() có endpoint/payload/no-payment branch riêng
// dùng chung submitInFlightRef/busy/applyVoucherCode với đường standard, nhưng chưa từng
// được đo trực tiếp).
const m = vi.hoisted(() => ({
  navigate: vi.fn(), validate: vi.fn(), createCustom: vi.fn(),
  user: { email: 'diagnostic@example.invalid' },
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>,
  useNavigate: () => m.navigate,
  useLocation: () => ({
    state: {
      isCustomPlan: true,
      quantities: { zalo_messages: 5000, zalo_accounts: 1 },
      quote: { total: 990000 },
      billingPeriod: 'monthly',
    },
  }),
  useSearchParams: () => [new URLSearchParams('orderCode=999')],
}));
vi.mock('../../stores/authStore', () => ({ useAuthStore: (s) => s({ user: m.user, isLoading: false, isAuthenticated: true }) }));
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: (k) => k }) }));
vi.mock('../../services/voucher.service', () => ({
  getAvailableVouchers: async () => ({ data: { data: { vouchers: [] } } }),
  getVoucherCodeSuggestions: async () => ({ data: { data: { vouchers: [] } } }),
  validateVoucher: m.validate,
}));
vi.mock('../../features/checkout/services/checkoutApi.service', () => ({
  default: {
    createPayment: vi.fn(),
    createCustomPayment: m.createCustom,
    activateFreePlan: vi.fn(),
    getPaymentStatus: vi.fn(),
    getInvoice: vi.fn(),
  },
}));
vi.mock('../../constants/invoiceVat', () => ({ isInvoiceVatUiEnabled: () => false }));
vi.mock('../../utils/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:fake' } }));

const voucher = { code: 'CUSTOM100', offerMode: 'public_code', discountAmount: 990000, finalAmount: 0 };
const acceptTerms = () => {
  const checkbox = document.querySelector('input[type="checkbox"]');
  if (checkbox && !checkbox.checked) fireEvent.click(checkbox);
};

describe('CheckoutPage (custom plan) — cùng guard race áp dụng cho createCustomPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.validate.mockResolvedValue({ data: { data: { voucher } } });
    m.createCustom.mockResolvedValue({
      data: {
        success: true,
        result: { noPayment: true, orderCode: 888, amount: 0, originalAmount: 990000, discountAmount: 990000, voucher, discount: { ...voucher, source: 'public_code' } },
      },
    });
  });
  afterEach(cleanup);

  it('bấm xác nhận 2 lần liên tiếp chỉ gọi createCustomPayment 1 lần (double-submit guard chung với standard)', async () => {
    let finishCreate;
    m.createCustom.mockReturnValue(new Promise((resolve) => { finishCreate = resolve; }));
    render(<CheckoutPage />);
    await screen.findByPlaceholderText('checkout.voucherPlaceholder');
    acceptTerms();
    const confirm = screen.getByRole('button', { name: /checkout.proceedToPayment/ });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(m.createCustom).toHaveBeenCalledTimes(1);
    await act(async () => finishCreate({
      data: { success: true, result: { orderCode: 888, amount: 990000, qrCode: 'fake' } },
    }));
  });

  it('nhập mã nhưng CHƯA Apply → CTA khoá, createCustomPayment không được gọi thiếu mã', async () => {
    render(<CheckoutPage />);
    const input = await screen.findByPlaceholderText('checkout.voucherPlaceholder');
    fireEvent.change(input, { target: { value: 'CHUA_AP_DUNG' } });
    acceptTerms();
    const confirm = screen.getByRole('button', { name: /checkout.proceedToPayment/ });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(m.createCustom).not.toHaveBeenCalled();
  });

  it('áp mã đúng cho custom plan → gửi explicitVoucherCode + quantities đúng, KHÔNG dùng đường standard createPayment', async () => {
    render(<CheckoutPage />);
    const input = await screen.findByPlaceholderText('checkout.voucherPlaceholder');
    fireEvent.change(input, { target: { value: voucher.code } });
    fireEvent.click(screen.getByRole('button', { name: 'checkout.applyVoucher' }));
    await screen.findByRole('button', { name: 'checkout.removeCode' });
    acceptTerms();
    fireEvent.click(screen.getByRole('button', { name: /checkout.confirmZeroCost/ }));
    await waitFor(() => expect(m.createCustom).toHaveBeenCalledWith(expect.objectContaining({
      explicitVoucherCode: voucher.code,
      quantities: { zalo_messages: 5000, zalo_accounts: 1 },
      billingPeriod: 'monthly',
    })));
  });
});

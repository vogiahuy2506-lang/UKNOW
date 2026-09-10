import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import CheckoutPage from './CheckoutPage';
import PaymentSuccess from './PaymentSuccess';

const m = vi.hoisted(() => ({
  navigate: vi.fn(), validate: vi.fn(), create: vi.fn(), free: vi.fn(),
  initialize: vi.fn(), status: vi.fn(), invoice: vi.fn(),
  user: { email: 'diagnostic@example.invalid' },
  plan: { id: 15, code: 'professional', name: 'Pro', price: 1299000, price_yearly: 12470400 },
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>,
  useNavigate: () => m.navigate,
  useLocation: () => ({ state: { plan: m.plan, billingPeriod: 'yearly' } }),
  useSearchParams: () => [new URLSearchParams('orderCode=999')],
}));
vi.mock('../../stores/authStore', () => ({ useAuthStore: (s) => s({ user: m.user, isLoading: false, isAuthenticated: true, initialize: m.initialize }) }));
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: (k) => k }) }));
vi.mock('../../services/voucher.service', () => ({
  getAvailableVouchers: async () => ({ data: { data: { vouchers: [] } } }),
  getVoucherCodeSuggestions: async () => ({ data: { data: { vouchers: [] } } }),
  validateVoucher: m.validate,
}));
vi.mock('../../features/checkout/services/checkoutApi.service', () => ({
  default: { createPayment: m.create, activateFreePlan: m.free, getPaymentStatus: m.status, getInvoice: m.invoice },
}));
vi.mock('../../constants/invoiceVat', () => ({ isInvoiceVatUiEnabled: () => false }));
vi.mock('../../utils/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:fake' } }));

const voucher = { code: 'DIAGNOSTIC_PRO100', offerMode: 'public_code', discountAmount: 12470400, finalAmount: 0 };
const apply = async () => {
  fireEvent.change(screen.getByPlaceholderText('checkout.voucherPlaceholder'), { target: { value: voucher.code } });
  fireEvent.click(screen.getByRole('button', { name: 'checkout.applyVoucher' }));
  await screen.findByRole('button', { name: 'checkout.removeCode' });
};
describe('read-only diagnosis: real CheckoutPage with network stubs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.validate.mockResolvedValue({ data: { data: { voucher } } });
    m.status.mockResolvedValue({ status: 'success', amount: 0 });
    m.invoice.mockResolvedValue({ hasInvoice: false });
    m.create.mockResolvedValue({ data: { success: true, result: { noPayment: true, orderCode: 999, amount: 0, originalAmount: 12470400, discountAmount: 12470400, voucher, discount: { ...voucher, source: 'public_code' } } } });
  });
  afterEach(cleanup);
  it('applying 100% code alone does not create an order or activate a plan', async () => {
    render(<CheckoutPage />); await apply();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.free).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /checkout.proceedToPayment/ }).textContent).toContain('0 đ');
  });
  it('submitting zero amount sends Pro/yearly and explicit code, then navigates to success', async () => {
    render(<CheckoutPage />); await apply();
    fireEvent.click(screen.getByRole('button', { name: /checkout.proceedToPayment/ }));
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/payment-success', expect.objectContaining({ state: { orderCode: 999, fromCheckout: true } })));
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ planCode: 'professional', billingPeriod: 'yearly', explicitVoucherCode: voucher.code }));
    expect(m.free).not.toHaveBeenCalled();
  });
  it('renders server rejection without navigating to success', async () => {
    m.create.mockRejectedValue({ response: { status: 409, data: { message: 'DIAGNOSTIC_PLAN_BLOCKED' } } });
    render(<CheckoutPage />); await apply();
    fireEvent.click(screen.getByRole('button', { name: /checkout.proceedToPayment/ }));
    await screen.findByText('DIAGNOSTIC_PLAN_BLOCKED');
    expect(m.navigate).not.toHaveBeenCalled();
  });
  it('reproduces race: submit remains enabled during voucher validation and sends no code', async () => {
    let finishValidation;
    m.validate.mockReturnValue(new Promise((resolve) => { finishValidation = resolve; }));
    m.create.mockResolvedValue({ data: { success: true, result: { orderCode: 1000, amount: 12470400, qrCode: 'fake', discountAmount: 0 } } });
    render(<CheckoutPage />);
    fireEvent.change(screen.getByPlaceholderText('checkout.voucherPlaceholder'), { target: { value: voucher.code } });
    fireEvent.click(screen.getByRole('button', { name: 'checkout.applyVoucher' }));
    const submit=screen.getByRole('button', { name: /checkout.proceedToPayment/ });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    await waitFor(() => expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ explicitVoucherCode: null })));
    await act(async () => finishValidation({ data: { data: { voucher } } }));
  });
  it('success verification does not refresh auth; dashboard CTA does', async () => {
    render(<PaymentSuccess />);
    const button=await screen.findByRole('button', { name: 'paymentSuccess.goToDashboard' });
    expect(m.status).toHaveBeenCalledWith('999');
    expect(m.initialize).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/app'));
    expect(m.initialize).toHaveBeenCalledTimes(1);
  });
});

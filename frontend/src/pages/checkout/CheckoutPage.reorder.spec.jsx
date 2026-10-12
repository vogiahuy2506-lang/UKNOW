import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import CheckoutPage from './CheckoutPage';

/**
 * PLAN_NHAC_THANH_TOAN_LAI_SAU_2_GIO (12/10/2026) — mở `/checkout?order=<mã đơn cũ>` từ link trong thư/chuông nhắc thanh toán lại.
 * Không có location.state (không đi từ trang giá) → trang đọc đơn cũ qua GET /payments/orders/:code/reorder rồi chạy luồng cũ (đơn MỚI).
 */
const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  validate: vi.fn(),
  create: vi.fn(),
  free: vi.fn(),
  reorder: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
  auth: { user: { email: 'khach@example.com' }, isLoading: false, isAuthenticated: true },
  loc: { state: null, search: '' },
  plan: { id: 15, code: 'professional', name: 'Chuyên nghiệp', price: 1299000, price_yearly: 12470400 },
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>,
  useNavigate: () => m.navigate,
  useLocation: () => m.loc,
}));
vi.mock('react-hot-toast', () => ({ toast: m.toast }));
vi.mock('../../stores/authStore', () => ({ useAuthStore: (select) => select(m.auth) }));
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: (k) => k }) }));
vi.mock('../../services/voucher.service', () => ({
  getAvailableVouchers: async () => ({ data: { data: { vouchers: [] } } }),
  getVoucherCodeSuggestions: async () => ({ data: { data: { vouchers: [] } } }),
  validateVoucher: m.validate,
}));
vi.mock('../../features/checkout/services/checkoutApi.service', () => ({
  default: {
    createPayment: m.create,
    activateFreePlan: m.free,
    getReorderInfo: m.reorder,
    getPaymentStatus: vi.fn(),
    getInvoice: vi.fn(),
  },
}));
vi.mock('../../constants/invoiceVat', () => ({ isInvoiceVatUiEnabled: () => false }));
vi.mock('../../utils/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:fake' } }));

const ORDER = '1760000000000011';
const voucher = { code: 'GIAM20', offerMode: 'public_code', discountAmount: 259800, finalAmount: 1039200 };

const openReorder = () => { m.loc = { state: null, search: `?order=${ORDER}` }; };
const acceptTerms = () => {
  const checkbox = document.querySelector('input[type="checkbox"]');
  if (checkbox && !checkbox.checked) fireEvent.click(checkbox);
};

describe('CheckoutPage — mở từ link nhắc thanh toán lại (?order=)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth = { user: { email: 'khach@example.com' }, isLoading: false, isAuthenticated: true };
    m.loc = { state: null, search: '' };
    m.reorder.mockResolvedValue({ plan: m.plan, billingPeriod: 'yearly', voucherCode: null, orderStatus: 'cancelled' });
    m.validate.mockResolvedValue({ data: { data: { voucher } } });
    m.create.mockResolvedValue({ data: { success: true, result: { orderCode: 1760000000000099, amount: 12470400, qrCode: 'fake', originalAmount: 12470400, discountAmount: 0 } } });
  });
  afterEach(cleanup);

  it('có ?order= và không có state → gọi API đúng mã đơn, hiện đúng gói + kỳ năm; KHÔNG đá về /pricing', async () => {
    openReorder();
    render(<CheckoutPage />);

    expect(await screen.findByRole('heading', { name: 'Chuyên nghiệp' })).toBeTruthy();
    expect(m.reorder).toHaveBeenCalledTimes(1);
    expect(m.reorder).toHaveBeenCalledWith(ORDER);
    expect(screen.getAllByText('checkout.yearlyBilling').length).toBeGreaterThan(0);
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it('đang đọc đơn → hiện bộ xương "checkout.reorderLoading", chưa điều hướng', async () => {
    let finish;
    m.reorder.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    openReorder();
    render(<CheckoutPage />);

    expect(screen.getByText('checkout.reorderLoading')).toBeTruthy();
    expect(m.navigate).not.toHaveBeenCalled();
    finish({ plan: m.plan, billingPeriod: 'monthly', voucherCode: null, orderStatus: 'cancelled' });
    expect(await screen.findByRole('heading', { name: 'Chuyên nghiệp' })).toBeTruthy();
    expect(screen.queryByText('checkout.reorderLoading')).toBeNull();
  });

  it('đơn cũ có mã giảm giá khách nhập → tự điền + validate đúng gói/kỳ, rồi thanh toán gửi đúng planCode/kỳ/mã và là đơn MỚI (không gửi mã đơn cũ)', async () => {
    m.reorder.mockResolvedValue({ plan: m.plan, billingPeriod: 'yearly', voucherCode: 'GIAM20', orderStatus: 'cancelled' });
    openReorder();
    render(<CheckoutPage />);

    await screen.findByRole('button', { name: 'checkout.removeCode' });
    expect(m.validate).toHaveBeenCalledWith(expect.objectContaining({ planCode: 'professional', billingPeriod: 'yearly', code: 'GIAM20' }));

    acceptTerms();
    fireEvent.click(screen.getByRole('button', { name: /checkout.proceedToPayment/ }));
    await waitFor(() => expect(m.create).toHaveBeenCalledTimes(1));
    const payload = m.create.mock.calls[0][0];
    expect(payload).toMatchObject({ planCode: 'professional', billingPeriod: 'yearly', explicitVoucherCode: 'GIAM20' });
    expect(JSON.stringify(payload)).not.toContain(ORDER);
  });

  it('API 409 (đơn đã thanh toán) → về /app/billing kèm thông báo, không dựng trang thanh toán', async () => {
    m.reorder.mockRejectedValue({ response: { status: 409, data: { code: 'ORDER_ALREADY_PAID' } } });
    openReorder();
    render(<CheckoutPage />);

    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/app/billing', { replace: true }));
    expect(m.toast).toHaveBeenCalledWith('checkout.reorderAlreadyPaid');
    expect(m.navigate).not.toHaveBeenCalledWith('/pricing', expect.anything());
    expect(m.create).not.toHaveBeenCalled();
  });

  it('API 410 (gói không còn bán) → về /pricing kèm thông báo lỗi', async () => {
    m.reorder.mockRejectedValue({ response: { status: 410, data: { code: 'PLAN_UNAVAILABLE' } } });
    openReorder();
    render(<CheckoutPage />);

    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/pricing', { replace: true }));
    expect(m.toast.error).toHaveBeenCalledWith('checkout.reorderPlanUnavailable');
  });

  it('API lỗi khác (404 đơn của người khác / mất mạng) → về /pricing với thông báo chung', async () => {
    m.reorder.mockRejectedValue({ response: { status: 404, data: { code: 'ORDER_NOT_FOUND' } } });
    openReorder();
    render(<CheckoutPage />);

    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/pricing', { replace: true }));
    expect(m.toast.error).toHaveBeenCalledWith('checkout.reorderLoadFailed');
  });

  it('chưa đăng nhập → /login?redirect=<checkout?order=…> (đã mã hoá), KHÔNG gọi API đơn hàng', async () => {
    m.auth = { user: null, isLoading: false, isAuthenticated: false };
    openReorder();
    render(<CheckoutPage />);

    await waitFor(() => expect(m.navigate).toHaveBeenCalledTimes(1));
    expect(m.navigate).toHaveBeenCalledWith(`/login?redirect=${encodeURIComponent(`/checkout?order=${ORDER}`)}`, { replace: true });
    expect(m.reorder).not.toHaveBeenCalled();
  });

  it('phiên đăng nhập còn đang kiểm tra (isLoading) → chờ: chưa gọi API, chưa điều hướng', async () => {
    m.auth = { user: null, isLoading: true, isAuthenticated: false };
    openReorder();
    render(<CheckoutPage />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(m.reorder).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
    expect(screen.getByText('checkout.reorderLoading')).toBeTruthy();
  });

  it('KHÔNG có ?order và không có state → như cũ: về /pricing, không gọi API đơn hàng', async () => {
    m.loc = { state: null, search: '' };
    render(<CheckoutPage />);

    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/pricing', { replace: true }));
    expect(m.reorder).not.toHaveBeenCalled();
  });

  it('?order=… không phải toàn chữ số → coi như không có ?order (về /pricing, không gọi API)', async () => {
    m.loc = { state: null, search: '?order=abc' };
    render(<CheckoutPage />);

    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/pricing', { replace: true }));
    expect(m.reorder).not.toHaveBeenCalled();
  });

  it('đi từ trang giá (có state.plan) kèm ?order → state thắng: không gọi API đơn hàng, giữ gói và kỳ của state', async () => {
    m.loc = { state: { plan: { ...m.plan, name: 'Từ trang giá' }, billingPeriod: 'monthly' }, search: `?order=${ORDER}` };
    render(<CheckoutPage />);

    expect(await screen.findByRole('heading', { name: 'Từ trang giá' })).toBeTruthy();
    expect(m.reorder).not.toHaveBeenCalled();
    expect(screen.getAllByText('checkout.monthlyBilling').length).toBeGreaterThan(0);
    expect(m.navigate).not.toHaveBeenCalled();
  });
});

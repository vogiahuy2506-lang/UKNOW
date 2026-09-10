import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import CheckoutPage from './CheckoutPage';

const m = vi.hoisted(() => ({
  navigate: vi.fn(), validate: vi.fn(), create: vi.fn(), free: vi.fn(),
  user: { email: 'diagnostic@example.invalid' },
  plan: { id: 15, code: 'professional', name: 'Pro', price: 1299000, price_yearly: 12470400 },
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>,
  useNavigate: () => m.navigate,
  useLocation: () => ({ state: { plan: m.plan, billingPeriod: 'yearly' } }),
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
  default: { createPayment: m.create, activateFreePlan: m.free, getPaymentStatus: vi.fn(), getInvoice: vi.fn() },
}));
vi.mock('../../constants/invoiceVat', () => ({ isInvoiceVatUiEnabled: () => false }));
vi.mock('../../utils/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:fake' } }));

const voucher = { code: 'DIAGNOSTIC_PRO100', offerMode: 'public_code', discountAmount: 12470400, finalAmount: 0 };
const applyCode = async (code = voucher.code) => {
  fireEvent.change(screen.getByPlaceholderText('checkout.voucherPlaceholder'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'checkout.applyVoucher' }));
  await screen.findByRole('button', { name: 'checkout.removeCode' });
};

describe('CheckoutPage — voucher/submit race guards + zero-cost confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.validate.mockResolvedValue({ data: { data: { voucher } } });
    m.create.mockResolvedValue({
      data: {
        success: true,
        result: { noPayment: true, orderCode: 999, amount: 0, originalAmount: 12470400, discountAmount: 12470400, voucher, discount: { ...voucher, source: 'public_code' } },
      },
    });
  });
  afterEach(cleanup);

  it('áp mã 100% chưa tạo order/activate — CTA đổi thành "Xác nhận đơn 0 đồng"', async () => {
    render(<CheckoutPage />);
    await applyCode();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.free).not.toHaveBeenCalled();
    expect(m.navigate).not.toHaveBeenCalled();
    const cta = screen.getByRole('button', { name: /checkout.confirmZeroCost/ });
    expect(cta.textContent).toContain('0 đ');
  });

  it('bấm xác nhận đơn 0 đồng gửi đúng plan/kỳ hạn/mã rồi mới điều hướng success', async () => {
    render(<CheckoutPage />);
    await applyCode();
    fireEvent.click(screen.getByRole('button', { name: /checkout.confirmZeroCost/ }));
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/payment-success', expect.objectContaining({ state: { orderCode: 999, fromCheckout: true } })));
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ planCode: 'professional', billingPeriod: 'yearly', explicitVoucherCode: voucher.code }));
    expect(m.free).not.toHaveBeenCalled();
  });

  it('server từ chối lúc submit → hiện lỗi, không điều hướng success', async () => {
    m.create.mockRejectedValue({ response: { status: 409, data: { message: 'DIAGNOSTIC_PLAN_BLOCKED' } } });
    render(<CheckoutPage />);
    await applyCode();
    fireEvent.click(screen.getByRole('button', { name: /checkout.confirmZeroCost/ }));
    await screen.findByText('DIAGNOSTIC_PLAN_BLOCKED');
    expect(m.navigate).not.toHaveBeenCalled();
  });

  it('submit bị khoá khi voucher đang validate — không gửi explicitVoucherCode rỗng; xác nhận lại sau khi validate xong mới gửi đúng mã', async () => {
    let finishValidation;
    m.validate.mockReturnValue(new Promise((resolve) => { finishValidation = resolve; }));
    m.create.mockResolvedValue({ data: { success: true, result: { orderCode: 1000, amount: 12470400, qrCode: 'fake', discountAmount: 0 } } });

    render(<CheckoutPage />);
    fireEvent.change(screen.getByPlaceholderText('checkout.voucherPlaceholder'), { target: { value: voucher.code } });
    fireEvent.click(screen.getByRole('button', { name: 'checkout.applyVoucher' }));

    // Validate chưa xong — giá vẫn full nên CTA còn tên proceedToPayment, nhưng phải bị khoá.
    const submit = screen.getByRole('button', { name: /checkout.proceedToPayment/ });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(m.create).not.toHaveBeenCalled();

    await act(async () => finishValidation({ data: { data: { voucher } } }));
    await screen.findByRole('button', { name: 'checkout.removeCode' });

    // Giá đã về 0 sau khi validate xong — CTA đổi nhãn, user phải bấm lại để xác nhận thật.
    const confirmBtn = screen.getByRole('button', { name: /checkout.confirmZeroCost/ });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ explicitVoucherCode: voucher.code })));
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it('bấm áp dụng mã 2 lần liên tiếp chỉ gọi validate 1 lần (nút đã khoá khi đang chạy)', async () => {
    let finishValidation;
    m.validate.mockReturnValue(new Promise((resolve) => { finishValidation = resolve; }));
    render(<CheckoutPage />);
    fireEvent.change(screen.getByPlaceholderText('checkout.voucherPlaceholder'), { target: { value: voucher.code } });
    const applyBtn = screen.getByRole('button', { name: 'checkout.applyVoucher' });
    fireEvent.click(applyBtn);
    fireEvent.click(applyBtn); // lần 2 — nút lúc này đã disabled, phải là no-op
    expect(m.validate).toHaveBeenCalledTimes(1);
    await act(async () => finishValidation({ data: { data: { voucher } } }));
  });

  it('bấm xác nhận 2 lần liên tiếp chỉ tạo 1 order (double-submit guard)', async () => {
    let finishCreate;
    m.create.mockReturnValue(new Promise((resolve) => { finishCreate = resolve; }));
    render(<CheckoutPage />);
    await applyCode();
    const confirmBtn = screen.getByRole('button', { name: /checkout.confirmZeroCost/ });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn); // nút đã disabled ngay sau lần 1 — no-op
    expect(m.create).toHaveBeenCalledTimes(1);
    await act(async () => finishCreate({
      data: { success: true, result: { noPayment: true, orderCode: 999, amount: 0, originalAmount: 12470400, discountAmount: 12470400, voucher, discount: { ...voucher, source: 'public_code' } } },
    }));
  });
});

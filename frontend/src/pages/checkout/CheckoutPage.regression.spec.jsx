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
const acceptTerms = () => {
  const checkbox = document.querySelector('input[type="checkbox"]');
  if (checkbox && !checkbox.checked) {
    fireEvent.click(checkbox);
  }
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
    acceptTerms();
    fireEvent.click(screen.getByRole('button', { name: /checkout.confirmZeroCost/ }));
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/payment-success', expect.objectContaining({ state: { orderCode: 999, fromCheckout: true } })));
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ planCode: 'professional', billingPeriod: 'yearly', explicitVoucherCode: voucher.code }));
    expect(m.free).not.toHaveBeenCalled();
  });

  it('server từ chối lúc submit → hiện lỗi, không điều hướng success', async () => {
    m.create.mockRejectedValue({ response: { status: 409, data: { message: 'DIAGNOSTIC_PLAN_BLOCKED' } } });
    render(<CheckoutPage />);
    await applyCode();
    acceptTerms();
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
    acceptTerms();
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
    acceptTerms();
    const confirmBtn = screen.getByRole('button', { name: /checkout.confirmZeroCost/ });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn); // nút đã disabled ngay sau lần 1 — no-op
    expect(m.create).toHaveBeenCalledTimes(1);
    await act(async () => finishCreate({
      data: { success: true, result: { noPayment: true, orderCode: 999, amount: 0, originalAmount: 12470400, discountAmount: 12470400, voucher, discount: { ...voucher, source: 'public_code' } } },
    }));
  });

  it('gọi Apply 2 lần trong CÙNG một tick (không có re-render chen giữa) vẫn chỉ validate 1 lần — ref đồng bộ, không chỉ dựa React state', async () => {
    let finishValidation;
    m.validate.mockReturnValue(new Promise((resolve) => { finishValidation = resolve; }));
    render(<CheckoutPage />);
    fireEvent.change(screen.getByPlaceholderText('checkout.voucherPlaceholder'), { target: { value: voucher.code } });
    const applyBtn = screen.getByRole('button', { name: 'checkout.applyVoucher' });
    // Bọc cả 2 click trong CÙNG một act() — mô phỏng đúng race thật (2 sự kiện liên tiếp
    // trước khi React kịp re-render `busy`/thuộc tính disabled ở DOM), khác với gọi
    // fireEvent.click() 2 lần tách rời (mỗi lần tự có act() riêng của RTL, vô tình để
    // React re-render và cập nhật disabled giữa 2 lần — không còn tái hiện đúng race).
    await act(async () => {
      fireEvent.click(applyBtn);
      fireEvent.click(applyBtn);
    });
    expect(m.validate).toHaveBeenCalledTimes(1);
    await act(async () => finishValidation({ data: { data: { voucher } } }));
  });

  it('nhập mã nhưng CHƯA bấm Áp dụng → CTA bị khoá, không âm thầm checkout thiếu mã', async () => {
    render(<CheckoutPage />);
    // findByRole (không phải getByRole) để chờ effect tải voucher tự động (auto-promotion/
    // chip) settle trước, tránh act() warning không liên quan tới điều đang kiểm.
    const submit = await screen.findByRole('button', { name: /checkout.proceedToPayment/ });
    fireEvent.change(screen.getByPlaceholderText('checkout.voucherPlaceholder'), { target: { value: 'CHUA_AP_DUNG' } });
    acceptTerms();
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.free).not.toHaveBeenCalled();
  });

  it('áp mã A rồi sửa draft thành B mà KHÔNG Apply lại → mã cũ bị vô hiệu ngay, không sống sót tới lúc submit', async () => {
    render(<CheckoutPage />);
    await applyCode(); // áp voucher.code (100% off) — CTA giờ là "Xác nhận đơn 0 đồng"
    screen.getByRole('button', { name: /checkout.confirmZeroCost/ });

    fireEvent.change(screen.getByPlaceholderText('checkout.voucherPlaceholder'), { target: { value: 'MA_KHAC' } });

    // Mã cũ bị vô hiệu ngay: giá preview quay lại đầy đủ (không còn CTA 0 đồng), nút quay
    // lại thành "Áp dụng" (chứng minh manualVoucher đã bị clear, không còn hiển thị "Xoá mã").
    expect(screen.queryByRole('button', { name: /checkout.confirmZeroCost/ })).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'checkout.applyVoucher' });

    // Draft "MA_KHAC" chưa được Apply — submit phải bị khoá, không được âm thầm gửi mã A cũ.
    acceptTerms();
    const submit = screen.getByRole('button', { name: /checkout.proceedToPayment/ });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(m.create).not.toHaveBeenCalled();
  });

  it('sau khi sửa draft và Apply lại mã mới → request gửi đúng mã MỚI, không phải mã cũ', async () => {
    const voucherB = { code: 'MA_KHAC_100', offerMode: 'public_code', discountAmount: 12470400, finalAmount: 0 };
    m.validate.mockImplementation(async ({ code }) => {
      if (code === voucherB.code) return { data: { data: { voucher: voucherB } } };
      return { data: { data: { voucher } } };
    });

    render(<CheckoutPage />);
    await applyCode(); // áp voucher.code trước

    fireEvent.change(screen.getByPlaceholderText('checkout.voucherPlaceholder'), { target: { value: voucherB.code } });
    fireEvent.click(screen.getByRole('button', { name: 'checkout.applyVoucher' }));
    await screen.findByRole('button', { name: 'checkout.removeCode' });

    acceptTerms();
    fireEvent.click(screen.getByRole('button', { name: /checkout.confirmZeroCost/ }));
    await waitFor(() => expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ explicitVoucherCode: voucherB.code })));
    expect(m.create).not.toHaveBeenCalledWith(expect.objectContaining({ explicitVoucherCode: voucher.code }));
  });
});

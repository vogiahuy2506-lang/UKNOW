import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import CheckoutPage from './CheckoutPage';

// PR-7 (PLAN_VA_LOI_LUONG_TIEN_2026-09-26) — trước đây setInterval cố định 3 giây + catch nuốt
// MỌI lỗi im lặng (kể cả 429) khiến trang kẹt mãi ở QR dù webhook đã kích hoạt gói. Mốc thời gian
// trong file này LUÔN tương đối (Date.now() + …), không ghi cứng ngày/giờ tuyệt đối — xem memory
// feedback_test_hen_gio_ngay_ghi_cung (test ghi cứng giờ từng tự đỏ CI qua một mốc giờ VN).
const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  validate: vi.fn(),
  create: vi.fn(),
  free: vi.fn(),
  getPaymentStatus: vi.fn(),
  user: { email: 'poll-test@example.invalid' },
  plan: { id: 20, code: 'starter', name: 'Starter', price: 299000, price_yearly: null },
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>,
  useNavigate: () => m.navigate,
  useLocation: () => ({ state: { plan: m.plan, billingPeriod: 'monthly' } }),
  useSearchParams: () => [new URLSearchParams('')],
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
    createPayment: m.create,
    activateFreePlan: m.free,
    getPaymentStatus: m.getPaymentStatus,
    getInvoice: vi.fn(),
  },
}));
vi.mock('../../constants/invoiceVat', () => ({ isInvoiceVatUiEnabled: () => false }));
vi.mock('../../utils/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:fake' } }));

const acceptTerms = () => {
  const checkbox = document.querySelector('input[type="checkbox"]');
  if (checkbox && !checkbox.checked) {
    fireEvent.click(checkbox);
  }
};

const submitToQrStep = async () => {
  render(<CheckoutPage />);
  acceptTerms();
  fireEvent.click(screen.getByRole('button', { name: /checkout.proceedToPayment/ }));
  await vi.waitFor(() => expect(m.create).toHaveBeenCalled());
  // Chờ QRCode.toDataURL (mock async) resolve rồi bước 'qr' render xong — flush microtask dưới fake timers.
  await vi.advanceTimersByTimeAsync(0);
};

describe('CheckoutPage — hỏi trạng thái thanh toán (PR-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    m.validate.mockResolvedValue({ data: { data: { voucher: null } } });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('nhận 429 thì giãn nhịp chờ (6s) rồi hỏi tiếp, không nuốt lỗi im lặng và không kẹt mãi', async () => {
    const expiredAt = Math.floor(Date.now() / 1000) + 900; // 15 phút — không liên quan test này
    m.create.mockResolvedValue({
      data: { success: true, result: { orderCode: 501, qrCode: 'fake-qr', amount: 299000, expiredAt } },
    });
    const rateLimitedError = Object.assign(new Error('Too Many Requests'), { response: { status: 429 } });
    m.getPaymentStatus
      .mockRejectedValueOnce(rateLimitedError)
      .mockResolvedValueOnce({ status: 'success' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await submitToQrStep();

    // Nhịp đầu (3s) — gặp 429, KHÔNG được nuốt im lặng.
    await vi.advanceTimersByTimeAsync(3000);
    expect(m.getPaymentStatus).toHaveBeenCalledTimes(1);
    expect(m.navigate).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('429'),
      expect.anything()
    );

    // Giãn nhịp gấp đôi (6s): mới qua 3s nữa (tổng 6s kể từ lượt 429) CHƯA được hỏi lại.
    await vi.advanceTimersByTimeAsync(3000);
    expect(m.getPaymentStatus).toHaveBeenCalledTimes(1);

    // Đủ 6s kể từ lượt 429 → hỏi lại lần 2, lần này thành công → tự chuyển trang.
    await vi.advanceTimersByTimeAsync(3000);
    expect(m.getPaymentStatus).toHaveBeenCalledTimes(2);
    expect(m.navigate).toHaveBeenCalledWith('/payment-success', expect.objectContaining({ state: { orderCode: 501, fromCheckout: true } }));

    warnSpy.mockRestore();
  });

  it('hỏi được lại sau 429 thì về nhịp 3s — không kẹt ở nhịp chậm suốt phiên', async () => {
    // Review PR-7: đột biến "bỏ dòng về lại 3000ms" từng lọt — khách trả xong phải chờ tới 30s.
    const expiredAt = Math.floor(Date.now() / 1000) + 900;
    m.create.mockResolvedValue({
      data: { success: true, result: { orderCode: 503, qrCode: 'fake-qr', amount: 299000, expiredAt } },
    });
    const rateLimitedError = Object.assign(new Error('Too Many Requests'), { response: { status: 429 } });
    m.getPaymentStatus
      .mockRejectedValueOnce(rateLimitedError) // t=3s: 429 → nhịp 6s
      .mockResolvedValueOnce({ status: 'pending' }) // t=9s: qua được → phải về nhịp 3s
      .mockResolvedValueOnce({ status: 'success' }); // t=12s (không phải t=15s)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await submitToQrStep();

    await vi.advanceTimersByTimeAsync(3000);
    expect(m.getPaymentStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6000);
    expect(m.getPaymentStatus).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(3000);
    expect(m.getPaymentStatus).toHaveBeenCalledTimes(3);
    expect(m.navigate).toHaveBeenCalledWith('/payment-success', expect.objectContaining({ state: { orderCode: 503, fromCheckout: true } }));

    warnSpy.mockRestore();
  });

  it('QR hết hạn thì dừng hỏi hẳn, không tiếp tục gọi API nữa', async () => {
    // Làm tròn LÊN: floor có thể làm mất gần 1s, cộng với vi.waitFor tự đẩy đồng hồ giả 50ms/lượt lúc
    // dựng trang → đôi khi lượt hỏi đầu (giây 3) rơi SAU mốc hết hạn và test đỏ chập chờn (~1/10).
    const expiredAt = Math.ceil(Date.now() / 1000) + 4; // hết hạn sau 4–5 giây — mốc TƯƠNG ĐỐI
    m.create.mockResolvedValue({
      data: { success: true, result: { orderCode: 502, qrCode: 'fake-qr', amount: 299000, expiredAt } },
    });
    m.getPaymentStatus.mockResolvedValue({ status: 'pending' }); // không bao giờ tự thành công

    await submitToQrStep();

    // Lượt đầu (3s) — QR chưa hết hạn (hết hạn ở giây thứ 4) → vẫn hỏi.
    await vi.advanceTimersByTimeAsync(3000);
    expect(m.getPaymentStatus).toHaveBeenCalledTimes(1);

    // Lượt kế tiếp lẽ ra ở giây thứ 6 — nhưng QR đã hết hạn ở giây thứ 4 → phải dừng, KHÔNG gọi thêm.
    await vi.advanceTimersByTimeAsync(3000);
    expect(m.getPaymentStatus).toHaveBeenCalledTimes(1);

    // Đợi thêm nhiều nhịp nữa vẫn không gọi lại — xác nhận dừng HẲN, không phải chỉ chậm lại.
    await vi.advanceTimersByTimeAsync(9000);
    expect(m.getPaymentStatus).toHaveBeenCalledTimes(1);
    expect(m.navigate).not.toHaveBeenCalled();
  });
});

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import PaymentSuccess from './PaymentSuccess';

const m = vi.hoisted(() => ({
  navigate: vi.fn(),
  status: vi.fn(),
  invoice: vi.fn(),
  refresh: vi.fn(),
  fetchAiCredits: vi.fn(),
  isAuthenticated: true,
}));
vi.mock('react-router-dom', () => ({
  Link: ({ children }) => <span>{children}</span>,
  useNavigate: () => m.navigate,
  useLocation: () => ({ state: { orderCode: 999 } }),
  useSearchParams: () => [new URLSearchParams('orderCode=999')],
}));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (s) => s({
    isAuthenticated: m.isAuthenticated,
    refreshCurrentUser: m.refresh,
    fetchAiCredits: m.fetchAiCredits,
  }),
}));
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: (k) => k }) }));
vi.mock('../../features/checkout/services/checkoutApi.service', () => ({
  default: { getPaymentStatus: m.status, getInvoice: m.invoice },
}));
vi.mock('../../utils/analytics', () => ({ trackEvent: vi.fn() }));

describe('PaymentSuccess — tự đồng bộ tài khoản sau khi xác nhận đơn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.isAuthenticated = true;
    m.status.mockResolvedValue({ status: 'success', amount: 0 });
    m.invoice.mockResolvedValue({ hasInvoice: false });
    m.refresh.mockResolvedValue({ success: true, user: { id: 1, role: 'user' } });
    m.fetchAiCredits.mockResolvedValue({ used: 0, limit: null });
  });
  afterEach(cleanup);

  it('xác nhận thành công tự gọi refreshCurrentUser (store) — không dùng initialize() nữa', async () => {
    render(<PaymentSuccess />);
    await screen.findByRole('button', { name: 'paymentSuccess.goToDashboard' });
    expect(m.status).toHaveBeenCalledWith('999');
    await waitFor(() => expect(m.refresh).toHaveBeenCalledTimes(1));
    // Đua thời gian làm CI đỏ 10/09 + 12/09 (xanh ở máy): CTA bị disabled khi accountSync ===
    // 'syncing' (PaymentSuccess.jsx CTA), và fireEvent.click lên nút disabled thì im lặng —
    // navigate không bao giờ được gọi. Phải đợi nút MỞ rồi mới bấm, và lấy lại phần tử sau
    // re-render thay vì giữ tham chiếu cũ.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'paymentSuccess.goToDashboard' })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'paymentSuccess.goToDashboard' }));
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/app'));
    // CTA không gọi refresh lần nữa — đã đồng bộ xong trước đó.
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });

  it('CTA bị khoá trong lúc đang đồng bộ, tự mở khi xong', async () => {
    let finishRefresh;
    m.refresh.mockReturnValue(new Promise((resolve) => { finishRefresh = resolve; }));
    render(<PaymentSuccess />);
    const button = await screen.findByRole('button', { name: 'paymentSuccess.syncingAccount' });
    expect(button).toBeDisabled();
    finishRefresh({ success: true, user: { id: 1 } });
    await screen.findByRole('button', { name: 'paymentSuccess.goToDashboard' });
  });

  it('đồng bộ lỗi mạng/5xx không xoá phiên — giữ trang thành công, hiện nút thử lại', async () => {
    m.refresh.mockResolvedValueOnce({ success: false, error: new Error('network down') });
    render(<PaymentSuccess />);
    await screen.findByText('paymentSuccess.orderCodeHint');
    await waitFor(() => expect(m.refresh).toHaveBeenCalledTimes(1));
    const retryBtn = await screen.findByRole('button', { name: 'paymentSuccess.retrySync' });

    m.refresh.mockResolvedValueOnce({ success: true, user: { id: 1 } });
    fireEvent.click(retryBtn);
    await waitFor(() => expect(m.refresh).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: 'paymentSuccess.goToDashboard' });
  });

  it('guest xem trạng thái đơn (chưa đăng nhập) không bị ép gọi refreshCurrentUser', async () => {
    m.isAuthenticated = false;
    render(<PaymentSuccess />);
    await screen.findByText('paymentSuccess.orderCodeHint');
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it('status trả failed → điều hướng về /checkout, không đụng tới refreshCurrentUser', async () => {
    m.status.mockResolvedValue({ status: 'failed' });
    render(<PaymentSuccess />);
    await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/checkout', { replace: true }));
    expect(m.refresh).not.toHaveBeenCalled();
  });

  it('đồng bộ thành công cũng đồng bộ quota/billing bằng fetchAiCredits() — không chỉ user (finding review)', async () => {
    render(<PaymentSuccess />);
    await screen.findByRole('button', { name: 'paymentSuccess.goToDashboard' });
    expect(m.fetchAiCredits).toHaveBeenCalled();
  });

  it('fetchAiCredits lỗi KHÔNG rollback accountSync=done (user đã refresh thành công là đủ)', async () => {
    m.fetchAiCredits.mockRejectedValue(new Error('quota fetch down'));
    render(<PaymentSuccess />);
    // Vẫn phải đi tới trạng thái done (nút goToDashboard xuất hiện) dù fetchAiCredits lỗi.
    await screen.findByRole('button', { name: 'paymentSuccess.goToDashboard' });
  });
});

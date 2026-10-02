import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminOrdersPage from './AdminOrdersPage';

// PLAN_GOP_MAU_TIN_MEDIA_VA_VIEC_LE_2026-10-03, PR-L / L3: waitFor/findBy mặc định chỉ chờ 1 giây — máy tải nặng (nhiều phiên test
// chạy song song, CI chậm) trang chưa kịp vẽ xong thì ca đỏ chập chờn. Nâng cho CẢ file; riêng chỗ truy vấn ngay sau khi API được
// gọi còn ghi `{ timeout: 5000 }` tường minh (cùng kiểu đã sửa ở 1a2d1f57, AdminAiUsagePage.spec).
configure({ asyncUtilTimeout: 5000 });

const {
  mockGetOrders, mockMarkPaidAfterCancelledHandled, mockGetRefundPreview, mockRefundOrder,
} = vi.hoisted(() => ({
  mockGetOrders: vi.fn(),
  mockMarkPaidAfterCancelledHandled: vi.fn(),
  mockGetRefundPreview: vi.fn(),
  mockRefundOrder: vi.fn(),
}));

vi.mock('../../features/admin/services/adminOrdersApi.service', () => ({
  default: {
    getOrders: mockGetOrders,
    cancelOrder: vi.fn(),
    markPaidAfterCancelledHandled: mockMarkPaidAfterCancelledHandled,
    getRefundPreview: mockGetRefundPreview,
    refundOrder: mockRefundOrder,
  },
}));

const response = {
  data: {
    data: {
      total: 3,
      orders: [
        {
          id: 1,
          orderCode: 'YEARLY-1',
          planName: 'Starter',
          planCode: 'starter',
          billingPeriod: 'yearly',
          voucherCode: 'VIP100',
          discountAmount: '2870400',
          amount: '0.00',
          paymentMethod: 'voucher',
          userEmail: 'yearly@example.com',
          status: 'success',
          createdAt: '2026-08-20T00:00:00.000Z',
          isTopup: false,
        },
        {
          id: 2,
          orderCode: 'MONTHLY-1',
          planName: 'Starter',
          planCode: 'starter',
          billingPeriod: 'monthly',
          voucherCode: null,
          discountAmount: '0.00',
          amount: '299000.00',
          paymentMethod: 'payos',
          userEmail: 'monthly@example.com',
          status: 'success',
          createdAt: '2026-08-13T00:00:00.000Z',
          isTopup: false,
        },
        {
          id: 3,
          orderCode: 'TOPUP-1',
          planName: 'Starter',
          planCode: 'starter',
          billingPeriod: 'monthly',
          voucherCode: null,
          discountAmount: '0.00',
          amount: '50000.00',
          paymentMethod: 'manual',
          userEmail: 'topup@example.com',
          status: 'success',
          createdAt: '2026-08-12T00:00:00.000Z',
          isTopup: true,
        },
        {
          id: 4,
          orderCode: 'PAID-CANCELLED-1',
          planName: 'Starter',
          planCode: 'starter',
          billingPeriod: 'monthly',
          voucherCode: null,
          discountAmount: '0.00',
          amount: '299000.00',
          paymentMethod: 'payos',
          userEmail: 'paidcancelled@example.com',
          status: 'cancelled',
          note: '[OPS] PAID_AFTER_CANCELLED order status=cancelled webhook_amount=299000',
          createdAt: '2026-08-11T00:00:00.000Z',
          isTopup: false,
        },
      ],
      kpi: { revenue: 349000, refunded: 299000, paidOrders: 2, needsAction: 1, period: { from: '2026-09-01', to: '2026-09-30' } },
    },
  },
};

describe('AdminOrdersPage billing metadata', () => {
  beforeEach(() => {
    mockGetOrders.mockResolvedValue(response);
    mockMarkPaidAfterCancelledHandled.mockReset();
  });

  it('renders yearly/monthly/top-up labels and voucher/payment details', async () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <AdminOrdersPage />
        </I18nProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('YEARLY-1')).toBeInTheDocument());
    expect(screen.getAllByText('Theo năm').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Theo tháng').length).toBeGreaterThan(0);
    expect(screen.getByText('Mua thêm')).toBeInTheDocument();
    expect(screen.getByText('VIP100')).toBeInTheDocument();
    expect(screen.getAllByText('Không dùng voucher').length).toBe(3);
    expect(screen.getByText('Voucher')).toBeInTheDocument();
    expect(screen.getByText('Thủ công')).toBeInTheDocument();
  });
});

describe('AdminOrdersPage — đơn PAID_AFTER_CANCELLED', () => {
  beforeEach(() => {
    mockGetOrders.mockResolvedValue(response);
    mockMarkPaidAfterCancelledHandled.mockReset();
  });

  it('hiện badge và nút "Đánh dấu đã xử lý" cho đơn có tag PAID_AFTER_CANCELLED chưa xử lý', async () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <AdminOrdersPage />
        </I18nProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('PAID-CANCELLED-1')).toBeInTheDocument());
    expect(screen.getByText('PayOS báo đã trả dù đơn đã huỷ — cần xử lý tay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đánh dấu đã xử lý' })).toBeInTheDocument();
  });

  it('đơn đã có tag PAID_AFTER_CANCELLED_HANDLED → không còn badge, không còn nút', async () => {
    const handled = structuredClone(response);
    const order = handled.data.data.orders.find((o) => o.orderCode === 'PAID-CANCELLED-1');
    order.note += '\n[OPS] PAID_AFTER_CANCELLED_HANDLED by admin@example.com at 2026-09-26T10:00:00.000Z';
    mockGetOrders.mockResolvedValue(handled);

    render(
      <MemoryRouter>
        <I18nProvider>
          <AdminOrdersPage />
        </I18nProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('PAID-CANCELLED-1')).toBeInTheDocument());
    expect(screen.queryByText('PayOS báo đã trả dù đơn đã huỷ — cần xử lý tay')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã xử lý' })).not.toBeInTheDocument();
  });

  it('bấm "Đánh dấu đã xử lý" gọi API markPaidAfterCancelledHandled với đúng orderCode rồi tải lại danh sách', async () => {
    mockMarkPaidAfterCancelledHandled.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <I18nProvider>
          <AdminOrdersPage />
        </I18nProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('PAID-CANCELLED-1')).toBeInTheDocument());
    const callsBefore = mockGetOrders.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Đánh dấu đã xử lý' }));

    await waitFor(() => {
      expect(mockMarkPaidAfterCancelledHandled).toHaveBeenCalledWith('PAID-CANCELLED-1');
    });
    await waitFor(() => {
      expect(mockGetOrders.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

// PLAN_HOAN_TIEN_DON_HANG PR-3 — nút/modal "Hoàn tiền".
describe('AdminOrdersPage — hoàn tiền', () => {
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const withRefunded = () => {
    const r = structuredClone(response);
    r.data.data.orders.push({
      id: 5,
      orderCode: 'REFUNDED-1',
      planName: 'Starter',
      planCode: 'starter',
      billingPeriod: 'monthly',
      voucherCode: null,
      discountAmount: '0.00',
      amount: '299000.00',
      paymentMethod: 'payos',
      userEmail: 'refunded@example.com',
      status: 'refunded',
      createdAt: daysAgo(3),
      isTopup: false,
    });
    return r;
  };
  const eligiblePreview = (affiliate = null) => ({
    data: {
      data: {
        orderCode: 'MONTHLY-1', amount: 299000, status: 'success', eligible: true, kind: 'paid',
        plan: 'revoked', einvoice: 'needs_adjustment', einvoiceStatusBefore: 'issued', affiliate,
      },
    },
  });

  const renderPage = () => render(
    <MemoryRouter>
      <I18nProvider>
        <AdminOrdersPage />
      </I18nProvider>
    </MemoryRouter>,
  );

  beforeEach(() => {
    mockGetOrders.mockReset().mockResolvedValue(withRefunded());
    mockGetRefundPreview.mockReset();
    mockRefundOrder.mockReset();
  });

  it('đơn refunded hiện nhãn "Đã hoàn tiền" (không phải khoá thô), bộ lọc có "Đã hoàn tiền"', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('REFUNDED-1')).toBeInTheDocument());
    const row = screen.getByText('REFUNDED-1').closest('tr');
    expect(within(row).getByText('Đã hoàn tiền')).toBeInTheDocument();
    expect(screen.queryByText('orders.refunded')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Đã hoàn tiền' })).toHaveValue('refunded');
  });

  it('nút "Hoàn tiền" chỉ hiện cho đơn đã trả tiền thật (PayOS success, đơn huỷ có PAID_AFTER_CANCELLED)', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('MONTHLY-1')).toBeInTheDocument());
    const hasRefundButton = (code) => Boolean(
      within(screen.getByText(code).closest('tr')).queryByRole('button', { name: 'Hoàn tiền' })
    );
    expect(hasRefundButton('MONTHLY-1')).toBe(true);
    expect(hasRefundButton('PAID-CANCELLED-1')).toBe(true);
    expect(hasRefundButton('YEARLY-1')).toBe(false); // voucher 0đ
    expect(hasRefundButton('TOPUP-1')).toBe(false); // mua thêm
    expect(hasRefundButton('REFUNDED-1')).toBe(false);
  });

  it('modal hiện 3 hệ quả, bắt buộc lý do, gửi đúng body rồi tải lại danh sách', async () => {
    mockGetRefundPreview.mockResolvedValue(eligiblePreview({
      monthKey: '2026-08', period: 'adjusted', prevCommission: 4400000, newCommission: 1800000,
      deducted: 2600000, shortfall: 0, pendingWithdrawal: null,
    }));
    mockRefundOrder.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('MONTHLY-1')).toBeInTheDocument());

    await user.click(within(screen.getByText('MONTHLY-1').closest('tr')).getByRole('button', { name: 'Hoàn tiền' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 });
    await waitFor(() => expect(mockGetRefundPreview).toHaveBeenCalledWith('MONTHLY-1'));
    await waitFor(() => {
      expect(within(dialog).getByText(/khách mất gói ngay/)).toBeInTheDocument();
      expect(within(dialog).getByText(/lập hoá đơn điều chỉnh trên cổng Mắt Bão/)).toBeInTheDocument();
      expect(within(dialog).getByText(/tháng 2026-08 giảm từ 4\.400\.000 đ xuống 1\.800\.000 đ — trừ ví đối tác 2\.600\.000 đ/)).toBeInTheDocument();
    });
    expect(within(dialog).queryByText(/adminOrders\./)).not.toBeInTheDocument();

    const confirm = within(dialog).getByRole('button', { name: 'Ghi nhận đã hoàn tiền' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Lý do hoàn tiền (bắt buộc)'), 'Khách huỷ trong 7 ngày');
    await user.type(within(dialog).getByLabelText('Mã giao dịch chuyển khoản hoàn (nếu có)'), 'FT123');
    const callsBefore = mockGetOrders.mock.calls.length;
    await user.click(confirm);

    await waitFor(() => {
      expect(mockRefundOrder).toHaveBeenCalledWith('MONTHLY-1', {
        reason: 'Khách huỷ trong 7 ngày', transferRef: 'FT123', acknowledgeShortfall: undefined,
      });
    });
    await waitFor(() => expect(mockGetOrders.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('đối tác có yêu cầu rút chờ duyệt → phải tích xác nhận công ty chịu thì mới gửi được', async () => {
    mockGetRefundPreview.mockResolvedValue(eligiblePreview({
      monthKey: '2026-08', period: 'adjusted', prevCommission: 4400000, newCommission: 1800000,
      deducted: 1400000, shortfall: 1200000, pendingWithdrawal: { id: 13, amountGross: 3000000 },
    }));
    mockRefundOrder.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('MONTHLY-1')).toBeInTheDocument());
    await user.click(within(screen.getByText('MONTHLY-1').closest('tr')).getByRole('button', { name: 'Hoàn tiền' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 });
    await waitFor(() => {
      expect(within(dialog).getByText(/yêu cầu rút #13 chờ duyệt/)).toBeInTheDocument();
    });

    await user.type(within(dialog).getByLabelText('Lý do hoàn tiền (bắt buộc)'), 'A3');
    const confirm = within(dialog).getByRole('button', { name: 'Ghi nhận đã hoàn tiền' });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByLabelText('Tôi xác nhận công ty chịu 1.200.000 đ'));
    // waitFor: state React sau click có thể chưa flush khi máy tải nặng — CI 29/09 đỏ "element is not enabled".
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    await waitFor(() => {
      expect(mockRefundOrder).toHaveBeenCalledWith('MONTHLY-1', expect.objectContaining({ acknowledgeShortfall: true }));
    });
  });

  it('preview báo không đủ điều kiện → hiện lý do, không có nút gửi', async () => {
    mockGetRefundPreview.mockResolvedValue({
      data: { data: { orderCode: 'MONTHLY-1', eligible: false, code: 'PENDING_PLAN_CHANGE', reason: 'Khách đang có lịch đổi gói chờ áp dụng (#6)' } },
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('MONTHLY-1')).toBeInTheDocument());
    await user.click(within(screen.getByText('MONTHLY-1').closest('tr')).getByRole('button', { name: 'Hoàn tiền' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 });
    await waitFor(() => {
      expect(within(dialog).getByText('Không hoàn được đơn này: Khách đang có lịch đổi gói chờ áp dụng (#6)')).toBeInTheDocument();
    });
    expect(within(dialog).queryByRole('button', { name: 'Ghi nhận đã hoàn tiền' })).not.toBeInTheDocument();
    expect(mockRefundOrder).not.toHaveBeenCalled();
  });
});

// PR-9 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — KPI theo bộ lọc, mặc định "tháng này", nhãn kỳ, lọc "Thất bại",
// lọc "cần chú ý" từ liên kết Tổng quan.
describe('AdminOrdersPage — PR-9: KPI theo bộ lọc', () => {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const vn = (value) => value.split('-').reverse().join('/');

  const renderAt = (url = '/admin/orders') => render(
    <MemoryRouter initialEntries={[url]}>
      <I18nProvider>
        <AdminOrdersPage />
      </I18nProvider>
    </MemoryRouter>,
  );
  const lastParams = () => mockGetOrders.mock.calls[mockGetOrders.mock.calls.length - 1][0];

  beforeEach(() => {
    mockGetOrders.mockReset().mockResolvedValue(response);
  });

  it('mặc định "tháng này": gọi API với dateFrom = mùng 1, dateTo = hôm nay; nhãn kỳ ghi rõ', async () => {
    renderAt();
    await waitFor(() => expect(mockGetOrders).toHaveBeenCalled());
    expect(mockGetOrders.mock.calls[0][0]).toMatchObject({ dateFrom: monthStart, dateTo: today });
    expect(mockGetOrders.mock.calls[0][0]).not.toHaveProperty('attention');
    await waitFor(() => expect(screen.getByTestId('orders-kpi-period')).toHaveTextContent(`Kỳ: ${vn(monthStart)} – ${vn(today)}`));
  });

  it('bốn thẻ: Doanh thu (đã trừ hoàn) · Đã hoàn · Đơn đã trả · Cần xử lý, số lấy từ kpi của API', async () => {
    renderAt();
    await waitFor(() => expect(screen.getByTestId('orders-kpi-revenue')).toHaveTextContent('349.000 đ'));
    const text = (id) => screen.getByTestId(id).textContent;
    expect(text('orders-kpi-revenue')).toContain('Doanh thu (đã trừ hoàn)');
    expect(text('orders-kpi-refunded')).toContain('Đã hoàn');
    expect(text('orders-kpi-refunded')).toContain('299.000 đ');
    expect(text('orders-kpi-paid')).toContain('Đơn đã trả');
    expect(text('orders-kpi-paid')).toContain('2');
    expect(text('orders-kpi-needs-action')).toContain('Cần xử lý');
    expect(text('orders-kpi-needs-action')).toContain('1');
    // Không còn 4 thẻ cũ (Tổng đơn / Chờ thanh toán / Đã hủy, Doanh thu toàn thời gian).
    expect(screen.queryByText('Tổng đơn')).not.toBeInTheDocument();
    expect(screen.queryByText('Từ đơn thành công')).not.toBeInTheDocument();
  });

  it('"Xoá lọc" → toàn thời gian: không gửi mốc ngày, nhãn kỳ đổi', async () => {
    const user = userEvent.setup();
    renderAt();
    await waitFor(() => expect(mockGetOrders).toHaveBeenCalled());
    await user.click(await screen.findByRole('button', { name: 'Xóa lọc' }, { timeout: 5000 }));
    await waitFor(() => expect(screen.getByTestId('orders-kpi-period')).toHaveTextContent('Kỳ: Toàn thời gian'));
    expect(lastParams()).not.toHaveProperty('dateFrom');
    expect(lastParams()).not.toHaveProperty('dateTo');
  });

  it('bộ lọc trạng thái có "Thất bại"; đơn failed hiện nhãn tiếng Việt, đơn success có màu thật', async () => {
    const withFailed = structuredClone(response);
    withFailed.data.data.orders.push({
      id: 9, orderCode: 'FAILED-1', planName: 'Starter', planCode: 'starter', billingPeriod: 'monthly', voucherCode: null,
      discountAmount: '0.00', amount: '299000.00', paymentMethod: 'payos', userEmail: 'failed@example.com', status: 'failed',
      createdAt: '2026-09-10T00:00:00.000Z', isTopup: false,
    });
    mockGetOrders.mockResolvedValue(withFailed);
    renderAt();
    await waitFor(() => expect(screen.getByText('FAILED-1')).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Thất bại' })).toHaveValue('failed');
    const failedRow = screen.getByText('FAILED-1').closest('tr');
    const failedBadge = within(failedRow).getByText('Thất bại');
    expect(failedBadge.className).toContain('badge-error');
    expect(within(failedRow).queryByText('failed')).not.toBeInTheDocument();
    const successBadge = within(screen.getByText('MONTHLY-1').closest('tr')).getByText('Thành công');
    expect(successBadge.className).toContain('badge-success');
  });

  it('liên kết từ Tổng quan (?attention=paid_after_cancelled): lọc đúng những đơn đó, KHÔNG áp mặc định tháng này', async () => {
    renderAt('/admin/orders?attention=paid_after_cancelled');
    await waitFor(() => expect(mockGetOrders).toHaveBeenCalled());
    expect(mockGetOrders.mock.calls[0][0]).toMatchObject({ attention: 'paid_after_cancelled' });
    expect(mockGetOrders.mock.calls[0][0]).not.toHaveProperty('dateFrom');
    expect(mockGetOrders.mock.calls[0][0]).not.toHaveProperty('dateTo');
    expect(await screen.findByTestId('orders-attention-chip', {}, { timeout: 5000 })).toHaveTextContent('tiền đã vào');
    await waitFor(() => expect(screen.getByTestId('orders-kpi-period')).toHaveTextContent('Kỳ: Toàn thời gian'));
  });

  it('bấm thẻ "Cần xử lý" → lọc attention=needs_action; bấm "Bỏ lọc" → về danh sách thường', async () => {
    const user = userEvent.setup();
    renderAt();
    await waitFor(() => expect(mockGetOrders).toHaveBeenCalled());
    await user.click(await screen.findByTestId('orders-kpi-needs-action', {}, { timeout: 5000 }));
    await waitFor(() => expect(lastParams()).toMatchObject({ attention: 'needs_action' }));
    expect(await screen.findByTestId('orders-attention-chip', {}, { timeout: 5000 })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Bỏ lọc' }, { timeout: 5000 }));
    await waitFor(() => expect(lastParams()).not.toHaveProperty('attention'));
    expect(screen.queryByTestId('orders-attention-chip')).not.toBeInTheDocument();
  });
});

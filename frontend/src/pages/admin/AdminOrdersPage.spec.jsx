import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminOrdersPage from './AdminOrdersPage';

const { mockGetOrders, mockMarkPaidAfterCancelledHandled } = vi.hoisted(() => ({
  mockGetOrders: vi.fn(),
  mockMarkPaidAfterCancelledHandled: vi.fn(),
}));

vi.mock('../../features/admin/services/adminOrdersApi.service', () => ({
  default: {
    getOrders: mockGetOrders,
    cancelOrder: vi.fn(),
    markPaidAfterCancelledHandled: mockMarkPaidAfterCancelledHandled,
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
      kpi: { totalRevenue: '349000', totalOrders: 4, pendingCount: 0, cancelledCount: 1 },
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
      <I18nProvider>
        <AdminOrdersPage />
      </I18nProvider>,
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
      <I18nProvider>
        <AdminOrdersPage />
      </I18nProvider>,
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
      <I18nProvider>
        <AdminOrdersPage />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText('PAID-CANCELLED-1')).toBeInTheDocument());
    expect(screen.queryByText('PayOS báo đã trả dù đơn đã huỷ — cần xử lý tay')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã xử lý' })).not.toBeInTheDocument();
  });

  it('bấm "Đánh dấu đã xử lý" gọi API markPaidAfterCancelledHandled với đúng orderCode rồi tải lại danh sách', async () => {
    mockMarkPaidAfterCancelledHandled.mockResolvedValue({ data: { success: true } });
    const user = userEvent.setup();

    render(
      <I18nProvider>
        <AdminOrdersPage />
      </I18nProvider>,
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

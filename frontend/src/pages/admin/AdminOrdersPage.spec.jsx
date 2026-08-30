import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminOrdersPage from './AdminOrdersPage';

const { mockGetOrders } = vi.hoisted(() => ({
  mockGetOrders: vi.fn(),
}));

vi.mock('../../features/admin/services/adminOrdersApi.service', () => ({
  default: {
    getOrders: mockGetOrders,
    cancelOrder: vi.fn(),
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
      ],
      kpi: { totalRevenue: '349000', totalOrders: 3, pendingCount: 0, cancelledCount: 0 },
    },
  },
};

describe('AdminOrdersPage billing metadata', () => {
  beforeEach(() => {
    mockGetOrders.mockResolvedValue(response);
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
    expect(screen.getAllByText('Không dùng voucher').length).toBe(2);
    expect(screen.getByText('Voucher')).toBeInTheDocument();
    expect(screen.getByText('Thủ công')).toBeInTheDocument();
  });
});

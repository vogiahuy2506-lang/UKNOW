// PLAN_HOAN_TIEN_DON_HANG PR-3 — trang admin hoá đơn: hoá đơn của đơn đã hoàn tiền.
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminEinvoicesPage from './AdminEinvoicesPage';

const { mockGetEinvoices } = vi.hoisted(() => ({ mockGetEinvoices: vi.fn() }));
vi.mock('../../features/admin/services/adminEinvoicesApi.service', () => ({
  default: { getEinvoices: mockGetEinvoices, retryEinvoice: vi.fn(), resendEmail: vi.fn() },
}));

const row = (overrides) => ({
  id: 1, status: 'issued', errorCode: null, errorMessage: null, soHdon: '0000123', khhdon: 'C26T',
  emailStatus: 'sent', orderCode: 'ORD-1', amount: '299000', orderStatus: 'refunded',
  userEmail: 'a@example.com', createdAt: new Date(Date.now() - 86400000).toISOString(),
  ...overrides,
});

describe('AdminEinvoicesPage — đơn đã hoàn tiền', () => {
  it('hoá đơn đã xuất của đơn đã hoàn → nhắc lập hoá đơn điều chỉnh; hoá đơn bị dừng → không có nút Thử lại', async () => {
    mockGetEinvoices.mockResolvedValue({
      data: {
        data: {
          total: 3,
          einvoices: [
            row({ id: 1, orderCode: 'ISSUED-REFUNDED' }),
            row({ id: 2, orderCode: 'STOPPED-REFUNDED', status: 'failed', errorCode: 'ORDER_REFUNDED', soHdon: null }),
            row({ id: 3, orderCode: 'FAILED-SUCCESS', status: 'failed', errorCode: 'network', soHdon: null, orderStatus: 'success' }),
          ],
        },
      },
    });
    render(<I18nProvider><AdminEinvoicesPage /></I18nProvider>);
    await waitFor(() => expect(screen.getByText('ISSUED-REFUNDED')).toBeInTheDocument());

    const issued = screen.getByText('ISSUED-REFUNDED').closest('tr');
    expect(within(issued).getByText('Đơn đã hoàn tiền — cần lập hoá đơn điều chỉnh trên Mắt Bão')).toBeInTheDocument();

    const stopped = screen.getByText('STOPPED-REFUNDED').closest('tr');
    expect(within(stopped).getByText('Đơn đã hoàn tiền — không xuất hoá đơn')).toBeInTheDocument();
    expect(within(stopped).queryByRole('button', { name: /Thử lại|Phát hành lại/ })).not.toBeInTheDocument();

    const control = screen.getByText('FAILED-SUCCESS').closest('tr');
    expect(within(control).queryByText(/Đơn đã hoàn tiền/)).not.toBeInTheDocument();
    expect(within(control).getByRole('button', { name: /Phát hành lại/ })).toBeInTheDocument();
    expect(screen.queryByText(/adminEinvoices\./)).not.toBeInTheDocument();
  });
});

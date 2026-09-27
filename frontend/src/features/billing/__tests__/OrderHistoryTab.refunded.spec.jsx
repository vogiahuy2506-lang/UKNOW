// PLAN_HOAN_TIEN_DON_HANG PR-3 — lịch sử đơn của khách hiện đơn đã hoàn tiền bằng CHỮ THẬT.
// t() trả nguyên khoá khi thiếu bản dịch, nên phải kiểm cả "không thấy khoá thô".
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider, useI18n } from '../../../i18n';
import OrderHistoryTab from '../OrderHistoryTab';

const { mockGetMyOrders } = vi.hoisted(() => ({ mockGetMyOrders: vi.fn() }));
vi.mock('../../auth/services/authApi.service', () => ({ getMyOrders: mockGetMyOrders }));

const Harness = () => {
  const { t } = useI18n();
  return <OrderHistoryTab isUserAdmin t={t} />;
};

const order = (overrides) => ({
  id: 1,
  orderCode: '179047104118544',
  amount: 299000,
  status: 'refunded',
  createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  kind: 'plan',
  plan: { name: 'Starter' },
  invoice: { status: 'failed' },
  ...overrides,
});

describe('OrderHistoryTab — đơn đã hoàn tiền', () => {
  it('hiện "Đã hoàn tiền" và hoá đơn "không xuất", không hiện "Xuất lỗi — hệ thống đang thử lại"', async () => {
    mockGetMyOrders.mockResolvedValue({ data: [order()] });
    render(<MemoryRouter><I18nProvider><Harness /></I18nProvider></MemoryRouter>);

    await waitFor(() => expect(mockGetMyOrders).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Đã hoàn tiền')).toBeInTheDocument());
    expect(screen.getByText('Đơn đã hoàn tiền — không xuất hoá đơn')).toBeInTheDocument();
    expect(screen.queryByText('Xuất lỗi — hệ thống đang thử lại')).not.toBeInTheDocument();
    expect(screen.queryByText(/^orders\.|invoiceVat\./)).not.toBeInTheDocument();
  });

  it('đơn thành công có hoá đơn failed vẫn hiện "Xuất lỗi — hệ thống đang thử lại" như cũ', async () => {
    mockGetMyOrders.mockResolvedValue({ data: [order({ status: 'success' })] });
    render(<MemoryRouter><I18nProvider><Harness /></I18nProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Xuất lỗi — hệ thống đang thử lại')).toBeInTheDocument());
    expect(screen.queryByText('Đã hoàn tiền')).not.toBeInTheDocument();
  });
});

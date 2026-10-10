import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import DashboardOrdersListTable from '../DashboardOrdersListTable';
import viTranslations from '../../../../i18n/vi';

/**
 * Nút "Xem hồ sơ khách hàng" ở ngăn chi tiết đơn từng điều hướng tới `/customers/...` (thiếu `/app`)
 * nên rơi vào trang không tồn tại. Phải đi tới `/app/customers/:campaignId/:customerId`.
 */
const getNested = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);
const mockT = (key, params) => {
  const val = getNested(viTranslations, key);
  if (typeof val !== 'string') return key;
  if (!params) return val;
  return Object.entries(params).reduce((str, [k, v]) => str.replace(`{${k}}`, v), val);
};

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({ t: mockT, locale: 'vi' }),
}));

vi.mock('../../../customers/services/customerApi.service', () => ({
  default: {
    getCustomerById: vi.fn(() => Promise.resolve({ data: { data: { id: 77, fullName: 'Khách A' } } })),
    getCustomerCampaignJourney: vi.fn(() => Promise.resolve({ data: { data: { emails: [], zaloMessages: [] } } })),
  },
}));

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const ordersData = {
  items: [
    {
      orderId: 501,
      productName: 'Khoá học thử',
      statusGroup: 'completed',
      campaignName: 'Chiến dịch X',
      campaignType: 'email',
      campaignId: 12,
      customerId: 77,
      amount: 100000,
      currency: 'VND',
      orderDate: '2026-10-01T10:00:00Z',
    },
  ],
  pagination: { page: 1, totalPages: 1, total: 1 },
};

describe('DashboardOrdersListTable — nút xem hồ sơ khách', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('điều hướng tới /app/customers/:campaignId/:customerId (có tiền tố /app)', async () => {
    render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <LocationProbe />
        <Routes>
          <Route
            path="*"
            element={(
              <DashboardOrdersListTable
                ordersData={ordersData}
                isLoadingOrders={false}
                ordersStatusFilter="all"
                onChangePage={() => {}}
              />
            )}
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Khoá học thử'));
    const button = await screen.findByText(viTranslations.ordersTable.viewCustomerProfile);
    fireEvent.click(button);

    expect(screen.getByTestId('location').textContent).toBe('/app/customers/12/77');
  });
});

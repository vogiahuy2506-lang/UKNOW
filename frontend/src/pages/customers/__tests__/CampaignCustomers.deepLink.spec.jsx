import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import CampaignCustomers from '../CampaignCustomers';
import customerApiService from '../../../features/customers/services/customerApi.service';

/**
 * Deep link `/app/customers/:campaignId/:customerId` (nút "xem khách" ở Dashboard) phải mở sẵn
 * modal chi tiết khách; trước đây trang bỏ qua `customerId` nên chỉ thấy danh sách.
 */
vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: (key) => key }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../features/customers/services/customerApi.service', () => ({
  default: {
    getCampaignById: vi.fn(),
    getCustomersByQueryString: vi.fn(),
    getCustomerById: vi.fn(),
    getCampaignZaloGroupMessages: vi.fn(),
  },
}));

// Modal thật gọi nhiều API hành trình; ở đây chỉ cần biết nó được mở cho đúng khách.
vi.mock('../../../features/customers/components/CampaignCustomerModals', () => ({
  CustomerDetailModal: ({ customer, isOpen, onClose }) => (
    isOpen ? (
      <div data-testid="customer-modal">
        <span data-testid="customer-modal-name">{customer?.fullName}</span>
        <button type="button" onClick={onClose}>dong</button>
      </div>
    ) : null
  ),
  JourneyModal: () => null,
}));

vi.mock('../../../features/customers/components/ZaloGroupMessageList', () => ({ default: () => null }));

const LocationProbe = () => <div data-testid="location">{useLocation().pathname}</div>;

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/app/customers/:campaignId" element={<CampaignCustomers />} />
        <Route path="/app/customers/:campaignId/:customerId" element={<CampaignCustomers />} />
      </Routes>
    </MemoryRouter>
  );

describe('CampaignCustomers — deep link mở modal khách', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerApiService.getCampaignById.mockResolvedValue({ data: { data: { campaignName: 'CD', campaignType: 'email' } } });
    customerApiService.getCustomersByQueryString.mockResolvedValue({
      data: { data: { items: [], pagination: { total: 0, totalPages: 1 } } },
    });
    customerApiService.getCustomerById.mockResolvedValue({ data: { data: { id: 77, fullName: 'Khách A' } } });
  });

  it('có customerId trên URL → tải khách và mở modal; đóng modal thì bỏ customerId khỏi URL', async () => {
    renderAt('/app/customers/12/77');

    expect(await screen.findByTestId('customer-modal')).toBeTruthy();
    expect(customerApiService.getCustomerById).toHaveBeenCalledWith('77');
    expect(screen.getByTestId('customer-modal-name').textContent).toBe('Khách A');

    fireEvent.click(screen.getByText('dong'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/app/customers/12'));
    expect(screen.queryByTestId('customer-modal')).toBeNull();
  });

  it('không có customerId → không gọi getCustomerById, không mở modal', async () => {
    renderAt('/app/customers/12');
    await waitFor(() => expect(customerApiService.getCustomersByQueryString).toHaveBeenCalled());
    expect(customerApiService.getCustomerById).not.toHaveBeenCalled();
    expect(screen.queryByTestId('customer-modal')).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CampaignCustomers from '../CampaignCustomers';
import customerApiService from '../../../features/customers/services/customerApi.service';

/**
 * PR-C3 việc 4 — danh sách khách trong chiến dịch: cột "Ngày tham gia" lấy ngày vào CHIẾN DỊCH (joined_at) thay vì
 * ngày tạo khách; phân trang theo `pagination.limit`; đổi trang/bộ lọc huỷ lượt cũ (AbortController).
 */
const mockT = vi.hoisted(() => (key, params) => (params ? `${key}${JSON.stringify(params)}` : key));
const mockCtx = vi.hoisted(() => ({ t: null }));
vi.mock('../../../i18n', () => ({ useI18n: () => mockCtx }));
mockCtx.t = mockT;

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../../features/customers/services/customerApi.service', () => ({
  default: {
    getCampaignById: vi.fn(),
    getCustomersByQueryString: vi.fn(),
    getCustomerById: vi.fn(),
    getCampaignZaloGroupMessages: vi.fn(),
  },
}));
vi.mock('../../../features/customers/components/CampaignCustomerModals', () => ({
  CustomerDetailModal: () => null,
  JourneyModal: () => null,
}));
vi.mock('../../../features/customers/components/ZaloGroupMessageList', () => ({ default: () => null }));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/app/customers/12']}>
      <Routes>
        <Route path="/app/customers/:campaignId" element={<CampaignCustomers />} />
      </Routes>
    </MemoryRouter>
  );

const respond = (items, pagination) => ({ data: { data: { items, pagination } } });

describe('CampaignCustomers — danh sách khách trong chiến dịch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customerApiService.getCampaignById.mockResolvedValue({ data: { data: { campaignName: 'CD', campaignType: 'email' } } });
  });

  it('"Ngày tham gia" lấy campaignJoinedAt (vào chiến dịch), không phải createdAt (tạo khách)', async () => {
    customerApiService.getCustomersByQueryString.mockResolvedValue(respond([
      { id: 1, fullName: 'Khách A', email: 'a@x.vn', createdAt: '2026-01-05T03:00:00.000Z', campaignJoinedAt: '2026-10-09T03:00:00.000Z' },
    ], { page: 1, limit: 20, total: 1, totalPages: 1 }));
    renderPage();
    await screen.findByText('Khách A');
    expect(screen.getByText('09/10/2026')).toBeTruthy();
    expect(screen.queryByText('05/01/2026')).toBeNull();
  });

  it('chưa có campaignJoinedAt (dữ liệu cũ) → dự phòng createdAt', async () => {
    customerApiService.getCustomersByQueryString.mockResolvedValue(respond([
      { id: 1, fullName: 'Khách A', createdAt: '2026-01-05T03:00:00.000Z' },
    ], { page: 1, limit: 20, total: 1, totalPages: 1 }));
    renderPage();
    await screen.findByText('Khách A');
    expect(screen.getByText('05/01/2026')).toBeTruthy();
  });

  it('phân trang dùng limit backend trả: "start–end" tính theo limit đó, không cứng 20', async () => {
    customerApiService.getCustomersByQueryString.mockResolvedValue(respond(
      [{ id: 1, fullName: 'Khách A' }],
      { page: 1, limit: 50, total: 120, totalPages: 3 },
    ));
    renderPage();
    await screen.findByText('Khách A');
    expect(screen.getByText('campaignCustomers.paginationInfo{"start":1,"end":50,"total":120}')).toBeTruthy();
  });

  it('gọi API kèm signal; đổi bộ lọc huỷ lượt trước', async () => {
    customerApiService.getCustomersByQueryString.mockResolvedValue(respond(
      [{ id: 1, fullName: 'Khách A' }], { page: 1, limit: 20, total: 1, totalPages: 1 },
    ));
    renderPage();
    await screen.findByText('Khách A');
    const [query, config] = customerApiService.getCustomersByQueryString.mock.calls[0];
    expect(query).toContain('campaignId=12');
    expect(query).toContain('limit=20');
    expect(config.signal).toBeInstanceOf(AbortSignal);

    fireEvent.change(screen.getByDisplayValue('campaignCustomers.consentSources.all'), { target: { value: 'form_submission' } });
    await waitFor(() => expect(customerApiService.getCustomersByQueryString.mock.calls.length).toBeGreaterThan(1));
    expect(config.signal.aborted).toBe(true);
    const lastQuery = customerApiService.getCustomersByQueryString.mock.calls.at(-1)[0];
    expect(lastQuery).toContain('consentSource=form_submission');
  });
});

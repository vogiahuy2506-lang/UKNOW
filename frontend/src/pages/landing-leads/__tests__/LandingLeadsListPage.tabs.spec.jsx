import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import LandingLeadsListPage from '../LandingLeadsListPage';
import useLandingLeadsList from '../../../features/landing/hooks/useLandingLeadsList.js';
import { fetchForms, fetchWorkspaceSubmissions } from '../../../features/forms/services/formAdminApi.service.js';
import { useAuthStore } from '../../../stores/authStore';

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: {} } }), post: vi.fn() },
  setAuthStore: vi.fn(),
}));
vi.mock('../../../features/landing/hooks/useLandingLeadsList.js');
vi.mock('../../../features/landing/services/landingLeadsAdminApi.service.js', () => ({
  fetchLandingLeadsCustomFieldDefinitions: vi.fn().mockResolvedValue([]),
  fetchLandingLeadsSlugOptions: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../features/forms/services/formAdminApi.service.js', () => ({
  fetchForms: vi.fn(),
  fetchWorkspaceSubmissions: vi.fn(),
}));

const landingLead = {
  id: 1,
  fullName: 'Khach Tu Landing',
  email: 'landing@example.com',
  phone: '0901111111',
  marketingConsent: true,
  consentWithdrawnAt: null,
  landingPageSlug: 'khoa-hoc-1',
};

const formSubmission = {
  id: 11,
  formId: 7,
  formTitle: 'Biểu mẫu tư vấn',
  respondentName: 'Khach Tu Bieu Mau',
  respondentEmail: 'form@example.com',
  respondentPhone: '0902222222',
  status: 'submitted',
  holdExpiresAt: null,
  marketingConsent: true,
  consentWithdrawnAt: null,
  landingPageSlug: 'workshop',
  utmSource: 'facebook',
  createdAt: '2026-10-10T03:00:00Z',
  answers: { k1: { label: 'Họ và tên', type: 'short_text', value: 'Khach Tu Bieu Mau' } },
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialEntry = '/app/landing-leads') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <I18nProvider>
        <LandingLeadsListPage />
        <LocationProbe />
      </I18nProvider>
    </MemoryRouter>
  );
}

const asOwner = () => useAuthStore.setState({ activeContext: { type: 'self' } });
const asEmployee = (permissions) =>
  useAuthStore.setState({ activeContext: { type: 'employee', ownerId: 9, permissions } });

beforeEach(() => {
  vi.clearAllMocks();
  useLandingLeadsList.mockReturnValue({
    draftFilters: {},
    setDraftFilters: vi.fn(),
    appliedFilters: {},
    applyFilters: vi.fn(),
    resetFilters: vi.fn(),
    exportExcel: vi.fn(),
    isExporting: false,
    page: 1,
    setPage: vi.fn(),
    items: [landingLead],
    pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    isLoading: false,
    errorMessage: null,
    reload: vi.fn(),
  });
  fetchForms.mockResolvedValue([{ id: 7, title: 'Biểu mẫu tư vấn', fields: [] }]);
  fetchWorkspaceSubmissions.mockResolvedValue({ items: [formSubmission], total: 1, page: 1, limit: 20 });
  asOwner();
});

describe('LandingLeadsListPage — màn "Khách để lại thông tin" gộp 2 tab', () => {
  it('tiêu đề trang là "Khách để lại thông tin"; chủ tài khoản thấy cả hai tab, mặc định tab "Từ landing page" với nội dung cũ', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Khách để lại thông tin' })).toBeInTheDocument();
    const landingTab = screen.getByRole('tab', { name: 'Từ landing page' });
    const formsTab = screen.getByRole('tab', { name: 'Từ biểu mẫu' });
    expect(landingTab).toHaveAttribute('aria-selected', 'true');
    expect(formsTab).toHaveAttribute('aria-selected', 'false');

    // Nội dung tab landing = trang cũ: bảng lead với cột "Đồng ý tiếp thị".
    expect(screen.getByText('Khach Tu Landing')).toBeInTheDocument();
    expect(screen.getByText('Đồng ý tiếp thị')).toBeInTheDocument();
    // Tab biểu mẫu chưa mở → không gọi API bài nộp.
    expect(fetchWorkspaceSubmissions).not.toHaveBeenCalled();
  });

  it('?tab=forms mở thẳng tab "Từ biểu mẫu" và không dựng tab landing', async () => {
    renderPage('/app/landing-leads?tab=forms');

    expect(screen.getByRole('tab', { name: 'Từ biểu mẫu' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Khach Tu Bieu Mau')).toBeInTheDocument();
    expect(fetchWorkspaceSubmissions).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Khach Tu Landing')).not.toBeInTheDocument();
    expect(useLandingLeadsList).not.toHaveBeenCalled();
  });

  it('bấm tab "Từ biểu mẫu" đổi nội dung và ghi ?tab=forms lên URL; bấm lại tab landing xoá ?tab', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('tab', { name: 'Từ biểu mẫu' }));
    expect(await screen.findByText('Khach Tu Bieu Mau')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/landing-leads?tab=forms');

    fireEvent.click(screen.getByRole('tab', { name: 'Từ landing page' }));
    expect(await screen.findByText('Khach Tu Landing')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/landing-leads$/);
  });

  it('?tab rác → rơi về tab landing', () => {
    renderPage('/app/landing-leads?tab=abc');

    expect(screen.getByRole('tab', { name: 'Từ landing page' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Khach Tu Landing')).toBeInTheDocument();
  });

  describe('ẩn tab theo quyền nhân viên', () => {
    it('chỉ có quyền leads → không có tab "Từ biểu mẫu"; ?tab=forms rơi về landing và KHÔNG gọi API bài nộp', async () => {
      asEmployee({ leads: true });
      renderPage('/app/landing-leads?tab=forms');

      expect(screen.queryByRole('tab', { name: 'Từ biểu mẫu' })).not.toBeInTheDocument();
      expect(screen.getByText('Khach Tu Landing')).toBeInTheDocument();
      // Đợi một nhịp để chắc không có lời gọi trễ.
      await waitFor(() => expect(fetchWorkspaceSubmissions).not.toHaveBeenCalled());
      expect(fetchForms).not.toHaveBeenCalled();
    });

    it('chỉ có quyền forms → không có tab landing, vào thẳng "Từ biểu mẫu" dù không có ?tab và KHÔNG gọi API khách landing', async () => {
      asEmployee({ forms: true });
      renderPage();

      expect(screen.queryByRole('tab', { name: 'Từ landing page' })).not.toBeInTheDocument();
      expect(await screen.findByText('Khach Tu Bieu Mau')).toBeInTheDocument();
      expect(useLandingLeadsList).not.toHaveBeenCalled();
      expect(screen.queryByText('Khach Tu Landing')).not.toBeInTheDocument();
    });

    it('có cả leads và forms → thấy cả hai tab', () => {
      asEmployee({ leads: true, forms: true });
      renderPage();

      expect(screen.getByRole('tab', { name: 'Từ landing page' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Từ biểu mẫu' })).toBeInTheDocument();
    });

    it('quyền khác (không leads, không forms) → không dựng tab nào', () => {
      asEmployee({ customers: true });
      renderPage();

      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
      expect(useLandingLeadsList).not.toHaveBeenCalled();
      expect(fetchWorkspaceSubmissions).not.toHaveBeenCalled();
    });
  });
});

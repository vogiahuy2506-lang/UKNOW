import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import LandingLeadsListPage from '../LandingLeadsListPage';
import useLandingLeadsList from '../../../features/landing/hooks/useLandingLeadsList.js';

vi.mock('../../../features/landing/hooks/useLandingLeadsList.js');
vi.mock('../../../features/landing/services/landingLeadsAdminApi.service.js', () => ({
  fetchLandingLeadsCustomFieldDefinitions: vi.fn().mockResolvedValue([]),
  fetchLandingLeadsSlugOptions: vi.fn().mockResolvedValue([]),
}));

const mockItems = [
  {
    id: 1,
    fullName: 'Nguyen Van A',
    email: 'a@example.com',
    phone: '0901111111',
    marketingConsent: true,
    consentWithdrawnAt: null,
    landingPageSlug: 'khoa-hoc-1',
  },
  {
    id: 2,
    fullName: 'Tran Van B',
    email: 'b@example.com',
    phone: '0902222222',
    marketingConsent: false,
    consentWithdrawnAt: null,
    landingPageSlug: 'khoa-hoc-1',
  },
  {
    id: 3,
    fullName: 'Le Van C',
    email: 'c@example.com',
    phone: '0903333333',
    marketingConsent: null,
    consentWithdrawnAt: null,
    landingPageSlug: 'khoa-hoc-1',
  },
  {
    id: 4,
    fullName: 'Pham Van D',
    email: 'd@example.com',
    phone: '0904444444',
    marketingConsent: false,
    consentWithdrawnAt: '2026-09-18T10:00:00Z',
    landingPageSlug: 'khoa-hoc-1',
  },
];

describe('LandingLeadsListPage (PR-1)', () => {
  it('hiển thị cột "Đồng ý tiếp thị" với 4 trạng thái: Có, Không, —, Đã rút', () => {
    useLandingLeadsList.mockReturnValue({
      draftFilters: {},
      setDraftFilters: vi.fn(),
      appliedFilters: {},
      effectiveFilters: {},
      applyFilters: vi.fn(),
      resetFilters: vi.fn(),
      exportExcel: vi.fn(),
      isExporting: false,
      page: 1,
      setPage: vi.fn(),
      items: mockItems,
      pagination: { total: 4, page: 1, pageSize: 20, totalPages: 1 },
      isLoading: false,
      errorMessage: null,
      reload: vi.fn(),
      groups: [{ slug: 'khoa-hoc-1', title: 'Khoá học 1', total: 4, latestAt: null, customKeys: [] }],
      groupDefs: [],
      groupsLoading: false,
      groupsError: '',
      selectedSlug: 'khoa-hoc-1',
      selectSlug: vi.fn(),
      reloadGroups: vi.fn(),
    });

    render(
      <MemoryRouter>
        <I18nProvider>
          <LandingLeadsListPage />
        </I18nProvider>
      </MemoryRouter>
    );

    // Quy định 11/2026: bấm vào thẻ landing mới mở modal chứa bảng.
    // Tiêu đề cột nằm trong modal, không còn ở ngoài trang.
    fireEvent.click(screen.getByRole('option', { name: /Khoá học 1/ }));

    // Tiêu đề cột
    expect(screen.getByText('Đồng ý tiếp thị')).toBeInTheDocument();

    // 4 trạng thái (bảng cột động có nhiều ô "—" ở nghề/lĩnh vực/custom → dùng getAllByText)
    expect(screen.getByText('Có')).toBeInTheDocument();
    expect(screen.getByText('Không')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Đã rút/)).toBeInTheDocument();
  });
});

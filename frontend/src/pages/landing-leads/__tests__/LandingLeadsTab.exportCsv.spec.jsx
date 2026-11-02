import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nProvider } from '../../../i18n';
import LandingLeadsTab from '../LandingLeadsTab';
import useLandingLeadsList from '../../../features/landing/hooks/useLandingLeadsList.js';
import { exportLandingLeadsAdminCsv } from '../../../features/landing/services/landingLeadsAdminApi.service.js';
import { downloadCsvFromRequest } from '../../../utils/csvExportDownload';

vi.mock('../../../features/landing/hooks/useLandingLeadsList.js');
vi.mock('../../../features/landing/services/landingLeadsAdminApi.service.js', () => ({
  fetchLandingLeadsCustomFieldDefinitions: vi.fn().mockResolvedValue([]),
  fetchLandingLeadsSlugOptions: vi.fn().mockResolvedValue([]),
  exportLandingLeadsAdminCsv: vi.fn(),
}));
vi.mock('../../../utils/csvExportDownload', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadCsvFromRequest: vi.fn(),
}));

const APPLIED = {
  landingLeadsUseDateRange: true,
  landingLeadsDateFrom: '2026-10-01',
  landingLeadsDateTo: '2026-10-05',
  landingLeadsOccupations: [],
  landingLeadsInterests: [],
  landingLeadsSlugs: ['khoa-hoc-1'],
  landingLeadsCustomFilters: [],
};

const EXPORT_REQUEST = Promise.resolve({ data: new Blob(['x']), headers: {} });

function mockList(overrides = {}) {
  useLandingLeadsList.mockReturnValue({
    draftFilters: {},
    setDraftFilters: vi.fn(),
    appliedFilters: APPLIED,
    effectiveFilters: { ...APPLIED, landingLeadsSlugs: ['khoa-hoc-1'] },
    applyFilters: vi.fn(),
    resetFilters: vi.fn(),
    exportExcel: vi.fn(),
    isExporting: false,
    page: 1,
    setPage: vi.fn(),
    items: [],
    pagination: { total: 0, page: 1, pageSize: 20, totalPages: 1 },
    isLoading: false,
    errorMessage: null,
    reload: vi.fn(),
    groups: [{ slug: 'khoa-hoc-1', title: 'Khoá học 1', total: 0, latestAt: null, customKeys: [] }],
    groupDefs: [],
    groupsLoading: false,
    groupsError: '',
    selectedSlug: 'khoa-hoc-1',
    selectSlug: vi.fn(),
    reloadGroups: vi.fn(),
    ...overrides,
  });
}

function renderTab() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <LandingLeadsTab />
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList();
  exportLandingLeadsAdminCsv.mockReturnValue(EXPORT_REQUEST);
  downloadCsvFromRequest.mockResolvedValue({ rowCount: 3, total: 3, truncated: false, filename: 'f.csv' });
});

describe('LandingLeadsTab — nút "Xuất CSV" (PR-8c)', () => {
  it('có cả "Xuất Excel" (sẵn có) lẫn "Xuất CSV"', () => {
    renderTab();
    expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeInTheDocument();
    expect(screen.getByTestId('landing-leads-export-csv')).toHaveTextContent('Xuất CSV');
  });

  it('bấm → xuất THEO THẺ ĐANG CHỌN (effectiveFilters), lang theo giao diện, rồi tải file', async () => {
    renderTab();

    fireEvent.click(screen.getByTestId('landing-leads-export-csv'));

    await waitFor(() => expect(downloadCsvFromRequest).toHaveBeenCalledTimes(1));
    expect(exportLandingLeadsAdminCsv).toHaveBeenCalledTimes(1);
    expect(exportLandingLeadsAdminCsv).toHaveBeenCalledWith(
      expect.objectContaining({ landingLeadsSlugs: ['khoa-hoc-1'] }),
      'vi'
    );
    expect(downloadCsvFromRequest).toHaveBeenCalledWith(EXPORT_REQUEST, 'khach-khoa-hoc-1.csv');
  });

  it('nút Excel sẵn có vẫn chạy đường cũ (không bị nút CSV chiếm)', async () => {
    const exportExcel = vi.fn().mockResolvedValue({ truncated: false });
    mockList({ exportExcel });
    renderTab();

    fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));

    await waitFor(() => expect(exportExcel).toHaveBeenCalledTimes(1));
    expect(exportLandingLeadsAdminCsv).not.toHaveBeenCalled();
  });
});

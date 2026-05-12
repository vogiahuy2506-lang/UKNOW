import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../services/landingLeadsAdminApi.service.js', () => ({
  fetchLandingLeadsAdminList: vi.fn(),
  downloadLandingLeadsAdminExportXlsx: vi.fn(),
}));

import toast from 'react-hot-toast';
import {
  fetchLandingLeadsAdminList,
  downloadLandingLeadsAdminExportXlsx,
} from '../../services/landingLeadsAdminApi.service.js';
import useLandingLeadsList from '../useLandingLeadsList';

beforeEach(() => {
  vi.clearAllMocks();
  fetchLandingLeadsAdminList.mockResolvedValue({
    items: [{ id: 1, email: 'a@b.com' }],
    pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
  });
  downloadLandingLeadsAdminExportXlsx.mockResolvedValue({ truncated: false });
});

describe('useLandingLeadsList — defaults & mount', () => {
  it('defaults: draftFilters/appliedFilters đồng bộ với defaultDraft, page=1, pageSize=20', async () => {
    const { result } = renderHook(() => useLandingLeadsList());
    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(20);
    expect(result.current.draftFilters).toEqual({
      landingLeadsUseDateRange: false,
      landingLeadsDateFrom: '',
      landingLeadsDateTo: '',
      landingLeadsOccupations: [],
      landingLeadsInterests: [],
      landingLeadsSlugs: [],
    });
    expect(result.current.appliedFilters).toEqual(result.current.draftFilters);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('mount → fetchLandingLeadsAdminList gọi với page+pageSize+appliedFilters spread', async () => {
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchLandingLeadsAdminList).toHaveBeenCalledTimes(1);
    const arg = fetchLandingLeadsAdminList.mock.calls[0][0];
    expect(arg.page).toBe(1);
    expect(arg.pageSize).toBe(20);
    expect(arg.landingLeadsUseDateRange).toBe(false);
    expect(arg.landingLeadsOccupations).toEqual([]);
  });

  it('success → set items + pagination', async () => {
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([{ id: 1, email: 'a@b.com' }]);
    expect(result.current.pagination.total).toBe(1);
  });

  it('items không phải array → []', async () => {
    fetchLandingLeadsAdminList.mockResolvedValueOnce({ items: 'oops', pagination: null });
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.pagination).toEqual({ total: 0, page: 1, pageSize: 20, totalPages: 1 });
  });
});

describe('useLandingLeadsList — error handling', () => {
  it('error có response.data.message → set errorMessage theo server', async () => {
    fetchLandingLeadsAdminList.mockRejectedValueOnce({
      response: { data: { message: 'Bị chặn' } },
    });
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.errorMessage).toBe('Bị chặn');
    expect(result.current.items).toEqual([]);
  });

  it('error không có response → fallback "Không thể tải danh sách"', async () => {
    fetchLandingLeadsAdminList.mockRejectedValueOnce({});
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.errorMessage).toBe('Không thể tải danh sách');
  });
});

describe('useLandingLeadsList — actions', () => {
  it('applyFilters → set appliedFilters = draftFilters + page=1 + reload', async () => {
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.setDraftFilters({
        landingLeadsUseDateRange: true,
        landingLeadsDateFrom: '2026-01-01',
        landingLeadsDateTo: '2026-01-31',
        landingLeadsOccupations: ['student'],
        landingLeadsInterests: ['react'],
        landingLeadsSlugs: ['lp1'],
      });
      result.current.setPage(3);
    });
    fetchLandingLeadsAdminList.mockClear();

    await act(async () => {
      result.current.applyFilters();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.appliedFilters.landingLeadsOccupations).toEqual(['student']);
    expect(result.current.page).toBe(1);
    const arg = fetchLandingLeadsAdminList.mock.calls.at(-1)[0];
    expect(arg.landingLeadsSlugs).toEqual(['lp1']);
    expect(arg.page).toBe(1);
  });

  it('setPage → reload với page mới', async () => {
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    fetchLandingLeadsAdminList.mockClear();

    await act(async () => {
      result.current.setPage(5);
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchLandingLeadsAdminList.mock.calls.at(-1)[0].page).toBe(5);
  });

  it('resetFilters → defaultDraft + page=1', async () => {
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.setDraftFilters({
        landingLeadsUseDateRange: true,
        landingLeadsDateFrom: '2026-01-01',
        landingLeadsDateTo: '',
        landingLeadsOccupations: ['x'],
        landingLeadsInterests: [],
        landingLeadsSlugs: [],
      });
      result.current.setPage(3);
    });

    await act(async () => {
      result.current.resetFilters();
    });
    expect(result.current.draftFilters.landingLeadsOccupations).toEqual([]);
    expect(result.current.appliedFilters.landingLeadsUseDateRange).toBe(false);
    expect(result.current.page).toBe(1);
  });

  it('reload là alias của load', async () => {
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    fetchLandingLeadsAdminList.mockClear();
    await act(async () => {
      await result.current.reload();
    });
    expect(fetchLandingLeadsAdminList).toHaveBeenCalledTimes(1);
  });
});

describe('useLandingLeadsList — exportToExcel', () => {
  it('success truncated=false → toast.success, không cảnh báo', async () => {
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.exportToExcel();
    });
    expect(downloadLandingLeadsAdminExportXlsx).toHaveBeenCalledWith(result.current.appliedFilters);
    expect(toast.success).toHaveBeenCalledWith('Đã tải file Excel.');
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('vượt 10.000'), expect.anything());
    expect(result.current.isExporting).toBe(false);
  });

  it('success truncated=true → toast warning kèm icon ⚠️', async () => {
    downloadLandingLeadsAdminExportXlsx.mockResolvedValueOnce({ truncated: true });
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.exportToExcel();
    });
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining('vượt 10.000'),
      expect.objectContaining({ icon: '⚠️' })
    );
  });

  it('error có response.data.message → toast.error theo server', async () => {
    downloadLandingLeadsAdminExportXlsx.mockRejectedValueOnce({
      response: { data: { message: 'Hết quota' } },
    });
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.exportToExcel();
    });
    expect(toast.error).toHaveBeenCalledWith('Hết quota');
    expect(result.current.isExporting).toBe(false);
  });

  it('error không response → fallback "Không thể xuất Excel"', async () => {
    downloadLandingLeadsAdminExportXlsx.mockRejectedValueOnce({});
    const { result } = renderHook(() => useLandingLeadsList());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.exportToExcel();
    });
    expect(toast.error).toHaveBeenCalledWith('Không thể xuất Excel');
  });
});

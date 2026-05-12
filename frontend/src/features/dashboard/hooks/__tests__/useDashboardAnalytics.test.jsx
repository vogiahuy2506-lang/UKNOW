import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../services/dashboardApi.service', () => ({
  default: {
    getOverview: vi.fn(),
    getAnalytics: vi.fn(),
    getRuns: vi.fn(),
    getOrders: vi.fn(),
    getTopLists: vi.fn(),
    getLandingPageStats: vi.fn(),
  },
}));

vi.mock('../../../campaigns/services/campaignApi.service', () => ({
  campaignApiService: {
    getCampaigns: vi.fn(),
  },
}));

import dashboardApiService from '../../services/dashboardApi.service';
import { campaignApiService } from '../../../campaigns/services/campaignApi.service';
import { useDashboardAnalytics } from '../useDashboardAnalytics';

const ok = (data) => ({ data: { data } });

const mockAllOk = (overrides = {}) => {
  dashboardApiService.getOverview.mockResolvedValue(ok(overrides.overview ?? { totalLeads: 100 }));
  dashboardApiService.getAnalytics.mockResolvedValue(ok(overrides.analytics ?? { rows: [] }));
  dashboardApiService.getRuns.mockResolvedValue(
    ok(overrides.runs ?? { items: [{ id: 1 }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
  );
  dashboardApiService.getOrders.mockResolvedValue(
    ok(overrides.orders ?? { items: [{ id: 9 }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
  );
  dashboardApiService.getTopLists.mockResolvedValue(
    ok(overrides.topLists ?? { topCourses: [{ id: 1 }], topCampaignsByOrders: [], topCampaignsByClicks: [] })
  );
  dashboardApiService.getLandingPageStats.mockResolvedValue(
    ok(overrides.lpStats ?? { filters: null, rows: [{ slug: 'x' }] })
  );
  campaignApiService.getCampaigns.mockResolvedValue(
    ok(overrides.campaigns ?? { items: [{ id: '7', campaignName: 'X', campaignType: 'email' }] })
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDashboardAnalytics — defaults', () => {
  it('default filters: startDate/endDate YYYY-MM-DD, campaignType="all", campaignIds=[]', async () => {
    mockAllOk();
    const { result } = renderHook(() => useDashboardAnalytics());
    expect(result.current.filters.campaignType).toBe('all');
    expect(result.current.filters.campaignIds).toEqual([]);
    expect(result.current.filters.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.current.filters.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.current.draftFilters).toEqual(result.current.filters);
    expect(result.current.activeChannel).toBe('all');
    expect(result.current.ordersStatusFilter).toBe('all');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('default range = 3 tháng: startDate là ngày 1 của tháng (currentMonth-2)', async () => {
    mockAllOk();
    const { result } = renderHook(() => useDashboardAnalytics());
    expect(result.current.filters.startDate.endsWith('-01')).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});

describe('useDashboardAnalytics — initial load', () => {
  it('mount → Promise.all gọi 6 endpoints + loadCampaignOptions', async () => {
    mockAllOk();
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(dashboardApiService.getOverview).toHaveBeenCalledTimes(1);
    expect(dashboardApiService.getAnalytics).toHaveBeenCalledTimes(1);
    expect(dashboardApiService.getRuns).toHaveBeenCalledTimes(1);
    expect(dashboardApiService.getOrders).toHaveBeenCalledTimes(1);
    expect(dashboardApiService.getTopLists).toHaveBeenCalledTimes(1);
    expect(dashboardApiService.getLandingPageStats).toHaveBeenCalledTimes(1);
    expect(campaignApiService.getCampaigns).toHaveBeenCalledWith({ page: 1, limit: 200 });
  });

  it('success → set state từ data', async () => {
    mockAllOk({
      overview: { totalLeads: 42 },
      analytics: { byChannel: [] },
      orders: { items: [{ id: 1 }, { id: 2 }], pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } },
    });
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.overview).toEqual({ totalLeads: 42 });
    expect(result.current.analytics).toEqual({ byChannel: [] });
    expect(result.current.ordersData.items).toHaveLength(2);
    expect(result.current.landingPageStats.rows).toHaveLength(1);
    expect(result.current.errorMessage).toBe('');
  });

  it('Promise.all lỗi → set errorMessage, isLoading=false', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    dashboardApiService.getOverview.mockRejectedValue(new Error('Server 500'));
    dashboardApiService.getAnalytics.mockResolvedValue(ok({}));
    dashboardApiService.getRuns.mockResolvedValue(ok({}));
    dashboardApiService.getOrders.mockResolvedValue(ok({}));
    dashboardApiService.getTopLists.mockResolvedValue(ok({}));
    dashboardApiService.getLandingPageStats.mockResolvedValue(ok({}));
    campaignApiService.getCampaigns.mockResolvedValue(ok({ items: [] }));

    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.errorMessage).toBe('Không thể tải dữ liệu dashboard. Vui lòng thử lại.');
    errorSpy.mockRestore();
  });

  it('response.data.data undefined → fallback EMPTY_ORDERS_DATA / EMPTY_TOP_LISTS / null', async () => {
    dashboardApiService.getOverview.mockResolvedValue({ data: {} });
    dashboardApiService.getAnalytics.mockResolvedValue({ data: {} });
    dashboardApiService.getRuns.mockResolvedValue({ data: {} });
    dashboardApiService.getOrders.mockResolvedValue({ data: {} });
    dashboardApiService.getTopLists.mockResolvedValue({ data: {} });
    dashboardApiService.getLandingPageStats.mockResolvedValue({ data: {} });
    campaignApiService.getCampaigns.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.overview).toBeNull();
    expect(result.current.analytics).toBeNull();
    expect(result.current.ordersData.items).toEqual([]);
    expect(result.current.topListsData.topCourses).toEqual([]);
    expect(result.current.landingPageStats).toEqual({ filters: null, rows: [] });
    expect(result.current.campaignOptions).toEqual([]);
  });
});

describe('useDashboardAnalytics — campaignOptions', () => {
  it('map items: id cast Number, label từ campaignName, campaignType giữ nguyên', async () => {
    mockAllOk({
      campaigns: {
        items: [
          { id: '1', campaignName: 'C1', campaignType: 'email' },
          { id: 2, campaignName: 'C2', campaignType: 'zalo' },
        ],
      },
    });
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.campaignOptions).toHaveLength(2));
    expect(result.current.campaignOptions[0]).toEqual({ id: 1, label: 'C1', campaignType: 'email' });
    expect(result.current.campaignOptions[1]).toEqual({ id: 2, label: 'C2', campaignType: 'zalo' });
  });

  it('campaignApiService lỗi → không crash, campaignOptions vẫn []', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAllOk();
    campaignApiService.getCampaigns.mockRejectedValueOnce(new Error('Forbidden'));
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.campaignOptions).toEqual([]);
    errorSpy.mockRestore();
  });
});

describe('useDashboardAnalytics — buildDashboardQueryParams', () => {
  it('campaignIds array → join "," khi gọi API', async () => {
    mockAllOk();
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    dashboardApiService.getOverview.mockClear();
    await act(async () => {
      result.current.setDraftFilters({
        ...result.current.draftFilters,
        campaignIds: [1, 2, 3],
        campaignType: 'email',
      });
    });
    await act(async () => {
      result.current.applyFilters();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(dashboardApiService.getOverview).toHaveBeenCalled();
    const lastCall = dashboardApiService.getOverview.mock.calls.at(-1)[0];
    expect(lastCall.campaignIds).toBe('1,2,3');
    expect(lastCall.campaignType).toBe('email');
  });

  it('landingPageStats luôn gọi với { allTime: 1 } không phụ thuộc filters', async () => {
    mockAllOk();
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(dashboardApiService.getLandingPageStats).toHaveBeenCalledWith({ allTime: 1 });
  });
});

describe('useDashboardAnalytics — applyFilters', () => {
  it('copy draftFilters → filters → trigger reload (useEffect filters)', async () => {
    mockAllOk();
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const callsBeforeApply = dashboardApiService.getOverview.mock.calls.length;
    await act(async () => {
      result.current.setDraftFilters({
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        campaignType: 'all',
        campaignIds: [],
      });
    });
    await act(async () => {
      result.current.applyFilters();
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.filters.startDate).toBe('2026-01-01');
    expect(result.current.filters.endDate).toBe('2026-03-31');
    expect(dashboardApiService.getOverview.mock.calls.length).toBeGreaterThan(callsBeforeApply);
  });
});

describe('useDashboardAnalytics — loadRunsPage', () => {
  it('gọi getRuns với page mới + limit từ runsData.pagination', async () => {
    mockAllOk({
      runs: { items: [], pagination: { page: 1, limit: 50, total: 100, totalPages: 2 } },
    });
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    dashboardApiService.getRuns.mockClear();
    dashboardApiService.getRuns.mockResolvedValueOnce(
      ok({ items: [{ id: 99 }], pagination: { page: 2, limit: 50, total: 100, totalPages: 2 } })
    );
    await act(async () => {
      await result.current.loadRunsPage(2);
    });

    expect(dashboardApiService.getRuns).toHaveBeenCalledTimes(1);
    const callArg = dashboardApiService.getRuns.mock.calls[0][0];
    expect(callArg.page).toBe(2);
    expect(callArg.limit).toBe(50);
    expect(result.current.runsData.items[0].id).toBe(99);
  });

  it('loadRunsPage lỗi → isLoadingRuns reset false, không crash', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAllOk();
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    dashboardApiService.getRuns.mockRejectedValueOnce(new Error('Boom'));
    await act(async () => {
      await result.current.loadRunsPage(2);
    });
    expect(result.current.isLoadingRuns).toBe(false);
    errorSpy.mockRestore();
  });
});

describe('useDashboardAnalytics — loadOrdersPage', () => {
  it('statusOverride truyền vào → set ordersStatusFilter + gọi API với status mới', async () => {
    mockAllOk();
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    dashboardApiService.getOrders.mockClear();
    dashboardApiService.getOrders.mockResolvedValueOnce(ok({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } }));

    await act(async () => {
      await result.current.loadOrdersPage(1, 'pending');
    });
    expect(result.current.ordersStatusFilter).toBe('pending');
    const callArg = dashboardApiService.getOrders.mock.calls[0][0];
    expect(callArg.orderStatus).toBe('pending');
    expect(callArg.page).toBe(1);
  });

  it('không truyền statusOverride → giữ status hiện tại', async () => {
    mockAllOk();
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loadOrdersPage(1, 'completed');
    });
    expect(result.current.ordersStatusFilter).toBe('completed');

    dashboardApiService.getOrders.mockClear();
    dashboardApiService.getOrders.mockResolvedValueOnce(ok(undefined));
    await act(async () => {
      await result.current.loadOrdersPage(2);
    });
    expect(dashboardApiService.getOrders.mock.calls[0][0].orderStatus).toBe('completed');
  });
});

describe('useDashboardAnalytics — setActiveChannel', () => {
  it('setActiveChannel cập nhật state', async () => {
    mockAllOk();
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.setActiveChannel('email');
    });
    expect(result.current.activeChannel).toBe('email');
  });
});

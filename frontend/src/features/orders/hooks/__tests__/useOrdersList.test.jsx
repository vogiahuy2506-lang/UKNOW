import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../services/ordersApi.service', () => ({
  default: {
    getOrders: vi.fn(),
  },
}));

vi.mock('../../../campaigns/services/campaignApi.service', () => ({
  campaignApiService: {
    getCampaigns: vi.fn(),
  },
}));

import ordersApiService from '../../services/ordersApi.service';
import { campaignApiService } from '../../../campaigns/services/campaignApi.service';
import useOrdersList from '../useOrdersList';

const ok = (data) => ({ data: { data } });

beforeEach(() => {
  vi.clearAllMocks();
  ordersApiService.getOrders.mockResolvedValue(
    ok({ items: [{ id: 1 }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })
  );
  campaignApiService.getCampaigns.mockResolvedValue(
    ok({ items: [{ id: '1', campaignName: 'C1', campaignType: 'email' }] })
  );
});

describe('useOrdersList — defaults', () => {
  it('filters mặc định: 3 tháng, campaignType="all", campaignIds=[]', async () => {
    const { result } = renderHook(() => useOrdersList());
    expect(result.current.filters.campaignType).toBe('all');
    expect(result.current.filters.campaignIds).toEqual([]);
    expect(result.current.filters.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.current.filters.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.current.filters.startDate.endsWith('-01')).toBe(true);
    expect(result.current.draftFilters).toEqual(result.current.filters);
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));
  });

  it('dateMode="quick", activeQuickKey="3m", ordersStatusFilter="all"', async () => {
    const { result } = renderHook(() => useOrdersList());
    expect(result.current.dateMode).toBe('quick');
    expect(result.current.activeQuickKey).toBe('3m');
    expect(result.current.ordersStatusFilter).toBe('all');
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));
  });
});

describe('useOrdersList — initial load', () => {
  it('mount → loadCampaignOptions + loadOrdersPage(1, "all")', async () => {
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));

    expect(campaignApiService.getCampaigns).toHaveBeenCalledWith({ page: 1, limit: 200 });
    expect(ordersApiService.getOrders).toHaveBeenCalledTimes(1);
    const callArg = ordersApiService.getOrders.mock.calls[0][0];
    expect(callArg.orderStatus).toBe('all');
    expect(callArg.page).toBe(1);
    expect(callArg.limit).toBe(20);
  });

  it('campaignOptions map: id cast Number + label từ campaignName', async () => {
    campaignApiService.getCampaigns.mockResolvedValueOnce(
      ok({
        items: [
          { id: '7', campaignName: 'Alpha', campaignType: 'email' },
          { id: 9, campaignName: 'Beta', campaignType: 'zalo' },
        ],
      })
    );
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.campaignOptions).toHaveLength(2));
    expect(result.current.campaignOptions[0]).toEqual({ id: 7, label: 'Alpha', campaignType: 'email' });
    expect(result.current.campaignOptions[1].id).toBe(9);
  });

  it('campaignApi lỗi → console.error nhưng không crash, isLoadingCampaigns reset', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    campaignApiService.getCampaigns.mockRejectedValueOnce(new Error('Forbidden'));
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.isLoadingCampaigns).toBe(false));
    expect(result.current.campaignOptions).toEqual([]);
    spy.mockRestore();
  });

  it('ordersApi response thiếu data → fallback EMPTY_ORDERS_DATA', async () => {
    ordersApiService.getOrders.mockResolvedValueOnce({ data: {} });
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));
    expect(result.current.ordersData.items).toEqual([]);
    expect(result.current.ordersData.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });

  it('ordersApi lỗi → set errorMessage', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    ordersApiService.getOrders.mockRejectedValueOnce(new Error('Boom'));
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));
    expect(result.current.errorMessage).toBe('Không thể tải danh sách đơn hàng. Vui lòng thử lại.');
    spy.mockRestore();
  });
});

describe('useOrdersList — loadOrdersPage', () => {
  it('statusOverride → set ordersStatusFilter + gọi API với status', async () => {
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));

    ordersApiService.getOrders.mockClear();
    await act(async () => {
      await result.current.loadOrdersPage(2, 'pending');
    });
    expect(result.current.ordersStatusFilter).toBe('pending');
    const arg = ordersApiService.getOrders.mock.calls[0][0];
    expect(arg.orderStatus).toBe('pending');
    expect(arg.page).toBe(2);
  });

  it('không truyền statusOverride → giữ status hiện tại', async () => {
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));

    await act(async () => {
      await result.current.loadOrdersPage(1, 'completed');
    });
    expect(result.current.ordersStatusFilter).toBe('completed');

    ordersApiService.getOrders.mockClear();
    await act(async () => {
      await result.current.loadOrdersPage(3);
    });
    expect(ordersApiService.getOrders.mock.calls[0][0].orderStatus).toBe('completed');
  });

  it('filtersOverride → params dùng filters mới chứ không phải state filters', async () => {
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));

    ordersApiService.getOrders.mockClear();
    await act(async () => {
      await result.current.loadOrdersPage(1, 'all', {
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        campaignType: 'zalo',
        campaignIds: [10, 11],
      });
    });
    const arg = ordersApiService.getOrders.mock.calls[0][0];
    expect(arg.startDate).toBe('2026-04-01');
    expect(arg.endDate).toBe('2026-04-30');
    expect(arg.campaignType).toBe('zalo');
    expect(arg.campaignIds).toBe('10,11');
  });

  it('lỗi → set errorMessage + isLoadingOrders false', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));

    ordersApiService.getOrders.mockRejectedValueOnce(new Error('Server'));
    await act(async () => {
      await result.current.loadOrdersPage(2);
    });
    expect(result.current.errorMessage).toBe('Không thể tải danh sách đơn hàng. Vui lòng thử lại.');
    expect(result.current.isLoadingOrders).toBe(false);
    spy.mockRestore();
  });
});

describe('useOrdersList — applyFilters', () => {
  it('set filters = draftFilters + reset status="all" + fetch page 1', async () => {
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));

    await act(async () => {
      result.current.setDraftFilters({
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        campaignType: 'email',
        campaignIds: [5, 6],
      });
    });
    await act(async () => {
      result.current.loadOrdersPage(1, 'pending');
    });
    expect(result.current.ordersStatusFilter).toBe('pending');

    ordersApiService.getOrders.mockClear();
    await act(async () => {
      await result.current.applyFilters();
    });
    expect(result.current.filters.startDate).toBe('2026-02-01');
    expect(result.current.filters.campaignType).toBe('email');
    expect(result.current.ordersStatusFilter).toBe('all');

    const arg = ordersApiService.getOrders.mock.calls.at(-1)[0];
    expect(arg.orderStatus).toBe('all');
    expect(arg.page).toBe(1);
    expect(arg.campaignIds).toBe('5,6');
  });

  it('applyFilters lỗi → set errorMessage', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));

    ordersApiService.getOrders.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await result.current.applyFilters();
    });
    expect(result.current.errorMessage).toBe('Không thể tải danh sách đơn hàng. Vui lòng thử lại.');
    spy.mockRestore();
  });
});

describe('useOrdersList — date/quick mode setters', () => {
  it('setDateMode + setActiveQuickKey cập nhật state', async () => {
    const { result } = renderHook(() => useOrdersList());
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));
    await act(async () => {
      result.current.setDateMode('range');
      result.current.setActiveQuickKey('1m');
    });
    expect(result.current.dateMode).toBe('range');
    expect(result.current.activeQuickKey).toBe('1m');
  });
});

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/dashboardApi.service', () => ({
  default: {
    getOverview: vi.fn(),
    getAnalytics: vi.fn(),
    getCampaigns: vi.fn(),
    getOrders: vi.fn(),
  },
}));

vi.mock('../../../campaigns/services/campaignApi.service', () => ({
  campaignApiService: {
    getCampaigns: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }),
  },
}));

import dashboardApiService from '../../services/dashboardApi.service';
import { useDashboardAnalytics } from '../useDashboardAnalytics';

const ok = (data) => Promise.resolve({ data: { data } });

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30 — `/dashboard/orders` có requireSelfContext (chỉ chủ),
 * còn các API kia chỉ cần reports_view. Nhân viên có reports_view nhận 403 ở orders; trước sửa
 * lỗi đó rơi vào Promise.all nên CẢ trang Báo cáo về 0 (khách thật 233, 2 nhân viên).
 * PR-5: trang chỉ còn 3 API số liệu (overview, analytics, campaigns) + danh sách đơn của chủ.
 */
describe('useDashboardAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardApiService.getOverview.mockImplementation(() => ok({ sent: { total: 7 } }));
    dashboardApiService.getAnalytics.mockImplementation(() => ok({ dailySent: [{ date: '2026-09-30', total: 7 }], ordersTimeline: [] }));
    dashboardApiService.getCampaigns.mockImplementation(() => ok({ items: [{ campaignId: 1, campaignName: 'A', sent: 7 }] }));
  });

  it('orders trả 403 -> các số còn lại vẫn hiện, không báo lỗi cả trang, bảng đơn rỗng', async () => {
    const forbidden = Object.assign(new Error('Forbidden'), { response: { status: 403 } });
    dashboardApiService.getOrders.mockImplementation(() => Promise.reject(forbidden));

    const { result } = renderHook(() => useDashboardAnalytics());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.overview).not.toBeNull());

    expect(result.current.overview.sent.total).toBe(7);
    expect(result.current.analytics.dailySent).toHaveLength(1);
    expect(result.current.campaignsData).toHaveLength(1);
    expect(result.current.errorMessage).toBe('');
    expect(result.current.ordersData.items).toEqual([]);
  });

  it('chủ tài khoản (orders thành công) -> vẫn nhận danh sách đơn như cũ', async () => {
    dashboardApiService.getOrders.mockImplementation(() => ok({
      items: [{ id: 99 }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    }));

    const { result } = renderHook(() => useDashboardAnalytics());

    await waitFor(() => expect(result.current.ordersData.items).toHaveLength(1));
    expect(result.current.ordersData.items[0].id).toBe(99);
    expect(result.current.errorMessage).toBe('');
  });

  it('includeOrders=false (nhân viên) -> KHÔNG gọi /dashboard/orders, các số công ty vẫn hiện', async () => {
    const { result } = renderHook(() => useDashboardAnalytics({ includeOrders: false }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.overview).not.toBeNull());

    expect(dashboardApiService.getOrders).not.toHaveBeenCalled();
    expect(result.current.overview.sent.total).toBe(7);
    expect(result.current.ordersData.items).toEqual([]);
    expect(result.current.errorMessage).toBe('');
  });

  it('bảng chiến dịch xin 10 dòng cùng bộ lọc với thẻ', async () => {
    dashboardApiService.getOrders.mockImplementation(() => ok({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } }));
    const { result } = renderHook(() => useDashboardAnalytics());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const overviewParams = dashboardApiService.getOverview.mock.calls[0][0];
    expect(dashboardApiService.getCampaigns).toHaveBeenCalledWith({ ...overviewParams, limit: 10 });
    expect(dashboardApiService.getAnalytics.mock.calls[0][0]).toEqual(overviewParams);
  });

  it('API chính (overview) lỗi -> vẫn báo lỗi cả trang như trước (không nuốt lỗi thật)', async () => {
    dashboardApiService.getOrders.mockImplementation(() => ok({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } }));
    dashboardApiService.getOverview.mockImplementation(() => Promise.reject(new Error('boom')));

    const { result } = renderHook(() => useDashboardAnalytics());

    await waitFor(() => expect(result.current.errorMessage).not.toBe(''));
  });
});

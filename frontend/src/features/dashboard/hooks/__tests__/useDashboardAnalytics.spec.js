import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    getCampaigns: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }),
  },
}));

import dashboardApiService from '../../services/dashboardApi.service';
import { useDashboardAnalytics } from '../useDashboardAnalytics';

const ok = (data) => Promise.resolve({ data: { data } });

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30 — `/dashboard/orders` có requireSelfContext (chỉ chủ),
 * còn 5 API kia chỉ cần reports_view. Nhân viên có reports_view nhận 403 ở orders; trước sửa
 * lỗi đó rơi vào Promise.all nên CẢ trang Báo cáo về 0 (khách thật 233, 2 nhân viên).
 */
describe('useDashboardAnalytics — nhân viên bị 403 ở danh sách đơn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardApiService.getOverview.mockImplementation(() => ok({ headline: { totalCampaigns: 7 } }));
    dashboardApiService.getAnalytics.mockImplementation(() => ok({ timeline: [{ date: '2026-09-30' }] }));
    dashboardApiService.getRuns.mockImplementation(() => ok({ items: [{ id: 1 }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }));
    dashboardApiService.getTopLists.mockImplementation(() => ok({ topCourses: [], topCampaignsByOrders: [], topCampaignsByClicks: [] }));
    dashboardApiService.getLandingPageStats.mockImplementation(() => ok({ filters: null, rows: [] }));
  });

  it('orders trả 403 -> các số còn lại vẫn hiện, không báo lỗi cả trang, bảng đơn rỗng', async () => {
    const forbidden = Object.assign(new Error('Forbidden'), { response: { status: 403 } });
    dashboardApiService.getOrders.mockImplementation(() => Promise.reject(forbidden));

    const { result } = renderHook(() => useDashboardAnalytics());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.overview).not.toBeNull());

    expect(result.current.overview.headline.totalCampaigns).toBe(7);
    expect(result.current.analytics.timeline).toHaveLength(1);
    expect(result.current.runsData.items).toHaveLength(1);
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

  it('API chính (overview) lỗi -> vẫn báo lỗi cả trang như trước (không nuốt lỗi thật)', async () => {
    dashboardApiService.getOrders.mockImplementation(() => ok({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } }));
    dashboardApiService.getOverview.mockImplementation(() => Promise.reject(new Error('boom')));

    const { result } = renderHook(() => useDashboardAnalytics());

    await waitFor(() => expect(result.current.errorMessage).not.toBe(''));
  });
});

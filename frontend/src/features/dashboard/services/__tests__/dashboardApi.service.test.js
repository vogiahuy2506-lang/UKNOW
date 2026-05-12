import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../services/api';
import dashboardApiService from '../dashboardApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dashboardApiService — read endpoints', () => {
  it('getOverview → GET /dashboard/overview với params', () => {
    api.get.mockReturnValueOnce(Promise.resolve({ data: {} }));
    dashboardApiService.getOverview({ period: '7d' });
    expect(api.get).toHaveBeenCalledWith('/dashboard/overview', { params: { period: '7d' } });
  });

  it('getOverview không tham số → params rỗng', () => {
    api.get.mockReturnValueOnce(Promise.resolve({ data: {} }));
    dashboardApiService.getOverview();
    expect(api.get).toHaveBeenCalledWith('/dashboard/overview', { params: {} });
  });

  it('getAnalytics → GET /dashboard/analytics', () => {
    api.get.mockReturnValueOnce(Promise.resolve({ data: {} }));
    dashboardApiService.getAnalytics({ from: '2026-01-01' });
    expect(api.get).toHaveBeenCalledWith('/dashboard/analytics', { params: { from: '2026-01-01' } });
  });

  it('getRuns → GET /dashboard/runs', () => {
    api.get.mockReturnValueOnce(Promise.resolve({ data: {} }));
    dashboardApiService.getRuns({ limit: 10 });
    expect(api.get).toHaveBeenCalledWith('/dashboard/runs', { params: { limit: 10 } });
  });

  it('getOrders → GET /dashboard/orders với orderStatus', () => {
    api.get.mockReturnValueOnce(Promise.resolve({ data: {} }));
    dashboardApiService.getOrders({ orderStatus: 'pending' });
    expect(api.get).toHaveBeenCalledWith('/dashboard/orders', {
      params: { orderStatus: 'pending' },
    });
  });

  it('getTopLists → GET /dashboard/top-lists với limit', () => {
    api.get.mockReturnValueOnce(Promise.resolve({ data: {} }));
    dashboardApiService.getTopLists({ limit: 5 });
    expect(api.get).toHaveBeenCalledWith('/dashboard/top-lists', { params: { limit: 5 } });
  });

  it('getLandingPageStats → GET /dashboard/landing-pages-stats', () => {
    api.get.mockReturnValueOnce(Promise.resolve({ data: {} }));
    dashboardApiService.getLandingPageStats({ period: 'all', allTime: 1 });
    expect(api.get).toHaveBeenCalledWith('/dashboard/landing-pages-stats', {
      params: { period: 'all', allTime: 1 },
    });
  });

  it('getSavedInsight → GET /dashboard/insights/saved (no params)', () => {
    api.get.mockReturnValueOnce(Promise.resolve({ data: {} }));
    dashboardApiService.getSavedInsight();
    expect(api.get).toHaveBeenCalledWith('/dashboard/insights/saved');
  });
});

describe('dashboardApiService — generateInsights', () => {
  it('POST /dashboard/insights với payload + timeout 120s override', () => {
    api.post.mockReturnValueOnce(Promise.resolve({ data: {} }));
    const payload = { overview: {}, analytics: {}, topListsData: {} };
    dashboardApiService.generateInsights(payload);
    expect(api.post).toHaveBeenCalledWith('/dashboard/insights', payload, { timeout: 120000 });
  });

  it('return Promise từ api.post', async () => {
    const expected = { data: { insights: {} } };
    api.post.mockReturnValueOnce(Promise.resolve(expected));
    const out = await dashboardApiService.generateInsights({});
    expect(out).toBe(expected);
  });
});

describe('dashboardApiService — return types', () => {
  it('các method GET đều return Promise từ api.get', async () => {
    const expected = { data: { success: true } };
    api.get.mockResolvedValueOnce(expected);
    const out = await dashboardApiService.getOverview();
    expect(out).toBe(expected);
  });
});

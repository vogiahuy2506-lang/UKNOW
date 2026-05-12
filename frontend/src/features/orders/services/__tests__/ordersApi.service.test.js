import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: { get: vi.fn() },
}));

import api from '../../../../services/api';
import ordersApiService from '../ordersApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ordersApiService', () => {
  it('getOrders default → /dashboard/orders với params {}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    ordersApiService.getOrders();
    expect(api.get).toHaveBeenCalledWith('/dashboard/orders', { params: {} });
  });

  it('getOrders forward params đầy đủ (date range + campaignIds + status + paging)', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    const params = {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      campaignIds: '1,2,3',
      campaignType: 'email',
      orderStatus: 'pending',
      page: 2,
      limit: 50,
    };
    ordersApiService.getOrders(params);
    expect(api.get).toHaveBeenCalledWith('/dashboard/orders', { params });
  });

  it('return value chính là promise của api.get', () => {
    const p = Promise.resolve({ data: { items: [] } });
    api.get.mockReturnValueOnce(p);
    const ret = ordersApiService.getOrders({});
    expect(ret).toBe(p);
  });
});

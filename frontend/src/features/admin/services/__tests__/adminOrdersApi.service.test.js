import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import api from '../../../../services/api';
import adminOrdersApiService from '../adminOrdersApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adminOrdersApiService', () => {
  it('getOrders → /admin/orders với params', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    adminOrdersApiService.getOrders({ page: 2, status: 'pending' });
    expect(api.get).toHaveBeenCalledWith('/admin/orders', { params: { page: 2, status: 'pending' } });
  });

  it('getOrders không params → params undefined', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    adminOrdersApiService.getOrders();
    expect(api.get).toHaveBeenCalledWith('/admin/orders', { params: undefined });
  });

  it('cancelOrder → PATCH /admin/orders/{code}/cancel', () => {
    api.patch.mockReturnValueOnce(Promise.resolve({}));
    adminOrdersApiService.cancelOrder('ORD-2026-001');
    expect(api.patch).toHaveBeenCalledWith('/admin/orders/ORD-2026-001/cancel');
  });
});

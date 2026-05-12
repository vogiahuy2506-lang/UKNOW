import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: { get: vi.fn() },
}));

import api from '../../../../services/api';
import adminStatsApiService from '../adminStatsApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adminStatsApiService', () => {
  it('getOverview → GET /admin/stats/overview (no params)', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    adminStatsApiService.getOverview();
    expect(api.get).toHaveBeenCalledWith('/admin/stats/overview');
  });

  it('return value chính là promise của api.get', () => {
    const p = Promise.resolve({ data: { totalMembers: 100 } });
    api.get.mockReturnValueOnce(p);
    expect(adminStatsApiService.getOverview()).toBe(p);
  });
});

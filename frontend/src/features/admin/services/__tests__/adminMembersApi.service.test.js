import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import api from '../../../../services/api';
import adminMembersApiService from '../adminMembersApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adminMembersApiService', () => {
  it('getMembers default → /admin/members với params {}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    adminMembersApiService.getMembers();
    expect(api.get).toHaveBeenCalledWith('/admin/members', { params: {} });
  });

  it('getMembers với params (search + page)', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    adminMembersApiService.getMembers({ search: 'an', page: 3, limit: 30 });
    expect(api.get).toHaveBeenCalledWith('/admin/members', {
      params: { search: 'an', page: 3, limit: 30 },
    });
  });

  it('toggleStatus → PATCH /admin/members/{id}/status (no body)', () => {
    api.patch.mockReturnValueOnce(Promise.resolve({}));
    adminMembersApiService.toggleStatus(7);
    expect(api.patch).toHaveBeenCalledWith('/admin/members/7/status');
  });

  it('promote → PATCH /admin/members/{id}/promote (no body)', () => {
    api.patch.mockReturnValueOnce(Promise.resolve({}));
    adminMembersApiService.promote(7);
    expect(api.patch).toHaveBeenCalledWith('/admin/members/7/promote');
  });
});

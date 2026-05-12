import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../services/api';
import adminPlansApiService from '../adminPlansApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adminPlansApiService — reads', () => {
  it('getPlans → GET /admin/plans (no params)', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    adminPlansApiService.getPlans();
    expect(api.get).toHaveBeenCalledWith('/admin/plans');
  });

  it('getCustomPlans default → params {}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    adminPlansApiService.getCustomPlans();
    expect(api.get).toHaveBeenCalledWith('/admin/plans/custom-list', { params: {} });
  });

  it('getCustomPlans showHidden=true → params { showHidden: "true" }', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    adminPlansApiService.getCustomPlans(true);
    expect(api.get).toHaveBeenCalledWith('/admin/plans/custom-list', {
      params: { showHidden: 'true' },
    });
  });

  it('searchUsers default excludeWithPlan=false → params chỉ có q', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    adminPlansApiService.searchUsers('an');
    expect(api.get).toHaveBeenCalledWith('/admin/plans/search-users', {
      params: { q: 'an' },
    });
  });

  it('searchUsers excludeWithPlan=true → params kèm excludeWithPlan="true"', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    adminPlansApiService.searchUsers('an', true);
    expect(api.get).toHaveBeenCalledWith('/admin/plans/search-users', {
      params: { q: 'an', excludeWithPlan: 'true' },
    });
  });
});

describe('adminPlansApiService — writes', () => {
  it('createPlan → POST /admin/plans với payload', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    adminPlansApiService.createPlan({ name: 'Pro' });
    expect(api.post).toHaveBeenCalledWith('/admin/plans', { name: 'Pro' });
  });

  it('createCustomPlan → POST /admin/plans/custom với payload', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    adminPlansApiService.createCustomPlan({ userEmail: 'a@b' });
    expect(api.post).toHaveBeenCalledWith('/admin/plans/custom', { userEmail: 'a@b' });
  });

  it('createCustomPlanWithPayment → POST /admin/plans/custom-with-payment', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    adminPlansApiService.createCustomPlanWithPayment({ amount: 100000 });
    expect(api.post).toHaveBeenCalledWith('/admin/plans/custom-with-payment', { amount: 100000 });
  });

  it('updatePlan → PATCH /admin/plans/{id}', () => {
    api.patch.mockReturnValueOnce(Promise.resolve({}));
    adminPlansApiService.updatePlan(7, { name: 'Updated' });
    expect(api.patch).toHaveBeenCalledWith('/admin/plans/7', { name: 'Updated' });
  });

  it('deletePlan → DELETE /admin/plans/{id}', () => {
    api.delete.mockReturnValueOnce(Promise.resolve({}));
    adminPlansApiService.deletePlan(7);
    expect(api.delete).toHaveBeenCalledWith('/admin/plans/7');
  });

  it('assignPlan → POST /admin/plans/{id}/assign với { userEmail }', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    adminPlansApiService.assignPlan(7, 'a@b.com');
    expect(api.post).toHaveBeenCalledWith('/admin/plans/7/assign', { userEmail: 'a@b.com' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../services/api.js';
import {
  fetchLandingPagesAdminList,
  fetchLandingPageAdminById,
  createLandingPageAdmin,
  updateLandingPageAdmin,
  deleteLandingPageAdmin,
  fetchLandingPagesDashboardStats,
} from '../landingPagesAdminApi.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchLandingPagesAdminList', () => {
  it('data.data là array → trả array', async () => {
    api.get.mockResolvedValueOnce({ data: { data: [{ id: 1 }, { id: 2 }] } });
    const out = await fetchLandingPagesAdminList();
    expect(out).toEqual([{ id: 1 }, { id: 2 }]);
    expect(api.get).toHaveBeenCalledWith('/admin/landing-pages');
  });

  it('data.data không phải array → trả []', async () => {
    api.get.mockResolvedValueOnce({ data: { data: null } });
    const out = await fetchLandingPagesAdminList();
    expect(out).toEqual([]);
  });

  it('data null/undefined → trả []', async () => {
    api.get.mockResolvedValueOnce({});
    const out = await fetchLandingPagesAdminList();
    expect(out).toEqual([]);
  });
});

describe('fetchLandingPageAdminById', () => {
  it('success=true + data → trả data', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: { id: 5, slug: 'x' } } });
    const out = await fetchLandingPageAdminById(5);
    expect(out).toEqual({ id: 5, slug: 'x' });
    expect(api.get).toHaveBeenCalledWith('/admin/landing-pages/5');
  });

  it('success=false → throw kèm message server', async () => {
    api.get.mockResolvedValueOnce({ data: { success: false, message: 'Not found' } });
    await expect(fetchLandingPageAdminById(5)).rejects.toThrow('Not found');
  });

  it('success=true nhưng data null → throw fallback', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: null } });
    await expect(fetchLandingPageAdminById(5)).rejects.toThrow('Không tải được');
  });
});

describe('createLandingPageAdmin', () => {
  it('success=true + data → trả data', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, data: { id: 1 } } });
    const out = await createLandingPageAdmin({ slug: 'x' });
    expect(out).toEqual({ id: 1 });
    expect(api.post).toHaveBeenCalledWith('/admin/landing-pages', { slug: 'x' });
  });

  it('success=false → throw kèm message', async () => {
    api.post.mockResolvedValueOnce({ data: { success: false, message: 'Slug taken' } });
    await expect(createLandingPageAdmin({ slug: 'x' })).rejects.toThrow('Slug taken');
  });

  it('data thiếu → throw fallback', async () => {
    api.post.mockResolvedValueOnce({ data: { success: true } });
    await expect(createLandingPageAdmin({})).rejects.toThrow('Không tạo được');
  });
});

describe('updateLandingPageAdmin', () => {
  it('success=true + data → trả data', async () => {
    api.put.mockResolvedValueOnce({ data: { success: true, data: { id: 5 } } });
    const out = await updateLandingPageAdmin(5, { slug: 'y' });
    expect(out).toEqual({ id: 5 });
    expect(api.put).toHaveBeenCalledWith('/admin/landing-pages/5', { slug: 'y' });
  });

  it('success=false → throw kèm message', async () => {
    api.put.mockResolvedValueOnce({ data: { success: false, message: 'Validation error' } });
    await expect(updateLandingPageAdmin(5, {})).rejects.toThrow('Validation error');
  });

  it('data thiếu → throw fallback', async () => {
    api.put.mockResolvedValueOnce({ data: { success: true } });
    await expect(updateLandingPageAdmin(5, {})).rejects.toThrow('Không cập nhật được');
  });
});

describe('deleteLandingPageAdmin', () => {
  it('gọi DELETE /admin/landing-pages/{id}', async () => {
    api.delete.mockResolvedValueOnce({});
    await deleteLandingPageAdmin(7);
    expect(api.delete).toHaveBeenCalledWith('/admin/landing-pages/7');
  });
});

describe('fetchLandingPagesDashboardStats', () => {
  it('không params → params {}, filters/rows lấy từ data.data', async () => {
    api.get.mockResolvedValueOnce({
      data: { data: { filters: { period: 'week' }, rows: [{ slug: 'x' }] } },
    });
    const out = await fetchLandingPagesDashboardStats();
    expect(api.get).toHaveBeenCalledWith('/dashboard/landing-pages-stats', { params: {} });
    expect(out).toEqual({ filters: { period: 'week' }, rows: [{ slug: 'x' }] });
  });

  it('rows không phải array → rows = []', async () => {
    api.get.mockResolvedValueOnce({ data: { data: { filters: { a: 1 }, rows: 'oops' } } });
    const out = await fetchLandingPagesDashboardStats({ period: 'month' });
    expect(api.get).toHaveBeenCalledWith('/dashboard/landing-pages-stats', { params: { period: 'month' } });
    expect(out.rows).toEqual([]);
    expect(out.filters).toEqual({ a: 1 });
  });

  it('data hoàn toàn rỗng → filters {} rows []', async () => {
    api.get.mockResolvedValueOnce({});
    const out = await fetchLandingPagesDashboardStats();
    expect(out).toEqual({ filters: {}, rows: [] });
  });
});

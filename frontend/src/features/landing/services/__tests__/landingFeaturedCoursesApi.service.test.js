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
  fetchPublicLandingFeaturedCourses,
  fetchAdminLandingFeaturedCourses,
  createLandingFeaturedCourse,
  updateLandingFeaturedCourse,
  deleteLandingFeaturedCourse,
} from '../landingFeaturedCoursesApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchPublicLandingFeaturedCourses', () => {
  it('success + data là array → trả nguyên array', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: [{ id: 1 }, { id: 2 }] } });
    const out = await fetchPublicLandingFeaturedCourses();
    expect(api.get).toHaveBeenCalledWith('/public/landing-featured-courses');
    expect(out).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('success=false → []', async () => {
    api.get.mockResolvedValueOnce({ data: { success: false, data: [{ id: 1 }] } });
    expect(await fetchPublicLandingFeaturedCourses()).toEqual([]);
  });

  it('data không phải array → []', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: 'x' } });
    expect(await fetchPublicLandingFeaturedCourses()).toEqual([]);
  });

  it('response thiếu data → []', async () => {
    api.get.mockResolvedValueOnce({});
    expect(await fetchPublicLandingFeaturedCourses()).toEqual([]);
  });
});

describe('fetchAdminLandingFeaturedCourses', () => {
  it('gọi endpoint /admin/landing-featured-courses, trả array', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: [{ id: 9 }] } });
    const out = await fetchAdminLandingFeaturedCourses();
    expect(api.get).toHaveBeenCalledWith('/admin/landing-featured-courses');
    expect(out).toEqual([{ id: 9 }]);
  });

  it('không success → []', async () => {
    api.get.mockResolvedValueOnce({ data: {} });
    expect(await fetchAdminLandingFeaturedCourses()).toEqual([]);
  });
});

describe('createLandingFeaturedCourse', () => {
  it('POST /admin/... với payload, trả data.data', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { id: 11, title: 'New' } } });
    const out = await createLandingFeaturedCourse({ title: 'New' });
    expect(api.post).toHaveBeenCalledWith('/admin/landing-featured-courses', { title: 'New' });
    expect(out).toEqual({ id: 11, title: 'New' });
  });

  it('response thiếu data.data → undefined', async () => {
    api.post.mockResolvedValueOnce({ data: null });
    expect(await createLandingFeaturedCourse({})).toBeUndefined();
  });
});

describe('updateLandingFeaturedCourse', () => {
  it('PUT /admin/.../{id} với payload, trả data.data', async () => {
    api.put.mockResolvedValueOnce({ data: { data: { id: 5 } } });
    const out = await updateLandingFeaturedCourse(5, { title: 'X' });
    expect(api.put).toHaveBeenCalledWith('/admin/landing-featured-courses/5', { title: 'X' });
    expect(out).toEqual({ id: 5 });
  });

  it('id dạng string vẫn ghép URL chính xác', async () => {
    api.put.mockResolvedValueOnce({ data: { data: {} } });
    await updateLandingFeaturedCourse('abc', {});
    expect(api.put).toHaveBeenCalledWith('/admin/landing-featured-courses/abc', {});
  });
});

describe('deleteLandingFeaturedCourse', () => {
  it('DELETE /admin/.../{id}, không trả gì', async () => {
    api.delete.mockResolvedValueOnce({});
    const out = await deleteLandingFeaturedCourse(7);
    expect(api.delete).toHaveBeenCalledWith('/admin/landing-featured-courses/7');
    expect(out).toBeUndefined();
  });

  it('lỗi từ api.delete bubble lên', async () => {
    api.delete.mockRejectedValueOnce(new Error('403'));
    await expect(deleteLandingFeaturedCourse(1)).rejects.toThrow('403');
  });
});

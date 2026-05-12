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
  fetchPublicLandingTestimonials,
  fetchAdminLandingTestimonials,
  createLandingTestimonial,
  updateLandingTestimonial,
  deleteLandingTestimonial,
} from '../landingTestimonialsApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchPublicLandingTestimonials', () => {
  it('success + array → trả nguyên', async () => {
    api.get.mockResolvedValueOnce({
      data: { success: true, data: [{ id: 1, name: 'A' }] },
    });
    const out = await fetchPublicLandingTestimonials();
    expect(api.get).toHaveBeenCalledWith('/public/landing-testimonials');
    expect(out).toEqual([{ id: 1, name: 'A' }]);
  });

  it('success=false → []', async () => {
    api.get.mockResolvedValueOnce({ data: { success: false } });
    expect(await fetchPublicLandingTestimonials()).toEqual([]);
  });

  it('data không phải array → []', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: { foo: 'bar' } } });
    expect(await fetchPublicLandingTestimonials()).toEqual([]);
  });
});

describe('fetchAdminLandingTestimonials', () => {
  it('gọi /admin/landing-testimonials, trả array', async () => {
    api.get.mockResolvedValueOnce({ data: { success: true, data: [{ id: 9 }] } });
    const out = await fetchAdminLandingTestimonials();
    expect(api.get).toHaveBeenCalledWith('/admin/landing-testimonials');
    expect(out).toEqual([{ id: 9 }]);
  });

  it('response rỗng → []', async () => {
    api.get.mockResolvedValueOnce({});
    expect(await fetchAdminLandingTestimonials()).toEqual([]);
  });
});

describe('createLandingTestimonial', () => {
  it('POST /admin/... với payload, trả data.data', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { id: 11 } } });
    const out = await createLandingTestimonial({ name: 'N' });
    expect(api.post).toHaveBeenCalledWith('/admin/landing-testimonials', { name: 'N' });
    expect(out).toEqual({ id: 11 });
  });

  it('data.data thiếu → undefined', async () => {
    api.post.mockResolvedValueOnce({ data: {} });
    expect(await createLandingTestimonial({})).toBeUndefined();
  });
});

describe('updateLandingTestimonial', () => {
  it('PUT /admin/.../{id}, payload', async () => {
    api.put.mockResolvedValueOnce({ data: { data: { id: 3 } } });
    const out = await updateLandingTestimonial(3, { rating: 5 });
    expect(api.put).toHaveBeenCalledWith('/admin/landing-testimonials/3', { rating: 5 });
    expect(out).toEqual({ id: 3 });
  });
});

describe('deleteLandingTestimonial', () => {
  it('DELETE /admin/.../{id}', async () => {
    api.delete.mockResolvedValueOnce({});
    await deleteLandingTestimonial(2);
    expect(api.delete).toHaveBeenCalledWith('/admin/landing-testimonials/2');
  });

  it('lỗi bubble lên', async () => {
    api.delete.mockRejectedValueOnce(new Error('500'));
    await expect(deleteLandingTestimonial(1)).rejects.toThrow('500');
  });
});

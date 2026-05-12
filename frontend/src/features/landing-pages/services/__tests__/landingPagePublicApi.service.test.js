import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPost, mockCreate } = vi.hoisted(() => {
  const get = vi.fn();
  const post = vi.fn();
  const create = vi.fn(() => ({ get, post }));
  return { mockGet: get, mockPost: post, mockCreate: create };
});

vi.mock('axios', () => ({
  default: { create: mockCreate },
}));

import { fetchPublishedLandingHtml, postLandingView } from '../landingPagePublicApi.service';

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('publicClient config', () => {
  it('axios.create với Content-Type JSON + timeout 60s', () => {
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const cfg = mockCreate.mock.calls[0][0];
    expect(cfg).toMatchObject({
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000,
    });
    expect(typeof cfg.baseURL).toBe('string');
  });
});

describe('fetchPublishedLandingHtml', () => {
  it('success + data → trả data.data', async () => {
    mockGet.mockResolvedValueOnce({
      data: { success: true, data: { title: 'Hi', htmlContent: '<p>Hi</p>' } },
    });
    const out = await fetchPublishedLandingHtml('my-slug');
    expect(mockGet).toHaveBeenCalledWith('/public/landing-pages/my-slug');
    expect(out).toEqual({ title: 'Hi', htmlContent: '<p>Hi</p>' });
  });

  it('encodeURIComponent slug có ký tự đặc biệt + trim', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await fetchPublishedLandingHtml('  promo/2026  ');
    expect(mockGet).toHaveBeenCalledWith('/public/landing-pages/promo%2F2026');
  });

  it('slug null → URL với chuỗi rỗng (server trả 404)', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: {} } });
    await fetchPublishedLandingHtml(null);
    expect(mockGet).toHaveBeenCalledWith('/public/landing-pages/');
  });

  it('success=false → throw với message từ server', async () => {
    mockGet.mockResolvedValueOnce({
      data: { success: false, message: 'Slug không tồn tại' },
    });
    await expect(fetchPublishedLandingHtml('x')).rejects.toThrow('Slug không tồn tại');
  });

  it('success=true nhưng data null → throw fallback', async () => {
    mockGet.mockResolvedValueOnce({ data: { success: true, data: null } });
    await expect(fetchPublishedLandingHtml('x')).rejects.toThrow('Không tải được landing page');
  });

  it('axios reject → bubble lên', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network'));
    await expect(fetchPublishedLandingHtml('x')).rejects.toThrow('Network');
  });
});

describe('postLandingView', () => {
  it('POST /public/landing-analytics/view với payload', async () => {
    mockPost.mockResolvedValueOnce({ data: {} });
    await postLandingView({ slug: 'x', visitorId: 'v1' });
    expect(mockPost).toHaveBeenCalledWith('/public/landing-analytics/view', {
      slug: 'x',
      visitorId: 'v1',
    });
  });

  it('không trả gì (void)', async () => {
    mockPost.mockResolvedValueOnce({ data: { ok: true } });
    const out = await postLandingView({});
    expect(out).toBeUndefined();
  });
});

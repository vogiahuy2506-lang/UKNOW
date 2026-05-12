import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../services/landingTestimonialsApi.service.js', () => ({
  fetchPublicLandingTestimonials: vi.fn(),
}));

vi.mock('../../utils/testimonialDisplay.js', () => ({
  initialsFromDisplayName: vi.fn((name) =>
    String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
  ),
}));

vi.mock('../../utils/publicFileUrl.js', () => ({
  normalizePublicFileUrlForEmbed: vi.fn((url) => `https://cdn.test/${url}`),
}));

import { fetchPublicLandingTestimonials } from '../../services/landingTestimonialsApi.service.js';
import { useLandingTestimonials } from '../useLandingTestimonials';

const staticItems = [
  { id: 's1', quote: 'Quote VI', name: 'A B', role: 'Role A', initials: 'AB', avatarClass: 'av1' },
  { id: 's2', quote: 'Quote 2', name: 'C D', role: 'Role C', initials: 'CD' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useLandingTestimonials', () => {
  it('lúc đang fetch (rows=null) → trả fallback static items', () => {
    fetchPublicLandingTestimonials.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useLandingTestimonials('vi', staticItems));
    expect(result.current.testimonialItems).toHaveLength(2);
    expect(result.current.testimonialItems[0]).toMatchObject({
      id: 's1',
      quote: 'Quote VI',
      starRating: 5,
      imageUrl: null,
      avatarClass: 'av1',
    });
    expect(result.current.testimonialItems[1].avatarClass).toBe('av1');
  });

  it('API trả [] → giữ fallback static items', async () => {
    fetchPublicLandingTestimonials.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useLandingTestimonials('vi', staticItems));
    await waitFor(() =>
      expect(result.current.testimonialItems[0].id).toBe('s1')
    );
    expect(result.current.testimonialItems).toHaveLength(2);
  });

  it('API lỗi → giữ fallback static items', async () => {
    fetchPublicLandingTestimonials.mockRejectedValueOnce(new Error('Network'));
    const { result } = renderHook(() => useLandingTestimonials('vi', staticItems));
    await waitFor(() =>
      expect(result.current.testimonialItems).toHaveLength(2)
    );
    expect(result.current.testimonialItems[0].quote).toBe('Quote VI');
  });

  it('API trả rows → map theo locale=vi (quoteVi/nameVi/roleVi)', async () => {
    fetchPublicLandingTestimonials.mockResolvedValueOnce([
      {
        id: 7,
        quoteVi: 'Quote VN',
        quoteEn: 'Quote EN',
        nameVi: 'Nguyễn An',
        nameEn: 'An Nguyen',
        roleVi: 'CEO',
        roleEn: 'CEO',
        locationVi: 'Hà Nội',
        locationEn: 'Hanoi',
        starRating: 5,
        imageUrl: 'avatar.png',
      },
    ]);
    const { result } = renderHook(() => useLandingTestimonials('vi', staticItems));
    await waitFor(() => expect(result.current.testimonialItems[0].id).toBe('7'));
    const item = result.current.testimonialItems[0];
    expect(item.quote).toBe('Quote VN');
    expect(item.name).toBe('Nguyễn An');
    expect(item.role).toBe('CEO · Hà Nội');
    expect(item.imageUrl).toBe('https://cdn.test/avatar.png');
    expect(item.initials).toBe('NA');
    expect(item.avatarClass).toBe('av4');
  });

  it('locale=en → map quoteEn/nameEn/roleEn/locationEn', async () => {
    fetchPublicLandingTestimonials.mockResolvedValueOnce([
      {
        id: 3,
        quoteVi: 'VN',
        quoteEn: 'EN quote',
        nameVi: 'A',
        nameEn: 'Alice Z',
        roleEn: 'CTO',
        locationEn: 'NYC',
        starRating: 4,
      },
    ]);
    const { result } = renderHook(() => useLandingTestimonials('en', staticItems));
    await waitFor(() => expect(result.current.testimonialItems[0].id).toBe('3'));
    const item = result.current.testimonialItems[0];
    expect(item.quote).toBe('EN quote');
    expect(item.name).toBe('Alice Z');
    expect(item.role).toBe('CTO · NYC');
    expect(item.starRating).toBe(4);
  });

  it('starRating invalid → fallback 5; imageUrl rỗng → null', async () => {
    fetchPublicLandingTestimonials.mockResolvedValueOnce([
      { id: 1, quoteVi: 'q', nameVi: 'n', starRating: 'NaN', imageUrl: '' },
    ]);
    const { result } = renderHook(() => useLandingTestimonials('vi', staticItems));
    await waitFor(() => expect(result.current.testimonialItems[0].id).toBe('1'));
    expect(result.current.testimonialItems[0].starRating).toBe(5);
    expect(result.current.testimonialItems[0].imageUrl).toBeNull();
  });

  it('chỉ có role hoặc location → join không có separator dư', async () => {
    fetchPublicLandingTestimonials.mockResolvedValueOnce([
      { id: 1, quoteVi: 'q', nameVi: 'n', roleVi: 'CEO', locationVi: '' },
    ]);
    const { result } = renderHook(() => useLandingTestimonials('vi', staticItems));
    await waitFor(() => expect(result.current.testimonialItems[0].role).toBe('CEO'));
  });

  it('staticItems null/undefined → testimonialItems []', () => {
    fetchPublicLandingTestimonials.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useLandingTestimonials('vi', null));
    expect(result.current.testimonialItems).toEqual([]);
  });
});

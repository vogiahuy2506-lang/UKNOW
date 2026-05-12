import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../services/landingFeaturedCoursesApi.service.js', () => ({
  fetchPublicLandingFeaturedCourses: vi.fn(),
}));

vi.mock('../../utils/publicFileUrl.js', () => ({
  normalizePublicFileUrlForEmbed: vi.fn((url) => `https://cdn.test/${url}`),
}));

import { fetchPublicLandingFeaturedCourses } from '../../services/landingFeaturedCoursesApi.service.js';
import { useLandingFeaturedCourses } from '../useLandingFeaturedCourses';

const staticItems = [
  { tag: 'Free', title: 'Course A', imageUrl: 'a.png', linkUrl: 'https://x/a' },
  { tag: 'Pro', title: 'Course B' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useLandingFeaturedCourses', () => {
  it('rows=null lúc đang fetch → trả fallback static items, usingApi=false', () => {
    fetchPublicLandingFeaturedCourses.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useLandingFeaturedCourses('vi', staticItems));
    expect(result.current.courseItems).toEqual([
      { tag: 'Free', title: 'Course A', imageUrl: 'a.png', linkUrl: 'https://x/a' },
      { tag: 'Pro', title: 'Course B', imageUrl: null, linkUrl: 'https://founderai.biz/' },
    ]);
    expect(result.current.usingApi).toBe(false);
  });

  it('API trả [] → giữ fallback static, usingApi=false', async () => {
    fetchPublicLandingFeaturedCourses.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useLandingFeaturedCourses('vi', staticItems));
    await waitFor(() => expect(result.current.courseItems[0].title).toBe('Course A'));
    expect(result.current.usingApi).toBe(false);
  });

  it('API lỗi → giữ fallback static items, usingApi=false', async () => {
    fetchPublicLandingFeaturedCourses.mockRejectedValueOnce(new Error('Network'));
    const { result } = renderHook(() => useLandingFeaturedCourses('vi', staticItems));
    await waitFor(() => expect(result.current.courseItems).toHaveLength(2));
    expect(result.current.usingApi).toBe(false);
  });

  it('API có rows → map theo locale=vi (tagVi/titleVi), usingApi=true', async () => {
    fetchPublicLandingFeaturedCourses.mockResolvedValueOnce([
      {
        tagVi: 'Mới',
        tagEn: 'New',
        titleVi: 'Khoá học VN',
        titleEn: 'EN course',
        imageUrl: 'cover.png',
        linkUrl: 'https://founderai.biz/course/1',
      },
    ]);
    const { result } = renderHook(() => useLandingFeaturedCourses('vi', staticItems));
    await waitFor(() => expect(result.current.usingApi).toBe(true));
    const item = result.current.courseItems[0];
    expect(item.tag).toBe('Mới');
    expect(item.title).toBe('Khoá học VN');
    expect(item.imageUrl).toBe('https://cdn.test/cover.png');
    expect(item.linkUrl).toBe('https://founderai.biz/course/1');
  });

  it('locale=en → map tagEn/titleEn', async () => {
    fetchPublicLandingFeaturedCourses.mockResolvedValueOnce([
      { tagVi: 'VN', tagEn: 'New', titleVi: 'VN', titleEn: 'EN course', imageUrl: '', linkUrl: 'https://x' },
    ]);
    const { result } = renderHook(() => useLandingFeaturedCourses('en', staticItems));
    await waitFor(() => expect(result.current.usingApi).toBe(true));
    expect(result.current.courseItems[0]).toMatchObject({
      tag: 'New',
      title: 'EN course',
      imageUrl: null,
      linkUrl: 'https://x',
    });
  });

  it('staticItems null → courseItems []', () => {
    fetchPublicLandingFeaturedCourses.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useLandingFeaturedCourses('vi', null));
    expect(result.current.courseItems).toEqual([]);
  });

  it('static item thiếu linkUrl → fallback "https://founderai.biz/"', () => {
    fetchPublicLandingFeaturedCourses.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() =>
      useLandingFeaturedCourses('vi', [{ tag: 'X', title: 'Y' }])
    );
    expect(result.current.courseItems[0].linkUrl).toBe('https://founderai.biz/');
  });
});

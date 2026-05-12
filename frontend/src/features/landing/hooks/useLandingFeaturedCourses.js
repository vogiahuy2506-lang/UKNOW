import { useEffect, useMemo, useState } from 'react';
import { fetchPublicLandingFeaturedCourses } from '../services/landingFeaturedCoursesApi.service.js';
import { normalizePublicFileUrlForEmbed } from '../utils/publicFileUrl.js';

/**
 * Map một dòng API sang thẻ hiển thị theo locale.
 *
 * @param {object} r
 * @param {'vi'|'en'} locale
 */
function mapApiRowToCard(r, locale) {
  const isEn = locale === 'en';
  return {
    tag: isEn ? r.tagEn : r.tagVi,
    title: isEn ? r.titleEn : r.titleVi,
    imageUrl: r.imageUrl ? normalizePublicFileUrlForEmbed(r.imageUrl) : null,
    linkUrl: r.linkUrl,
  };
}

/**
 * Fallback từ `landingCopy.courses.items` (đã có linkUrl / imageUrl).
 *
 * @param {object} s
 */
function mapStaticItem(s) {
  return {
    tag: s.tag,
    title: s.title,
    imageUrl: s.imageUrl ?? null,
    linkUrl: s.linkUrl || 'https://Founder AI.edu.vn/',
  };
}

/**
 * Tải khóa học nổi bật từ DB; nếu rỗng hoặc lỗi thì dùng bản copy tĩnh.
 *
 * Luồng hoạt động:
 * 1. GET `/api/public/landing-featured-courses` (một lần khi mount).
 * 2. Nếu có bản ghi active → map theo `locale`.
 * 3. Nếu không có hoặc lỗi mạng → `staticItems` trong copy.
 *
 * @param {'vi'|'en'} locale
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.courses['items']} staticItems
 */
export function useLandingFeaturedCourses(locale, staticItems) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicLandingFeaturedCourses()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const courseItems = useMemo(() => {
    const fallback = (staticItems || []).map(mapStaticItem);
    if (rows === null) return fallback;
    if (rows.length > 0) return rows.map((r) => mapApiRowToCard(r, locale));
    return fallback;
  }, [rows, locale, staticItems]);

  const usingApi = rows !== null && rows.length > 0;

  return { courseItems, usingApi };
}

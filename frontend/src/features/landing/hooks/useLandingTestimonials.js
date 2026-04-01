import { useEffect, useMemo, useState } from 'react';
import { fetchPublicLandingTestimonials } from '../services/landingTestimonialsApi.service.js';
import { initialsFromDisplayName } from '../utils/testimonialDisplay.js';
import { normalizePublicFileUrlForEmbed } from '../utils/publicFileUrl.js';

const AV_CLASSES = ['av1', 'av2', 'av3', 'av4'];

/**
 * Map một dòng API sang thẻ testimonial theo locale.
 *
 * @param {object} r
 * @param {'vi'|'en'} locale
 */
function mapApiRowToItem(r, locale) {
  const isEn = locale === 'en';
  const quote = isEn ? r.quoteEn : r.quoteVi;
  const name = isEn ? r.nameEn : r.nameVi;
  const rolePart = isEn ? r.roleEn : r.roleVi;
  const locPart = isEn ? r.locationEn : r.locationVi;
  const roleLine = [rolePart, locPart].filter(Boolean).join(' · ');
  const idNum = Number(r.id);
  const avatarClass = AV_CLASSES[Number.isFinite(idNum) ? Math.abs(idNum) % AV_CLASSES.length : 0];
  return {
    id: String(r.id),
    quote,
    name,
    role: roleLine,
    starRating: Number(r.starRating) || 5,
    imageUrl: r.imageUrl ? normalizePublicFileUrlForEmbed(r.imageUrl) : null,
    initials: initialsFromDisplayName(name),
    avatarClass,
  };
}

/**
 * Fallback từ `landingCopy.testimonials.items`.
 *
 * @param {object} s
 */
function mapStaticItem(s) {
  return {
    id: s.id,
    quote: s.quote,
    name: s.name,
    role: s.role,
    starRating: 5,
    imageUrl: null,
    initials: s.initials,
    avatarClass: s.avatarClass || 'av1',
  };
}

/**
 * Tải đánh giá từ DB; nếu rỗng hoặc lỗi thì dùng bản copy tĩnh.
 *
 * Luồng hoạt động:
 * 1. GET `/api/public/landing-testimonials` (một lần khi mount).
 * 2. Nếu có bản ghi active → map theo `locale`.
 * 3. Nếu không có hoặc lỗi mạng → `staticItems` trong copy.
 *
 * @param {'vi'|'en'} locale
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.testimonials['items']} staticItems
 */
export function useLandingTestimonials(locale, staticItems) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicLandingTestimonials()
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

  const testimonialItems = useMemo(() => {
    const fallback = (staticItems || []).map(mapStaticItem);
    if (rows === null) return fallback;
    if (rows.length > 0) return rows.map((r) => mapApiRowToItem(r, locale));
    return fallback;
  }, [rows, locale, staticItems]);

  return { testimonialItems };
}

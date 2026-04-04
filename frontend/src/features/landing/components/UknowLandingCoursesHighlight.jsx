import { useCallback, useMemo, useRef } from 'react';
import { HiOutlineAcademicCap, HiOutlineChartBar, HiOutlinePaintBrush } from 'react-icons/hi2';
import { LANDING_SURFACE, LANDING_CARD, LANDING_GOLD, LANDING_MUTED } from '../constants/landingTheme.js';
import { buildLandingTrackGoUrl } from '../../landing-pages/utils/buildLandingTrackGoUrl.js';

/** Icon fallback khi chưa có ảnh (cùng bộ Heroicons outline). */
const FALLBACK_ICONS = [HiOutlineAcademicCap, HiOutlineChartBar, HiOutlinePaintBrush];

/**
 * Khóa học nổi bật — carousel ngang (mũi tên + snap), ảnh lớn, nút «Xem chi tiết» trỏ `linkUrl`.
 *
 * Luồng hoạt động:
 * 1. `overflow-x-auto` + `scroll-snap` giống testimonials.
 * 2. Nút trái/phải `scrollBy` theo bề rộng một thẻ + gap.
 * 3. Ảnh chỉ hiển thị; link nằm ở nút CTA.
 *
 * @param {object} props
 * @param {Pick<import('../constants/landingCopy.js').LANDING_COPY.vi.courses, 'eyebrow' | 'title' | 'subtitle' | 'linkLabel' | 'carouselPrevAria' | 'carouselNextAria' | 'detailCtaLabel'>} props.courses
 * @param {{ tag: string, title: string, imageUrl: string|null, linkUrl: string }[]} props.items
 * @param {string} [props.landingSlug] slug ghi nhận click (mặc định `l`)
 */
export function UknowLandingCoursesHighlight({ courses, items, landingSlug = 'l' }) {
  const scrollerRef = useRef(null);
  const slug = String(landingSlug || 'l').trim().toLowerCase() || 'l';

  const tracked = useCallback(
    (targetUrl) => {
      const raw = String(targetUrl || '').trim() || 'https://uknow.edu.vn/';
      return buildLandingTrackGoUrl(slug, raw);
    },
    [slug]
  );

  const catalogHref = useMemo(() => tracked('https://uknow.edu.vn/'), [tracked]);

  const grads = [
    'from-[#148C94] to-[#1DA1AB]',
    'from-[#B8860B] to-[#DAA520]',
    'from-[#8B0000] to-[#B22222]',
  ];

  const list = Array.isArray(items) && items.length > 0 ? items : [];

  const scrollByDir = useCallback((dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector('[data-course-card]');
    const gap = 20;
    const w = card ? card.getBoundingClientRect().width + gap : 560;
    el.scrollBy({ left: dir * w, behavior: 'smooth' });
  }, []);

  return (
    <section
      className="px-[6%] py-24 text-white sm:px-[8%] sm:py-[100px]"
      style={{
        backgroundColor: LANDING_SURFACE,
        colorScheme: 'dark',
      }}
    >
      <p className="mb-3 text-[0.68rem] font-bold uppercase tracking-[2px]" style={{ color: LANDING_GOLD }}>
        {courses.eyebrow}
      </p>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-landing max-w-3xl text-[clamp(1.8rem,3vw,2.8rem)] font-black leading-tight tracking-[-0.5px] text-white">
            {courses.title}
          </h2>
          <p className="mt-3 max-w-[520px] text-[0.97rem] font-light leading-[1.75]" style={{ color: LANDING_MUTED }}>
            {courses.subtitle}
          </p>
        </div>
        {list.length > 1 ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => scrollByDir(-1)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-sm transition hover:bg-white/15"
              aria-label={courses.carouselPrevAria}
            >
              <span className="text-lg" aria-hidden>
                ←
              </span>
            </button>
            <button
              type="button"
              onClick={() => scrollByDir(1)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white shadow-sm transition hover:bg-white/15"
              aria-label={courses.carouselNextAria}
            >
              <span className="text-lg" aria-hidden>
                →
              </span>
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollerRef}
        className="-mx-1 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] sm:mx-0 [&::-webkit-scrollbar]:hidden"
      >
        {list.map((c, i) => {
          const grad = grads[i % grads.length];
          const Icon = FALLBACK_ICONS[i % FALLBACK_ICONS.length];
          const href = tracked(String(c.linkUrl || '').trim() || 'https://uknow.edu.vn/');
          const hasImage = Boolean(c.imageUrl && String(c.imageUrl).trim());

          return (
            <article
              key={`${c.title}-${i}`}
              data-course-card
              className="w-[min(100%,560px)] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 transition hover:-translate-y-0.5 sm:w-[520px] md:w-[560px]"
              style={{
                backgroundColor: LANDING_CARD,
                colorScheme: 'dark',
              }}
            >
              {/* Ảnh lớn — không bọc link; chi tiết qua nút bên dưới */}
              <div
                className={`relative block w-full overflow-hidden ${!hasImage ? `flex min-h-[220px] items-center justify-center bg-gradient-to-br sm:min-h-[260px] md:min-h-[280px] ${grad} text-white` : 'min-h-[220px] bg-black/20 sm:min-h-[260px] md:min-h-[280px]'}`}
              >
                {hasImage ? (
                  <img
                    src={c.imageUrl}
                    alt={c.title}
                    className="h-full min-h-[220px] w-full object-cover sm:min-h-[260px] md:min-h-[280px]"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="flex h-full min-h-[220px] w-full items-center justify-center sm:min-h-[260px] md:min-h-[280px]" aria-hidden>
                    <Icon className="h-16 w-16 opacity-95 sm:h-[4.5rem] sm:w-[4.5rem]" strokeWidth={1.5} />
                  </span>
                )}
              </div>
              <div className="px-5 py-5" style={{ backgroundColor: LANDING_CARD }}>
                <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-wide" style={{ color: LANDING_GOLD }}>
                  {c.tag}
                </p>
                <h3 className="mb-4 text-[0.95rem] font-semibold leading-snug text-white">{c.title}</h3>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-amber-400/70 bg-white/[0.06] px-4 py-2.5 text-[0.88rem] font-semibold text-amber-200 transition hover:border-amber-300 hover:bg-white/10 hover:text-white sm:w-auto"
                >
                  {courses.detailCtaLabel}
                </a>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-10 text-center">
        <a
          href={catalogHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-bold underline-offset-4 transition hover:text-amber-300 hover:underline"
          style={{ color: LANDING_GOLD }}
        >
          {courses.linkLabel}
        </a>
      </div>
    </section>
  );
}

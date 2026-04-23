import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cảm nhận cộng đồng — carousel ngang, nút mũi tên để lướt (5–7 thẻ).
 *
 * Luồng hoạt động:
 * 1. Hàng thẻ `overflow-x-auto` + `scroll-snap`.
 * 2. Nút trái/phải gọi `scrollBy` theo bề rộng một thẻ + gap.
 * 3. ảnh minh chứng (nếu có) hiển thị riêng, bấm mở lightbox; avatar chỉ là chữ ký tắt.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.testimonials} props.testimonials Tiêu đề section (eyebrow, title, aria nút)
 * @param {Array<{ id: string, quote: string, name: string, role: string, starRating?: number, imageUrl?: string|null, initials: string, avatarClass?: string }>} props.items Thẻ đánh giá (DB hoặc copy tĩnh)
 */
export function UknowLandingTestimonials({ testimonials, items }) {
  const scrollerRef = useRef(null);
  /** URL ảnh minh chứng đang xem phóng to (null = đóng). */
  const [lightboxSrc, setLightboxSrc] = useState(null);

  /**
   * Màu avatar cố định (inline style) để luôn hiển thị đúng — tránh class Tailwind bị JIT bỏ sót khi map động.
   * Không dùng nền trắng.
   */
  const avatarPalette = {
    av1: { bg: '#0b5563', fg: '#ffffff' },
    av2: { bg: '#d4900a', fg: '#0c0f1a' },
    av3: { bg: '#c0392b', fg: '#ffffff' },
    av4: { bg: '#4f46e5', fg: '#ffffff' },
  };

  /**
   * @param {string|undefined} key
   * @returns {{ bg: string, fg: string }}
   */
  const getAvatarColors = (key) => avatarPalette[key] ?? avatarPalette.av1;

  const scrollByDir = useCallback((dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector('[data-testimonial-card]');
    const gap = 20;
    const w = card ? card.getBoundingClientRect().width + gap : 340;
    el.scrollBy({ left: dir * w, behavior: 'smooth' });
  }, []);

  /** Đóng lightbox bằng phím Escape. */
  useEffect(() => {
    if (!lightboxSrc) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightboxSrc(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxSrc]);

  return (
    <section className="relative bg-uknow-paper px-[6%] py-24 sm:px-[8%] sm:py-[100px]">
      <p className="mb-3 text-[0.68rem] font-bold uppercase tracking-[2px] text-uknow-teal">{testimonials.eyebrow}</p>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-landing max-w-3xl text-[clamp(1.8rem,3vw,2.8rem)] font-black leading-tight tracking-[-0.5px] text-uknow-ink">
          {testimonials.title}
        </h2>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => scrollByDir(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-uknow-border bg-white text-uknow-ink shadow-sm transition hover:bg-uknow-cream"
            aria-label={testimonials.carouselPrevAria}
          >
            <span className="text-lg" aria-hidden>
              ←
            </span>
          </button>
          <button
            type="button"
            onClick={() => scrollByDir(1)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-uknow-border bg-white text-uknow-ink shadow-sm transition hover:bg-uknow-cream"
            aria-label={testimonials.carouselNextAria}
          >
            <span className="text-lg" aria-hidden>
              →
            </span>
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="-mx-1 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] sm:mx-0 [&::-webkit-scrollbar]:hidden"
      >
        {(items || []).map((t) => {
          const stars = Math.min(5, Math.max(1, Number(t.starRating) || 5));
          const proofAlt = `Minh chứng — ${t.name}`;
          const av = getAvatarColors(t.avatarClass);
          return (
            <figure
              key={t.id}
              data-testimonial-card
              className="relative flex w-[min(100%,340px)] shrink-0 snap-start flex-col rounded-[14px] border border-uknow-border bg-white p-7 shadow-sm transition hover:shadow-[0_12px_36px_rgba(0,0,0,0.08)] sm:w-[300px] md:w-[320px]"
            >
              {/* Thông tin người gửi — luôn ở đầu thẻ, trước sao và nội dung đánh giá */}
              <figcaption className="mb-4 flex shrink-0 items-center gap-3">
                <div
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[0.82rem] font-bold shadow-sm"
                  style={{ backgroundColor: av.bg, color: av.fg }}
                >
                  {t.initials}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="text-[0.86rem] font-bold text-uknow-ink">{t.name}</div>
                  <div className="text-[0.72rem] text-uknow-muted">{t.role}</div>
                </div>
              </figcaption>

              <div className="relative z-[1]">
                <span className="pointer-events-none absolute left-0 top-0 font-landing text-[4rem] leading-[0.8] text-uknow-teal/12">
                  &ldquo;
                </span>
                <div className="mb-2.5 pt-5 text-[0.8rem] text-uknow-gold" aria-hidden>
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i}>{i < stars ? '★' : '☆'}</span>
                  ))}
                </div>
                <blockquote className="relative z-[1] text-[0.875rem] font-light leading-[1.72] text-[#2a2a2a]">{t.quote}</blockquote>
              </div>

              {t.imageUrl ? (
                <div className="relative z-[1] mt-4">
                  <button
                    type="button"
                    onClick={() => setLightboxSrc(t.imageUrl)}
                    className="group relative w-full overflow-hidden rounded-lg border border-uknow-border/80 bg-uknow-cream/40 text-left shadow-sm transition hover:border-uknow-teal/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-uknow-teal/50"
                  >
                    <img
                      src={t.imageUrl}
                      alt={proofAlt}
                      className="max-h-[160px] w-full object-cover object-center"
                      loading="lazy"
                    />
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-2 py-0.5 text-[0.65rem] font-medium text-white backdrop-blur-sm">
                      {testimonials.proofImageTapHint}
                    </span>
                  </button>
                </div>
              ) : null}
            </figure>
          );
        })}
      </div>

      {lightboxSrc ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={testimonials.lightboxCloseAria}
          onClick={() => setLightboxSrc(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/20"
            aria-label={testimonials.lightboxCloseAria}
            onClick={(e) => {
              e.stopPropagation();
              setLightboxSrc(null);
            }}
          >
            ×
          </button>
          <img
            src={lightboxSrc}
            alt=""
            className="max-h-[92vh] max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  );
}

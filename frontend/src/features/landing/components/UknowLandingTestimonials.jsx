import { useCallback, useRef } from 'react';

/**
 * Cảm nhận cộng đồng — carousel ngang, nút mũi tên để lướt (5–7 thẻ).
 *
 * Luồng hoạt động:
 * 1. Hàng thẻ `overflow-x-auto` + `scroll-snap`.
 * 2. Nút trái/phải gọi `scrollBy` theo bề rộng một thẻ + gap.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.testimonials} props.testimonials
 */
export function UknowLandingTestimonials({ testimonials }) {
  const scrollerRef = useRef(null);

  const avClass = {
    av1: 'bg-uknow-teal text-white',
    av2: 'bg-uknow-gold text-uknow-ink',
    av3: 'bg-uknow-red text-white',
    av4: 'bg-indigo-600 text-white',
  };

  const scrollByDir = useCallback((dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector('[data-testimonial-card]');
    const gap = 20;
    const w = card ? card.getBoundingClientRect().width + gap : 340;
    el.scrollBy({ left: dir * w, behavior: 'smooth' });
  }, []);

  return (
    <section className="relative bg-uknow-paper px-[6%] py-24 sm:px-[8%] sm:py-[100px]">
      <p className="mb-3 text-[0.68rem] font-bold uppercase tracking-[2px] text-uknow-teal">{testimonials.eyebrow}</p>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-display max-w-3xl text-[clamp(1.8rem,3vw,2.8rem)] font-black leading-tight tracking-[-0.5px] text-uknow-ink">
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
        {testimonials.items.map((t) => (
          <figure
            key={t.id}
            data-testimonial-card
            className="relative w-[min(100%,340px)] shrink-0 snap-start rounded-[14px] border border-uknow-border bg-white p-7 shadow-sm transition hover:shadow-[0_12px_36px_rgba(0,0,0,0.08)] sm:w-[300px] md:w-[320px]"
          >
            <span className="pointer-events-none absolute left-[18px] top-3 font-display text-[4rem] leading-[0.8] text-uknow-teal/12">
              &ldquo;
            </span>
            <div className="mb-2.5 pt-5 text-[0.8rem] text-uknow-gold">★★★★★</div>
            <blockquote className="relative z-[1] text-[0.875rem] font-light leading-[1.72] text-[#2a2a2a]">{t.quote}</blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <div
                className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[0.82rem] font-bold ${avClass[t.avatarClass] ?? avClass.av1}`}
              >
                {t.initials}
              </div>
              <div>
                <div className="text-[0.86rem] font-bold text-uknow-ink">{t.name}</div>
                <div className="text-[0.72rem] text-uknow-muted">{t.role}</div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

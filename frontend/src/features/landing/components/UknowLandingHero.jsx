/** Ảnh minh họa hero (Unsplash — học tập / cộng tác) */
const HERO_IMAGE =
  'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1400&q=80';

/**
 * Hero: thông điệp chính + ảnh + CTA.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.hero} props.hero
 */
export function UknowLandingHero({ hero }) {
  return (
    <section className="relative grid min-h-[min(92vh,880px)] grid-cols-1 gap-10 overflow-hidden pt-[88px] lg:grid-cols-2 lg:gap-0 lg:pt-[96px]">
      <div className="relative z-[2] flex flex-col justify-center px-[6%] pb-12 pt-6 sm:px-[8%] lg:py-20">
        <div className="mb-6 inline-flex w-fit max-w-full items-center gap-2 rounded-full border border-uknow-gold/40 bg-[#fff8ec] px-3.5 py-1.5 text-[0.75rem] font-semibold text-[#7a5200] sm:text-[0.78rem]">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-uknow-gold" />
          <span className="leading-snug">{hero.badge}</span>
        </div>
        <h1 className="text-[clamp(1.85rem,4.2vw,2.65rem)] font-black leading-[1.12] tracking-tight text-uknow-ink">
          {hero.titleLine1}{' '}
          <em className="not-italic text-[#0d6e6e] underline decoration-uknow-gold decoration-[3px] underline-offset-[4px]">
            {hero.titleHighlight}
          </em>
          <br />
          {hero.titleLine2}
        </h1>
        <p className="mt-5 max-w-[520px] text-[1.02rem] leading-relaxed text-uknow-muted">{hero.subtitle}</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <a
            href="#dang-ky"
            className="inline-flex items-center justify-center rounded-xl bg-[#0d6e6e] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#12a0a0] sm:px-8 sm:text-[0.95rem]"
          >
            {hero.ctaPrimary}
          </a>
          <a
            href="#lo-trinh"
            className="inline-flex items-center justify-center rounded-xl border-2 border-uknow-border bg-white px-6 py-3 text-sm font-semibold text-uknow-ink transition hover:border-[#0d6e6e]/50 sm:px-8 sm:text-[0.95rem]"
          >
            {hero.ctaSecondary}
          </a>
        </div>
        <p className="mt-8 max-w-md text-[0.82rem] text-uknow-muted">{hero.socialProof}</p>
      </div>

      <div className="relative min-h-[280px] lg:min-h-0">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0d6e6e]/10 via-transparent to-uknow-gold/10 lg:rounded-bl-[2.5rem]"
          aria-hidden
        />
        <img
          src={HERO_IMAGE}
          alt={hero.imageAlt}
          loading="eager"
          fetchPriority="high"
          className="h-full w-full object-cover lg:absolute lg:inset-0 lg:min-h-full lg:rounded-bl-[2.5rem]"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-uknow-ink/25 via-transparent to-transparent lg:rounded-bl-[2.5rem]"
          aria-hidden
        />
      </div>
    </section>
  );
}

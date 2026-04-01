import { Fragment } from 'react';
import { INSTRUCTOR_PHOTO_SRC } from '../constants/landingAssets.js';

/**
 * Cột trái hero: eyebrow, tiêu đề Fraunces, subtitle, thẻ giảng viên nhỏ, stats.
 * Form nằm cột phải trong `UknowLandingPage` (cùng section).
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.hero} props.hero
 */
export function UknowLandingHero({ hero }) {
  return (
    <div className="relative z-[2] flex flex-col justify-center px-[5%] pb-10 pt-8 sm:px-[6%] lg:px-[8%] lg:pb-20 lg:pt-14 xl:pl-[8%]">
      {/* Eyebrow */}
      <div
        className="mb-7 inline-flex max-w-full flex-wrap items-center gap-2 animate-uknow-fade-up"
        style={{ animationDelay: '0.1s' }}
      >
        <span className="rounded bg-uknow-teal px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[1.5px] text-white">
          {hero.eyebrowTag}
        </span>
        <span className="h-1.5 w-1.5 shrink-0 animate-uknow-blink rounded-full bg-uknow-gold-light" aria-hidden />
        <span className="text-[0.82rem] font-normal text-uknow-muted">{hero.eyebrowText}</span>
      </div>

      <h1
        className="font-display text-[clamp(2.2rem,4.2vw,3.8rem)] font-black leading-[1.08] tracking-[-1.5px] text-uknow-ink animate-uknow-fade-up"
        style={{ animationDelay: '0.2s' }}
      >
        {hero.titleLine1}
        <br />
        <span className="relative inline-block font-display italic text-uknow-teal">
          {hero.titleHighlight}
          <span
            className="pointer-events-none absolute bottom-[3px] left-0 right-0 h-1 rounded-sm bg-uknow-gold-light/60"
            aria-hidden
          />
        </span>
        <br />
        {hero.titleLine2}{' '}
        <span className="text-uknow-gold">{hero.titleAccent}</span>
      </h1>

      <p
        className="mt-6 max-w-[480px] text-base font-light leading-[1.75] text-uknow-muted animate-uknow-fade-up"
        style={{ animationDelay: '0.3s' }}
      >
        {hero.subtitle}
      </p>

      {/* Thẻ giảng viên mini */}
      <div
        className="mb-8 mt-8 w-fit max-w-full animate-uknow-fade-up rounded-[10px] border border-uknow-border bg-white p-3.5 pl-[14px] shadow-[0_2px_12px_rgba(0,0,0,0.05)] sm:p-[14px_18px]"
        style={{ animationDelay: '0.4s' }}
      >
        <div className="flex items-center gap-3.5">
          <img
            src={INSTRUCTOR_PHOTO_SRC}
            alt={hero.instructorPhotoAlt}
            className="h-12 w-12 shrink-0 rounded-full border-2 border-uknow-teal-light bg-white object-cover"
            width={48}
            height={48}
            loading="eager"
            decoding="async"
          />
          <div>
            <div className="text-[0.92rem] font-bold text-uknow-ink">{hero.instructorMini.name}</div>
            <div className="mt-0.5 text-[0.75rem] font-medium text-uknow-teal">{hero.instructorMini.title}</div>
            <span className="mt-1 inline-block rounded border border-[#f0c060] bg-uknow-gold-pale px-2 py-0.5 text-[0.68rem] font-bold text-[#8a5a00]">
              ⭐ {hero.instructorMini.badge}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div
        className="mb-9 flex flex-wrap items-start gap-0 animate-uknow-fade-up"
        style={{ animationDelay: '0.5s' }}
      >
        {hero.stats.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 ? <div className="mx-3 hidden h-10 w-px self-center bg-uknow-border sm:block" aria-hidden /> : null}
            <div className="flex flex-col pr-4">
              <span className="font-display text-[2rem] font-black leading-none text-uknow-ink">
                {s.value}
                <sup className="text-[1.2rem] text-uknow-gold">{s.sup}</sup>
              </span>
              <span className="mt-1 text-[0.72rem] font-normal text-uknow-muted">{s.label}</span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

import { INSTRUCTOR_PHOTO_SRC } from '../constants/landingAssets.js';

/**
 * Khối giảng viên (nền tối) — ảnh chân dung ThS. Ngô Hữu Thống thay placeholder emoji.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.about} props.about
 */
export function UknowLandingAbout({ about }) {
  if (!about) return null;

  return (
    <section className="relative overflow-hidden bg-uknow-ink px-[6%] py-24 text-white sm:px-[8%] sm:py-[100px]">
      <div
        className="pointer-events-none absolute -right-[200px] -top-[200px] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(11,85,99,0.4)_0%,transparent_70%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-[150px] -left-[100px] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(212,144,10,0.15)_0%,transparent_70%)]"
        aria-hidden
      />

      <div className="relative z-[2] mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
        {/* Ảnh chân dung + badge nổi */}
        <div className="relative mx-auto w-full max-w-[440px] lg:mx-0">
          <div className="relative">
            <div className="absolute -inset-4 bottom-0 left-4 right-[-16px] top-[-16px] rounded-[20px] bg-gradient-to-br from-uknow-teal to-uknow-gold opacity-25" />
            <div className="relative z-[1] aspect-[3/4] overflow-hidden rounded-2xl border-2 border-white/10 bg-uknow-ink">
              <img
                src={INSTRUCTOR_PHOTO_SRC}
                alt={about.photoName}
                className="h-full w-full object-cover object-top"
                loading="lazy"
                decoding="async"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" aria-hidden />
              <div className="absolute bottom-0 left-0 right-0 z-[2] px-4 pb-5 pt-12 text-center">
                <div className="font-landing text-[1.1rem] font-bold text-white drop-shadow-sm">{about.photoName}</div>
                <div className="mt-1 text-[0.78rem] text-uknow-gold-light">{about.photoDegree}</div>
              </div>
            </div>

            <div className="animate-uknow-float-1 absolute left-0 top-[10%] z-[3] flex max-w-[200px] items-center gap-2 rounded-[10px] bg-white px-3.5 py-2.5 text-[0.78rem] font-semibold text-uknow-ink shadow-[0_8px_24px_rgba(0,0,0,0.3)] sm:left-[-20px]">
              <span className="text-xl" aria-hidden>
                🏆
              </span>
              <span className="leading-snug">
                {about.badge1.split('\n').map((line, i) => (
                  <span key={line}>
                    {i > 0 ? (
                      <>
                        <br />
                        <strong>{line}</strong>
                      </>
                    ) : (
                      line
                    )}
                  </span>
                ))}
              </span>
            </div>
            <div className="animate-uknow-float-2 absolute bottom-[15%] right-0 z-[3] flex max-w-[200px] items-center gap-2 rounded-[10px] bg-white px-3.5 py-2.5 text-[0.78rem] font-semibold text-uknow-ink shadow-[0_8px_24px_rgba(0,0,0,0.3)] sm:right-[-20px]">
              <span className="text-xl" aria-hidden>
                🎓
              </span>
              <span className="leading-snug">
                {about.badge2.split('\n').map((line, i) => (
                  <span key={line}>
                    {i > 0 ? (
                      <>
                        <br />
                        <strong>{line}</strong>
                      </>
                    ) : (
                      line
                    )}
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-3.5 text-[0.68rem] font-bold uppercase tracking-[2px] text-uknow-gold-light">{about.label}</p>
          <h2 className="font-landing text-[clamp(2rem,3.5vw,3rem)] font-black leading-tight tracking-[-1px]">{about.name}</h2>
          <p className="mt-2 text-[0.9rem] font-medium text-uknow-gold-light">{about.degree}</p>
          <div className="mt-5 space-y-4 text-[0.95rem] font-light leading-[1.8] text-white/75">
            {about.bioParagraphs.map((p) => (
              <p key={p.slice(0, 48)}>{p}</p>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {about.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-[0.78rem] text-white/85"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-7">
            {about.stats.map((s) => (
              <div key={s.label}>
                <div className="font-landing text-[2rem] font-black leading-none text-uknow-gold-light">{s.value}</div>
                <div className="mt-1 text-[0.72rem] leading-snug text-white/50">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

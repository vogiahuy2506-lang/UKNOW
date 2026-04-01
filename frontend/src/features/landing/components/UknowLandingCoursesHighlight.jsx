/**
 * Thẻ khóa học tiêu biểu (gradient + badge).
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.courses} props.courses
 */
export function UknowLandingCoursesHighlight({ courses }) {
  const grads = [
    'from-[#0d6e6e] to-[#12a0a0]',
    'from-[#8a5a00] to-uknow-gold',
    'from-[#4a1020] to-[#c84b2f]',
  ];
  const emojis = ['🤖', '📊', '💼'];

  return (
    <section className="bg-gradient-to-b from-uknow-cream to-white px-[6%] py-20 sm:px-[8%]">
      <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-widest text-[#0d6e6e]">{courses.eyebrow}</p>
      <h2 className="max-w-3xl text-[clamp(1.45rem,3vw,2rem)] font-black leading-tight text-uknow-ink">{courses.title}</h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-uknow-muted">{courses.subtitle}</p>
      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
        {courses.items.map((c, i) => (
          <div
            key={c.title}
            className="overflow-hidden rounded-2xl border border-uknow-border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            <div
              className={`relative flex h-[130px] items-center justify-center bg-gradient-to-br ${grads[i] ?? grads[0]} text-5xl`}
            >
              <span aria-hidden>{emojis[i] ?? '✨'}</span>
            </div>
            <div className="p-5">
                <p className="mb-1.5 text-[0.68rem] font-bold uppercase tracking-wider text-[#0d6e6e]">{c.tag}</p>
              <h3 className="mb-3 text-[0.95rem] font-bold leading-snug text-uknow-ink">{c.title}</h3>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.78rem] text-uknow-muted">
                <span>{c.meta}</span>
                <span className="rounded-full border border-uknow-gold/40 bg-uknow-gold/10 px-2.5 py-0.5 text-[0.7rem] font-semibold text-[#8a5a00]">
                  {c.badge}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 text-center">
        <a
          href="https://uknow.edu.vn/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-bold text-[#0d6e6e] underline-offset-4 hover:underline"
        >
          uknow.edu.vn →
        </a>
      </div>
    </section>
  );
}

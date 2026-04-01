/**
 * Cảm nhận học viên (trích ý, không copy nguyên văn bên thứ ba).
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.testimonials} props.testimonials
 */
export function UknowLandingTestimonials({ testimonials }) {
  return (
    <section className="px-[6%] py-20 sm:px-[8%]">
      <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-widest text-[#0d6e6e]">{testimonials.eyebrow}</p>
      <h2 className="text-[clamp(1.45rem,3vw,2rem)] font-black text-uknow-ink">{testimonials.title}</h2>
      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
        {testimonials.items.map((t) => (
          <figure key={t.name} className="relative rounded-2xl border border-uknow-border bg-white p-7 shadow-sm">
            <span className="pointer-events-none absolute left-5 top-3 font-serif text-5xl leading-none text-[#0d6e6e]/15">
              “
            </span>
            <blockquote className="relative z-[1] pt-6 text-sm leading-relaxed text-[#333]">{t.quote}</blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0d6e6e] text-sm font-bold text-white">
                {t.name.charAt(0)}
              </div>
              <div>
                <div className="text-sm font-bold text-uknow-ink">{t.name}</div>
                <div className="text-sm text-uknow-muted">{t.role}</div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

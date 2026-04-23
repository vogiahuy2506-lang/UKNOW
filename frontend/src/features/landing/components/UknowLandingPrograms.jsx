/**
 * Ba hình thức đào tạo: in-house, online, coaching (tham chiếu layout nhiều cột).
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.programs} props.programs
 */
export function UknowLandingPrograms({ programs }) {
  return (
    <section className="px-[6%] py-20 sm:px-[8%]">
      <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-widest text-[#0d6e6e]">{programs.eyebrow}</p>
      <h2 className="max-w-3xl text-[clamp(1.45rem,3vw,2rem)] font-black leading-tight text-uknow-ink">{programs.title}</h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-uknow-muted">{programs.subtitle}</p>
      <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
        {programs.items.map((item) => (
          <article
            key={item.title}
            className="flex flex-col rounded-2xl border border-uknow-border bg-white p-7 shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:border-[#0d6e6e]/25 hover:shadow-lg"
          >
            <span className="mb-4 inline-flex w-fit rounded-full border border-uknow-gold/35 bg-[#fff8ec] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-[#7a5200]">
              {item.badge}
            </span>
            <h3 className="text-lg font-bold text-uknow-ink">{item.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-uknow-muted">{item.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

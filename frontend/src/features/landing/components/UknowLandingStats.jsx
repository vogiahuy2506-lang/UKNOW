/**
 * Dải số liệu / uy tín ngắn (kiểu uknow.edu.vn).
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.stats} props.stats
 */
export function UknowLandingStats({ stats }) {
  return (
    <section id="lo-trinh" className="border-y border-uknow-border bg-white px-[6%] py-16 sm:px-[8%]">
      <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-widest text-[#0d6e6e]">{stats.eyebrow}</p>
      <h2 className="max-w-3xl text-[clamp(1.45rem,3vw,2rem)] font-black leading-tight text-uknow-ink">{stats.title}</h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-uknow-muted">{stats.subtitle}</p>
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-uknow-border bg-uknow-cream/80 px-6 py-6 text-center shadow-sm transition hover:border-[#0d6e6e]/30"
          >
            <div className="text-[clamp(1.75rem,4vw,2.25rem)] font-black tabular-nums text-uknow-ink">
              {item.value}
            </div>
            <div className="mt-1 text-sm font-medium text-uknow-muted">{item.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

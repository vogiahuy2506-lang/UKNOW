/**
 * Dải kêu gọi hành động trước footer.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.finalCta} props.finalCta
 */
export function UknowLandingFinalCta({ finalCta }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#0d6e6e] to-[#0a5050] px-[6%] py-16 text-center text-white sm:px-[8%] sm:py-20">
      <div className="pointer-events-none absolute -right-24 -top-40 h-[420px] w-[420px] rounded-full bg-white/[0.06]" aria-hidden />
      <h2 className="relative text-[clamp(1.35rem,3vw,2rem)] font-black tracking-tight">{finalCta.title}</h2>
      <p className="relative z-[1] mx-auto mt-3 max-w-xl text-sm opacity-85 sm:text-base">{finalCta.subtitle}</p>
      <div className="relative z-[1] mt-8 flex flex-wrap justify-center gap-3">
        <a
          href="#dang-ky"
          className="inline-block rounded-xl bg-white px-7 py-3 text-[0.95rem] font-bold text-[#0d6e6e] shadow transition hover:-translate-y-0.5 hover:bg-slate-50"
        >
          {finalCta.button}
        </a>
        <a
          href="https://uknow.edu.vn/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-xl border-2 border-white/45 px-7 py-3 text-[0.95rem] font-semibold text-white transition hover:border-white"
        >
          {finalCta.buttonSecondary}
        </a>
      </div>
    </section>
  );
}

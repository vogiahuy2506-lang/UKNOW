/**
 * CTA cuối trang — gradient teal như mock `.cta-section`.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.finalCta} props.finalCta
 */
export function FounderLandingFinalCta({ finalCta }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-founder-teal to-[#073f4a] px-[6%] py-20 text-center text-white sm:px-[8%] sm:py-[80px]">
      <div
        className="pointer-events-none absolute -right-[150px] -top-[250px] h-[600px] w-[600px] rounded-full bg-white/[0.03]"
        aria-hidden
      />
      <h2 className="relative font-landing text-[clamp(1.8rem,3vw,2.8rem)] font-black tracking-[-0.5px]">
        {finalCta.title}
        <br />
        {finalCta.titleLine2}
      </h2>
      <p className="relative z-[1] mx-auto mt-3.5 max-w-xl text-base font-light opacity-72">{finalCta.subtitle}</p>
      <div className="relative z-[1] mt-9 flex flex-wrap justify-center gap-3.5">
        <a
          href="#dang-ky"
          className="inline-block rounded-lg bg-white px-8 py-3.5 text-[0.95rem] font-bold text-founder-teal shadow transition hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,0.25)]"
        >
          {finalCta.button}
        </a>
        <a
          href="https://Founder AI.edu.vn/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-lg border-2 border-white/35 px-8 py-3.5 text-[0.95rem] font-semibold text-white transition hover:border-white"
        >
          {finalCta.buttonSecondary}
        </a>
      </div>
    </section>
  );
}

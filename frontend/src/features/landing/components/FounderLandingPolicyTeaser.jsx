/**
 * Đoạn giới thiệu chính sách ngắn + link tới trang policy đầy đủ.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.policyTeaser} props.policyTeaser
 */
export function FounderLandingPolicyTeaser({ policyTeaser }) {
  return (
    <section className="border-t border-founder-border bg-[#f3f1ec] px-[6%] py-16 sm:px-[8%]">
      <div className="mx-auto max-w-3xl rounded-2xl border border-founder-border bg-white p-8 shadow-sm sm:p-10">
        <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-widest text-[#0d6e6e]">{policyTeaser.eyebrow}</p>
        <h2 className="text-xl font-black text-founder-ink sm:text-2xl">{policyTeaser.title}</h2>
        <p className="mt-4 text-sm leading-relaxed text-founder-muted sm:text-base">{policyTeaser.body}</p>
        <a
          href="/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex rounded-xl bg-founder-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0d6e6e]"
        >
          {policyTeaser.link}
        </a>
      </div>
    </section>
  );
}

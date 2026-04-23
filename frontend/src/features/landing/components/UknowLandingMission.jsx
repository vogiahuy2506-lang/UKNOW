/**
 * Khối sứ mệnh (tinh thần “bình dân hóa AI”).
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.mission} props.mission
 */
export function UknowLandingMission({ mission }) {
  return (
    <section className="relative overflow-hidden bg-uknow-ink px-[6%] py-20 text-[#f5f3ef] sm:px-[8%]">
      <div
        className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-[#0d6e6e]/20 blur-3xl"
        aria-hidden
      />
      <p className="relative mb-2 text-[0.72rem] font-bold uppercase tracking-widest text-uknow-gold">{mission.eyebrow}</p>
      <h2 className="relative max-w-3xl text-[clamp(1.5rem,3vw,2.15rem)] font-black leading-tight">
        {mission.title}
        <br />
        <span className="text-white/90">{mission.titleLine2}</span>
      </h2>
      <p className="relative mt-6 max-w-3xl text-base leading-relaxed text-white/70">{mission.body}</p>
    </section>
  );
}

import {
  HiOutlineAcademicCap,
  HiOutlineAdjustmentsHorizontal,
  HiOutlineArrowPath,
  HiOutlineBriefcase,
  HiOutlineChatBubbleLeftRight,
  HiOutlineDevicePhoneMobile,
} from 'react-icons/hi2';

/**
 * Mảng icon Heroicons 2 (outline) — cùng bộ stroke, nhìn nhất quán và chuyên nghiệp.
 * Thứ tự khớp 6 mục trong `landingCopy.benefits.items` (vi/en).
 */
const BENEFIT_ICONS = [
  HiOutlineAdjustmentsHorizontal,
  HiOutlineAcademicCap,
  HiOutlineChatBubbleLeftRight,
  HiOutlineDevicePhoneMobile,
  HiOutlineBriefcase,
  HiOutlineArrowPath,
];

/**
 * Lưới 3×2 lợi ích — icon dùng Heroicons outline thống nhất qua `react-icons/hi2`.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.benefits} props.benefits
 */
export function UknowLandingBenefits({ benefits }) {
  return (
    <section className="px-[6%] py-24 sm:px-[8%] sm:py-[100px]">
      <p className="mb-3 text-[0.68rem] font-bold uppercase tracking-[2px] text-uknow-teal">{benefits.eyebrow}</p>
      <h2 className="font-display max-w-3xl text-[clamp(1.8rem,3vw,2.8rem)] font-black leading-tight tracking-[-0.5px] text-uknow-ink">
        {benefits.title}
        <br />
        {benefits.titleLine2}
      </h2>
      <p className="mt-4 max-w-[520px] text-[0.97rem] font-light leading-[1.75] text-uknow-muted">{benefits.subtitle}</p>

      <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-uknow-border bg-uknow-border sm:grid-cols-2 lg:grid-cols-3">
        {benefits.items.map((item, index) => {
          const Icon = BENEFIT_ICONS[index] ?? HiOutlineAdjustmentsHorizontal;
          return (
            <div
              key={item.title}
              className="bg-white p-8 transition-colors hover:bg-[#f4fbfb] sm:p-9 sm:px-[30px] sm:py-9"
            >
              <div
                className="mb-5 flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-gradient-to-br from-uknow-teal to-uknow-teal-light text-white"
                aria-hidden
              >
                <Icon className="h-6 w-6 shrink-0" strokeWidth={1.75} />
              </div>
              <h3 className="mb-2.5 text-[0.97rem] font-bold text-uknow-ink">{item.title}</h3>
              <p className="text-[0.86rem] leading-relaxed text-uknow-muted">{item.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

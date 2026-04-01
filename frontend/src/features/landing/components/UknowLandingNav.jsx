import { INSTRUCTOR_PHOTO_SRC } from '../constants/landingAssets.js';

/**
 * Thanh điều hướng cố định — logo, dòng giảng viên (ẩn trên màn hẹp như mock), VI/EN, CTA.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.nav} props.nav
 * @param {'vi' | 'en'} props.locale
 * @param {(l: 'vi' | 'en') => void} props.setLocale
 */
export function UknowLandingNav({ nav, locale, setLocale }) {
  return (
    <nav className="fixed left-0 right-0 top-0 z-[200] flex h-[68px] items-center justify-between border-b border-uknow-border bg-[rgba(250,248,243,0.95)] px-[5%] backdrop-blur-[16px] sm:px-[6%]">
      <a href="#top" className="font-display text-[1.6rem] font-black tracking-[-0.5px] text-uknow-teal">
        U<span className="text-uknow-gold">Know</span>
        <span className="hidden sm:inline">.edu.vn</span>
      </a>

      <div className="flex flex-wrap items-center justify-end gap-4 sm:gap-5">
        <div className="nav-instructor hidden max-w-[min(100%,280px)] items-center gap-2 text-[0.82rem] text-uknow-muted min-[981px]:flex">
          <img
            src={INSTRUCTOR_PHOTO_SRC}
            alt={nav.instructorPhotoAlt}
            className="h-[30px] w-[30px] shrink-0 rounded-full border-2 border-uknow-teal-light bg-white object-cover"
            width={30}
            height={30}
            loading="eager"
            decoding="async"
          />
          <span>
            {nav.instructorPrefix} <strong className="font-bold text-uknow-ink">{nav.instructorName}</strong>
          </span>
        </div>

        <div
          className="flex rounded-lg border border-uknow-border bg-white/90 p-0.5 text-xs font-semibold shadow-sm"
          role="group"
          aria-label="Language"
        >
          <button
            type="button"
            onClick={() => setLocale('vi')}
            className={`rounded-md px-2.5 py-1.5 transition sm:px-3 ${
              locale === 'vi' ? 'bg-uknow-teal font-semibold text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {nav.langVi}
          </button>
          <button
            type="button"
            onClick={() => setLocale('en')}
            className={`rounded-md px-2.5 py-1.5 transition sm:px-3 ${
              locale === 'en' ? 'bg-uknow-teal font-semibold text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {nav.langEn}
          </button>
        </div>

        <a
          href="#dang-ky"
          className="whitespace-nowrap rounded-md border border-transparent bg-uknow-teal px-4 py-2.5 text-[0.875rem] font-semibold text-white transition hover:bg-uknow-teal-mid hover:shadow-sm sm:px-[22px]"
        >
          {nav.register}
        </a>
      </div>
    </nav>
  );
}

import { Link } from 'react-router-dom';
import { INSTRUCTOR_PHOTO_SRC } from '../constants/landingAssets.js';

/**
 * Thanh điều hướng cố định — logo, dòng giảng viên (ẩn trên màn hẹp như mock), VI/EN, CTA.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.nav} props.nav
 * @param {'vi' | 'en'} props.locale
 * @param {(l: 'vi' | 'en') => void} props.setLocale
 */
export function FounderLandingNav({ nav, locale, setLocale }) {
  return (
    <nav className="fixed left-0 right-0 top-0 z-[200] flex h-[68px] items-center justify-between border-b border-founder-border bg-[rgba(250,248,243,0.95)] px-[5%] backdrop-blur-[16px] sm:px-[6%]">
      <a href="#top" className="font-landing text-[1.6rem] font-black tracking-[-0.5px] text-founder-teal">
        U<span className="text-founder-gold">Know</span>
        <span className="hidden sm:inline">.edu.vn</span>
      </a>

      <div className="flex flex-wrap items-center justify-end gap-4 sm:gap-5">
        <div className="nav-instructor hidden max-w-[min(100%,280px)] items-center gap-2 text-[0.82rem] text-founder-muted min-[981px]:flex">
          <img
            src={INSTRUCTOR_PHOTO_SRC}
            alt={nav.instructorPhotoAlt}
            className="h-[30px] w-[30px] shrink-0 rounded-full border-2 border-founder-teal-light bg-white object-cover"
            width={30}
            height={30}
            loading="eager"
            decoding="async"
          />
          <span>
            {nav.instructorPrefix} <strong className="font-bold text-founder-ink">{nav.instructorName}</strong>
          </span>
        </div>

        <div
          className="flex rounded-lg border border-founder-border bg-white/90 p-0.5 text-xs font-semibold shadow-sm"
          role="group"
          aria-label="Language"
        >
          <button
            type="button"
            onClick={() => setLocale('vi')}
            className={`rounded-md px-2.5 py-1.5 transition sm:px-3 ${
              locale === 'vi' ? 'bg-founder-teal font-semibold text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {nav.langVi}
          </button>
          <button
            type="button"
            onClick={() => setLocale('en')}
            className={`rounded-md px-2.5 py-1.5 transition sm:px-3 ${
              locale === 'en' ? 'bg-founder-teal font-semibold text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {nav.langEn}
          </button>
        </div>

        <Link
          to="/register"
          className="whitespace-nowrap rounded-md border border-transparent bg-founder-teal px-4 py-2.5 text-[0.875rem] font-semibold text-white transition hover:bg-founder-teal-mid hover:shadow-sm sm:px-[22px]"
        >
          {nav.register}
        </Link>
      </div>
    </nav>
  );
}

/**
 * Thanh điều hướng cố định: logo, chuyển VI/EN, CTA đăng ký (anchor).
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.nav} props.nav
 * @param {'vi' | 'en'} props.locale
 * @param {(l: 'vi' | 'en') => void} props.setLocale
 */
export function UknowLandingNav({ nav, locale, setLocale }) {
  return (
    <nav className="fixed left-0 right-0 top-0 z-[100] flex items-center justify-between border-b border-uknow-border bg-[rgba(250,248,244,0.92)] px-[5%] py-4 backdrop-blur-md">
      <a href="#top" className="flex items-center gap-2 text-xl font-black tracking-tight text-uknow-ink sm:text-2xl">
        U<span className="text-uknow-gold">Know</span>
        <span className="hidden font-semibold text-uknow-muted sm:inline">.edu.vn</span>
      </a>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        <div
          className="flex rounded-lg border border-uknow-border bg-white/90 p-0.5 text-xs font-semibold shadow-sm"
          role="group"
          aria-label="Language"
        >
          <button
            type="button"
            onClick={() => setLocale('vi')}
            className={`rounded-md px-2.5 py-1.5 transition sm:px-3 ${
              locale === 'vi'
                ? 'bg-[#0d6e6e] font-semibold text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            VI
          </button>
          <button
            type="button"
            onClick={() => setLocale('en')}
            className={`rounded-md px-2.5 py-1.5 transition sm:px-3 ${
              locale === 'en'
                ? 'bg-[#0d6e6e] font-semibold text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            EN
          </button>
        </div>
        <a
          href="#dang-ky"
          className="rounded-lg border border-transparent bg-[#0d6e6e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#12a0a0] sm:px-6 sm:py-2.5"
        >
          {nav.register}
        </a>
      </div>
    </nav>
  );
}

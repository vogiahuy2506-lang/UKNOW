import { Link } from 'react-router-dom';
import { FOOTER_ACCENT, LANDING_SURFACE } from '../constants/landingTheme.js';

/**
 * Chân trang — nền tối cố định (inline style), không phụ thuộc JIT Tailwind.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.footer} props.footer
 */
export function UknowLandingFooter({ footer }) {
  return (
    <footer
      className="px-[6%] py-12 text-white sm:px-[8%]"
      style={{
        backgroundColor: LANDING_SURFACE,
        colorScheme: 'dark',
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-10 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <div className="font-landing text-[1.3rem] font-black leading-tight">
            <span className="text-white">U</span>
            <span style={{ color: FOOTER_ACCENT }}>Know</span>
            <span className="text-white">.edu.vn</span>
          </div>
          <p className="mt-2 max-w-2xl text-[0.78rem] leading-relaxed text-[#94a3b8]">
            {footer.tagline}
          </p>
          <p className="mt-1 max-w-2xl text-[0.78rem] leading-relaxed text-[#94a3b8]">
            {footer.instructorLine}{' '}
            <a
              href="https://ngohuuthong.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#94a3b8] underline-offset-2 hover:text-zinc-300"
            >
              ngohuuthong.com
            </a>
          </p>
        </div>

        <div className="flex w-full flex-col items-stretch gap-4 lg:w-auto lg:items-end">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-[0.82rem] font-medium text-[#94a3b8] lg:justify-end">
            <Link to="/privacy-policy" className="transition hover:text-white">
              {footer.privacy}
            </Link>
          </div>
          <a
            href="https://ngohuuthong.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.82rem] font-medium transition hover:text-amber-300 lg:text-right"
            style={{ color: FOOTER_ACCENT }}
          >
            {footer.ngohuuLink}
          </a>
        </div>
      </div>
    </footer>
  );
}

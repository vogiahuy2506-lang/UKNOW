/**
 * Chân trang: tagline, liên hệ, copyright.
 *
 * @param {object} props
 * @param {import('../constants/landingCopy.js').LANDING_COPY.vi.footer} props.footer
 */
export function UknowLandingFooter({ footer }) {
  return (
    <footer className="border-t border-white/10 bg-uknow-ink px-[6%] py-12 text-[0.82rem] text-white/55 sm:px-[8%]">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[1.15rem] font-black text-white">
            U<span className="text-uknow-gold">Know</span>
          </div>
          <p className="mt-2 max-w-md text-sm leading-relaxed">{footer.tagline}</p>
          <p className="mt-3 text-xs">{footer.contactLine}</p>
          <p className="text-xs">{footer.address}</p>
        </div>
        <div className="text-right sm:text-right">
          <a
            href="https://uknow.edu.vn/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-semibold text-uknow-gold hover:text-white"
          >
            {footer.visitSite}
          </a>
          <p className="mt-3 text-xs">
            © {new Date().getFullYear()} {footer.copyright}
          </p>
        </div>
      </div>
    </footer>
  );
}

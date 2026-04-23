import { getOptionLabel, UKNOW_INTEREST_OPTIONS, UKNOW_OCCUPATION_OPTIONS } from '../constants/uknowLandingOptions.js';

/**
 * Thẻ form đăng ký lead — khớp mock `.form-card`; link chính sách nội bộ `/privacy-policy`.
 *
 * @param {object} props
 * @param {'vi' | 'en'} props.locale
 * @param {object} props.formCopy Nhóm chuỗi `copy.form`
 * @param {object} props.form
 * @param {function} props.setField
 * @param {boolean} props.submitting
 * @param {string} props.error
 * @param {boolean} props.success
 * @param {function} props.onSubmit
 * @param {'default' | 'embed'} [props.variant] — `embed`: iframe landing, một khối trắng + tiêu đề gọn, không kem/vàng phụ.
 */
export function UknowLeadFormCard({
  locale,
  formCopy,
  form,
  setField,
  submitting,
  error,
  success,
  onSubmit,
  variant = 'default',
}) {
  const isEmbed = variant === 'embed';
  /** Nền ô nhập: embed dùng xám rất nhạt để khớp “một khối trắng”, tránh tông kem. */
  const fieldSurface = isEmbed
    ? 'border-gray-200 bg-gray-50 focus:border-uknow-teal focus:bg-white'
    : 'border-uknow-border bg-uknow-cream focus:border-uknow-teal focus:bg-white';

  if (success) {
    return (
      <div
        className={
          isEmbed
            ? 'relative z-[2] w-full max-w-[430px] rounded-xl border border-gray-200 bg-white px-6 pb-8 pt-8 shadow-sm'
            : 'relative z-[2] w-full max-w-[430px] rounded-[20px] border border-uknow-border bg-white px-[34px] pb-10 pt-10 shadow-[0_24px_64px_rgba(11,85,99,0.1),0_4px_16px_rgba(0,0,0,0.04)]'
        }
      >
        {!isEmbed ? (
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 h-1 rounded-t-[20px] bg-gradient-to-r from-uknow-teal to-uknow-gold-light"
            aria-hidden
          />
        ) : (
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 h-0.5 rounded-t-xl bg-uknow-teal"
            aria-hidden
          />
        )}
        <div className={isEmbed ? 'py-2 text-center' : 'py-5 text-center'}>
          <div
            className={
              isEmbed
                ? 'mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#e0f4f6]'
                : 'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#e0f4f6]'
            }
          >
            <svg
              className={isEmbed ? 'h-6 w-6 text-uknow-teal' : 'h-7 w-7 text-uknow-teal'}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className={isEmbed ? 'text-lg font-bold text-gray-900' : 'text-xl font-extrabold text-uknow-ink'}>
            {formCopy.successTitle}
          </h3>
          <p
            className={
              isEmbed
                ? 'mt-2 text-sm leading-relaxed text-gray-600'
                : 'mt-3 text-[0.88rem] leading-relaxed text-uknow-muted'
            }
          >
            {isEmbed && formCopy.embedSuccessBody ? formCopy.embedSuccessBody : formCopy.successBody}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        isEmbed
          ? 'relative z-[2] w-full max-w-[430px] rounded-xl border border-gray-200 bg-white px-6 pb-6 pt-7 shadow-sm'
          : 'relative z-[2] w-full max-w-[430px] animate-uknow-fade-up rounded-[20px] border border-uknow-border bg-white px-[34px] pb-9 pt-10 shadow-[0_24px_64px_rgba(11,85,99,0.1),0_4px_16px_rgba(0,0,0,0.04)] [animation-delay:350ms]'
      }
    >
      {!isEmbed ? (
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 h-1 rounded-t-[20px] bg-gradient-to-r from-uknow-teal to-uknow-gold-light"
          aria-hidden
        />
      ) : (
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 h-0.5 rounded-t-xl bg-uknow-teal"
          aria-hidden
        />
      )}
      {isEmbed ? (
        <div className="mb-5">
          <h2 className="font-landing text-base sm:text-lg font-bold leading-snug tracking-tight text-gray-900">
            {formCopy.embedTitle}
          </h2>
        </div>
      ) : (
        <div className="mb-6">
          <p className="mb-2 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[1.5px] text-uknow-teal">
            <span aria-hidden>🎁</span> {formCopy.cardEyebrow}
          </p>
          <h2 className="font-landing text-[1.4rem] font-black leading-tight tracking-[-0.3px] text-uknow-ink">
            {formCopy.cardTitleLine1}
            <br />
            {formCopy.cardTitleLine2}
          </h2>
          <p className="mt-2 text-[0.84rem] leading-relaxed text-uknow-muted">{formCopy.cardSubtitle}</p>
        </div>
      )}

      <form
        className="space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {/* Embed: gutter rõ giữa Họ / Tên để hai cột không dính sát. */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${isEmbed ? 'gap-4' : 'gap-2.5'}`}>
          <div>
            <label htmlFor="uknow-last" className="mb-1.5 block text-[0.78rem] font-semibold text-[#3a3a3a]">
              {formCopy.lastName} <span className="text-red-500">*</span>
            </label>
            <input
              id="uknow-last"
              type="text"
              autoComplete="family-name"
              placeholder={formCopy.placeholders.lastName}
              required
              value={form.lastName}
              onChange={(e) => setField('lastName', e.target.value)}
              className={`w-full rounded-lg border-[1.5px] px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)] ${fieldSurface}`}
            />
          </div>
          <div>
            <label htmlFor="uknow-first" className="mb-1.5 block text-[0.78rem] font-semibold text-[#3a3a3a]">
              {formCopy.firstName} <span className="text-red-500">*</span>
            </label>
            <input
              id="uknow-first"
              type="text"
              autoComplete="given-name"
              placeholder={formCopy.placeholders.firstName}
              required
              value={form.firstName}
              onChange={(e) => setField('firstName', e.target.value)}
              className={`w-full rounded-lg border-[1.5px] px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)] ${fieldSurface}`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="uknow-email" className="mb-1.5 block text-[0.78rem] font-semibold text-[#3a3a3a]">
            {formCopy.email} <span className="text-red-500">*</span>
          </label>
          <input
            id="uknow-email"
            type="email"
            autoComplete="email"
            placeholder={formCopy.placeholders.email}
            required
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            className={`w-full rounded-lg border-[1.5px] px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)] ${fieldSurface}`}
          />
        </div>

        <div>
          <label htmlFor="uknow-phone" className="mb-1.5 block text-[0.78rem] font-semibold text-[#3a3a3a]">
            {formCopy.phone} <span className="text-red-500">*</span>
          </label>
          <input
            id="uknow-phone"
            type="tel"
            autoComplete="tel"
            placeholder={formCopy.placeholders.phone}
            required
            value={form.phone}
            onChange={(e) => setField('phone', e.target.value)}
            className={`w-full rounded-lg border-[1.5px] px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)] ${fieldSurface}`}
          />
        </div>

        <div>
          <label htmlFor="uknow-job" className="mb-1.5 block text-[0.78rem] font-semibold text-[#3a3a3a]">
            {formCopy.occupation}
          </label>
          <select
            id="uknow-job"
            value={form.occupation}
            onChange={(e) => setField('occupation', e.target.value)}
            className={`w-full appearance-none rounded-lg border-[1.5px] px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)] ${fieldSurface}`}
          >
            <option value="">{formCopy.selectOccupation}</option>
            {UKNOW_OCCUPATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {getOptionLabel(opt, locale)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="uknow-interest" className="mb-1.5 block text-[0.78rem] font-semibold text-[#3a3a3a]">
            {formCopy.interest}
          </label>
          <select
            id="uknow-interest"
            value={form.interestArea}
            onChange={(e) => setField('interestArea', e.target.value)}
            className={`w-full appearance-none rounded-lg border-[1.5px] px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)] ${fieldSurface}`}
          >
            <option value="">{formCopy.selectInterest}</option>
            {UKNOW_INTEREST_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {getOptionLabel(opt, locale)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-start gap-2.5 pt-1">
          <input
            id="uknow-agree"
            type="checkbox"
            checked={form.marketingConsent}
            onChange={(e) => setField('marketingConsent', e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-uknow-teal"
          />
          <label htmlFor="uknow-agree" className="cursor-pointer text-[0.78rem] leading-relaxed text-uknow-muted">
            {formCopy.consentPrefix}{' '}
            <a
              href="/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-uknow-teal underline underline-offset-2"
            >
              {formCopy.privacyLink}
            </a>
            .
          </label>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="relative w-full overflow-hidden rounded-lg bg-gradient-to-br from-uknow-teal to-uknow-teal-mid py-3.5 text-[0.975rem] font-bold tracking-wide text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(11,85,99,0.35)] active:translate-y-0 disabled:opacity-60"
        >
          {submitting ? formCopy.submitting : `${formCopy.submit} →`}
        </button>

        {/* Embed: cùng dòng bảo mật dưới nút như landing chính (icon khóa + chữ). */}
        <div
          className={
            isEmbed
              ? 'flex items-center justify-start gap-1.5 pt-2 text-[0.72rem] text-gray-600'
              : 'flex items-center justify-center gap-1.5 pt-1 text-[0.72rem] text-uknow-muted'
          }
        >
          <svg className="h-3.5 w-3.5 shrink-0 opacity-75" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          {formCopy.secureNote}
        </div>
      </form>
    </div>
  );
}

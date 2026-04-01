import { Link } from 'react-router-dom';
import { getOptionLabel, UKNOW_INTEREST_OPTIONS, UKNOW_OCCUPATION_OPTIONS } from '../constants/uknowLandingOptions.js';

/**
 * Thẻ form đăng ký lead — khớp mock `.form-card`; link chính sách nội bộ `/private-policy`.
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
 */
export function UknowLeadFormCard({ locale, formCopy, form, setField, submitting, error, success, onSubmit }) {
  if (success) {
    return (
      <div className="relative z-[2] w-full max-w-[430px] rounded-[20px] border border-uknow-border bg-white px-[34px] pb-10 pt-10 shadow-[0_24px_64px_rgba(11,85,99,0.1),0_4px_16px_rgba(0,0,0,0.04)]">
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 h-1 rounded-t-[20px] bg-gradient-to-r from-uknow-teal to-uknow-gold-light"
          aria-hidden
        />
        <div className="py-5 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#e0f4f6]">
            <svg className="h-7 w-7 text-uknow-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-extrabold text-uknow-ink">{formCopy.successTitle}</h3>
          <p className="mt-3 text-[0.88rem] leading-relaxed text-uknow-muted">{formCopy.successBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-[2] w-full max-w-[430px] animate-uknow-fade-up rounded-[20px] border border-uknow-border bg-white px-[34px] pb-9 pt-10 shadow-[0_24px_64px_rgba(11,85,99,0.1),0_4px_16px_rgba(0,0,0,0.04)] [animation-delay:350ms]">
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 h-1 rounded-t-[20px] bg-gradient-to-r from-uknow-teal to-uknow-gold-light"
        aria-hidden
      />
      <div className="mb-6">
        <p className="mb-2 flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-[1.5px] text-uknow-teal">
          <span aria-hidden>🎁</span> {formCopy.cardEyebrow}
        </p>
        <h2 className="font-display text-[1.4rem] font-black leading-tight tracking-[-0.3px] text-uknow-ink">
          {formCopy.cardTitleLine1}
          <br />
          {formCopy.cardTitleLine2}
        </h2>
        <p className="mt-2 text-[0.84rem] leading-relaxed text-uknow-muted">{formCopy.cardSubtitle}</p>
      </div>

      <form
        className="space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
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
              className="w-full rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:border-uknow-teal focus:bg-white focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)]"
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
              className="w-full rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:border-uknow-teal focus:bg-white focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)]"
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
            className="w-full rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:border-uknow-teal focus:bg-white focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)]"
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
            className="w-full rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:border-uknow-teal focus:bg-white focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)]"
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
            className="w-full appearance-none rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:border-uknow-teal focus:bg-white focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)]"
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
            className="w-full appearance-none rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.875rem] text-uknow-ink outline-none transition focus:border-uknow-teal focus:bg-white focus:shadow-[0_0_0_3px_rgba(11,85,99,0.1)]"
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
            <Link to="/private-policy" className="font-medium text-uknow-teal underline underline-offset-2">
              {formCopy.privacyLink}
            </Link>
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

        <div className="flex items-center justify-center gap-1.5 pt-1 text-[0.72rem] text-uknow-muted">
          <svg className="h-3 w-3 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          {formCopy.secureNote}
        </div>
      </form>
    </div>
  );
}

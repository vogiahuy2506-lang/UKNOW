import { Link } from 'react-router-dom';
import { getOptionLabel, UKNOW_INTEREST_OPTIONS, UKNOW_OCCUPATION_OPTIONS } from '../constants/uknowLandingOptions.js';

/**
 * Thẻ form đăng ký lead — giữ nguyên field và payload; chuỗi UI theo `formCopy` + `locale`.
 *
 * @param {object} props
 * @param {'vi' | 'en'} props.locale
 * @param {object} props.formCopy Nhóm chuỗi `copy.form` (nhãn, placeholder, thông báo)
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
      <div className="relative z-[2] w-full max-w-[440px] rounded-2xl border border-uknow-border bg-white p-9 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
        <div className="py-5 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
            <svg className="h-7 w-7 text-[#0d6e6e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-extrabold text-uknow-ink">{formCopy.successTitle}</h3>
          <p className="mt-2 text-sm leading-relaxed text-uknow-muted">{formCopy.successBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-[2] w-full max-w-[440px] rounded-2xl border border-uknow-border bg-white p-9 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
      <div className="mb-7">
        <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-widest text-[#0d6e6e]">{formCopy.cardEyebrow}</p>
        <h2 className="text-2xl font-extrabold leading-tight text-uknow-ink">{formCopy.cardTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-uknow-muted">{formCopy.cardSubtitle}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="uknow-last" className="mb-1.5 block text-[0.8rem] font-semibold text-[#444]">
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
              className="w-full rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.9rem] text-uknow-ink outline-none transition focus:border-[#0d6e6e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,110,110,0.12)]"
            />
          </div>
          <div>
            <label htmlFor="uknow-first" className="mb-1.5 block text-[0.8rem] font-semibold text-[#444]">
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
              className="w-full rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.9rem] text-uknow-ink outline-none transition focus:border-[#0d6e6e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,110,110,0.12)]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="uknow-email" className="mb-1.5 block text-[0.8rem] font-semibold text-[#444]">
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
            className="w-full rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.9rem] text-uknow-ink outline-none transition focus:border-[#0d6e6e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,110,110,0.12)]"
          />
        </div>

        <div>
          <label htmlFor="uknow-phone" className="mb-1.5 block text-[0.8rem] font-semibold text-[#444]">
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
            className="w-full rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.9rem] text-uknow-ink outline-none transition focus:border-[#0d6e6e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,110,110,0.12)]"
          />
        </div>

        <div>
          <label htmlFor="uknow-job" className="mb-1.5 block text-[0.8rem] font-semibold text-[#444]">
            {formCopy.occupation} <span className="text-red-500">*</span>
          </label>
          <select
            id="uknow-job"
            required
            value={form.occupation}
            onChange={(e) => setField('occupation', e.target.value)}
            className="w-full appearance-none rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.9rem] text-uknow-ink outline-none transition focus:border-[#0d6e6e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,110,110,0.12)]"
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
          <label htmlFor="uknow-interest" className="mb-1.5 block text-[0.8rem] font-semibold text-[#444]">
            {formCopy.interest} <span className="text-red-500">*</span>
          </label>
          <select
            id="uknow-interest"
            required
            value={form.interestArea}
            onChange={(e) => setField('interestArea', e.target.value)}
            className="w-full appearance-none rounded-lg border-[1.5px] border-uknow-border bg-uknow-cream px-3.5 py-2.5 text-[0.9rem] text-uknow-ink outline-none transition focus:border-[#0d6e6e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,110,110,0.12)]"
          >
            <option value="">{formCopy.selectInterest}</option>
            {UKNOW_INTEREST_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {getOptionLabel(opt, locale)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-start gap-2.5">
          <input
            id="uknow-agree"
            type="checkbox"
            checked={form.marketingConsent}
            onChange={(e) => setField('marketingConsent', e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#0d6e6e]"
          />
          <label htmlFor="uknow-agree" className="cursor-pointer text-[0.8rem] leading-relaxed text-uknow-muted">
            {formCopy.consentPrefix}{' '}
            <Link to="/privacy-policy" className="font-medium text-[#0d6e6e] underline">
              {formCopy.privacyLink}
            </Link>
            .
          </label>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-gradient-to-br from-[#0d6e6e] to-[#12a0a0] py-3.5 text-base font-bold text-white shadow-sm transition hover:-translate-y-px hover:shadow-md disabled:opacity-60"
        >
          {submitting ? formCopy.submitting : formCopy.submit}
        </button>

        <div className="flex items-center justify-center gap-1.5 pt-1 text-[0.75rem] text-uknow-muted">
          <svg className="h-3 w-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          {formCopy.secureNote}
        </div>
      </form>
    </div>
  );
}

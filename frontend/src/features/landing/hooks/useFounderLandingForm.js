/**
 * @deprecated Lớp tương thích cho landing page CŨ còn `<iframe src="/embed/lead-form?slug=...">`
 * (khôi phục từ commit 50c05cd2 sau khi 3c514bc8 xoá route này). Gỡ sau khi các trang cũ được
 * lưu lại (backend tự strip iframe khi lưu). Bản gốc 50c05cd2 còn hỗ trợ occupation/interestArea/
 * customFields động qua `leadFormConfig.fixedFields`/`leadFormConfig.customFields` — nhưng
 * `landingLeadFormConfig.js` hiện tại (3c514bc8) đã bỏ 2 field đó khỏi normalizeLeadFormConfig
 * (không còn UI admin cấu hình chúng), nên bản này CHỦ ĐỘNG bỏ occupation/interestArea/
 * customFields, chỉ giữ name/email/phone/marketingConsent — đúng những gì
 * landingLeadFormConfig.js hiện còn cung cấp.
 */
import { useCallback, useState } from 'react';
import { LANDING_COPY } from '../constants/landingCopy.js';
import { postPublicLead } from '../services/leadPublicApi.js';
import { getOrCreateLandingVisitorId } from '../../landing-pages/utils/landingVisitorId.js';
import { buildPublicLeadPayload } from '../utils/leadFields.js';

const initialForm = () => ({
  lastName: '',
  firstName: '',
  email: '',
  phone: '',
  marketingConsent: false,
});

/**
 * Hook quản lý form đăng ký landing Founder AI (lớp tương thích embed): state, validate, submit.
 *
 * @param {'vi' | 'en'} locale
 * @param {{ landingPageSlug?: string|null }} [options]
 */
export function useFounderLandingForm(locale = 'vi', options = {}) {
  const landingPageSlug =
    options.landingPageSlug != null && String(options.landingPageSlug).trim()
      ? String(options.landingPageSlug).trim().toLowerCase()
      : null;
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  }, []);

  const validate = useCallback(() => {
    const v = LANDING_COPY[locale === 'en' ? 'en' : 'vi'].form.validation;
    if (!String(form.lastName).trim() || !String(form.firstName).trim()) {
      return v.fullName;
    }
    const email = String(form.email).trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return v.email;
    }
    const phone = String(form.phone).replace(/\s+/g, '');
    if (!phone || phone.replace(/\D/g, '').length < 8) {
      return v.phone;
    }
    return '';
  }, [form, locale]);

  const submit = useCallback(async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const visitorId = landingPageSlug ? getOrCreateLandingVisitorId() : null;
      const payload = buildPublicLeadPayload({
        form,
        leadFormConfig: null,
        landingPageSlug,
        visitorId,
      });
      await postPublicLead(payload);
      setSuccess(true);
    } catch (e) {
      const v = LANDING_COPY[locale === 'en' ? 'en' : 'vi'].form.validation;
      const m = e?.response?.data?.message || e?.message || v.genericError;
      setError(typeof m === 'string' ? m : v.genericError);
    } finally {
      setSubmitting(false);
    }
  }, [form, validate, locale, landingPageSlug]);

  return {
    form,
    setField,
    submitting,
    error,
    success,
    validate,
    submit,
  };
}

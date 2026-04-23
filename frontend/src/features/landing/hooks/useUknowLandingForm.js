import { useCallback, useState } from 'react';
import { LANDING_COPY } from '../constants/landingCopy.js';
import { postPublicLead } from '../services/leadPublicApi.js';
import { getOrCreateLandingVisitorId } from '../../landing-pages/utils/landingVisitorId.js';

const initialForm = () => ({
  lastName: '',
  firstName: '',
  email: '',
  phone: '',
  occupation: '',
  interestArea: '',
  marketingConsent: true,
});

/**
 * Hook quản lý form đăng ký landing UKnow: state, validate, submit.
 *
 * @param {'vi' | 'en'} locale Ngôn ngữ thông báo lỗi (payload gửi API không đổi).
 * @param {{ landingPageSlug?: string|null }} [options] Gán nguồn lead (slug landing hoặc `l` cho /l).
 * @returns {object}
 */
export function useUknowLandingForm(locale = 'vi', options = {}) {
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
    if (!form.marketingConsent) {
      return v.consent;
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
      const phone = String(form.phone).replace(/\s+/g, ' ').trim();
      const payload = {
        lastName: String(form.lastName).trim(),
        firstName: String(form.firstName).trim(),
        email: String(form.email).trim().toLowerCase(),
        phone,
        occupation: String(form.occupation ?? '').trim(),
        interestArea: String(form.interestArea ?? '').trim(),
        marketingConsent: Boolean(form.marketingConsent),
      };
      if (landingPageSlug) {
        payload.landingPageSlug = landingPageSlug;
        payload.visitorId = getOrCreateLandingVisitorId();
      }
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
    submit,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { LANDING_COPY } from '../constants/landingCopy.js';
import { postPublicLead } from '../services/leadPublicApi.js';
import { getOrCreateLandingVisitorId } from '../../landing-pages/utils/landingVisitorId.js';
import { normalizeLeadFormConfig } from '../../landing-pages/utils/landingLeadFormConfig.js';
import { buildPublicLeadPayload } from '../utils/leadFields.js';

const initialForm = () => ({
  lastName: '',
  firstName: '',
  email: '',
  phone: '',
  occupation: '',
  interestArea: '',
  marketingConsent: false,
  customFields: {},
});

/**
 * Hook quản lý form đăng ký landing Founder AI: state, validate, submit.
 *
 * @param {'vi' | 'en'} locale
 * @param {{ landingPageSlug?: string|null, leadFormConfig?: object|null }} [options]
 */
export function useFounderLandingForm(locale = 'vi', options = {}) {
  const landingPageSlug =
    options.landingPageSlug != null && String(options.landingPageSlug).trim()
      ? String(options.landingPageSlug).trim().toLowerCase()
      : null;
  const leadFormConfig = normalizeLeadFormConfig(options.leadFormConfig);
  const configKey = JSON.stringify(options.leadFormConfig || null);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const cfg = normalizeLeadFormConfig(options.leadFormConfig);
    const allowed = new Set((cfg.customFields || []).map((f) => f.key));
    setForm((prev) => {
      const nextCustom = {};
      Object.keys(prev.customFields || {}).forEach((key) => {
        if (allowed.has(key)) nextCustom[key] = prev.customFields[key];
      });
      return {
        ...prev,
        occupation: cfg.fixedFields.occupation.visible ? prev.occupation : '',
        interestArea: cfg.fixedFields.interestArea.visible ? prev.interestArea : '',
        customFields: nextCustom,
      };
    });
  }, [configKey, options.leadFormConfig]);

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
    for (const field of leadFormConfig.customFields || []) {
      if (!field.required) continue;
      const raw = form.customFields?.[field.key];
      if (field.type === 'checkbox') {
        if (raw !== true) return locale === 'en' ? `Please fill ${field.labelEn || field.labelVi}` : `Vui lòng điền ${field.labelVi}`;
      } else if (raw == null || String(raw).trim() === '') {
        return locale === 'en' ? `Please fill ${field.labelEn || field.labelVi}` : `Vui lòng điền ${field.labelVi}`;
      }
    }
    return '';
  }, [form, locale, leadFormConfig]);

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
        leadFormConfig,
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
  }, [form, validate, locale, landingPageSlug, leadFormConfig]);

  return {
    form,
    setField,
    submitting,
    error,
    success,
    submit,
    validate,
  };
}

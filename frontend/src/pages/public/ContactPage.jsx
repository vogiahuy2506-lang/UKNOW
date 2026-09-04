import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineMail, HiOutlinePhone, HiOutlineLocationMarker,
  HiOutlineCheckCircle, HiOutlineArrowRight,
  HiOutlineClock, HiOutlineIdentification,
} from 'react-icons/hi';
import { FaArrowRight } from 'react-icons/fa';
import PublicFooter from './components/PublicFooter';
import { submitContactForm } from '../../services/contactApi.service';
import AnimatedSection from '../../components/AnimatedSection';
import { useI18n } from '../../i18n';
import { usePublicLandingOverrides } from '../../features/landing-customizer';
import HeroChatWidget from '../../features/hero/components/HeroChatWidget';

const getChannels = (t) => [
  {
    icon: HiOutlineMail,
    iconBg: 'bg-gradient-to-br from-orange-500 to-orange-600',
    iconRing: 'bg-orange-100',
    label: t('contact.channelEmailLabel'),
    value: 'hotro.digibook@gmail.com',
    meta: t('contact.channelEmailMeta'),
    href: 'mailto:hotro.digibook@gmail.com',
  },
  {
    icon: HiOutlinePhone,
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
    iconRing: 'bg-blue-100',
    label: t('contact.channelHotlineLabel'),
    value: '(+84) 877 909 606',
    meta: t('contact.channelHotlineMeta'),
    href: 'tel:+84877909606',
  },
  {
    icon: HiOutlineIdentification,
    iconBg: 'bg-gradient-to-br from-purple-500 to-pink-600',
    iconRing: 'bg-purple-100',
    label: t('contact.channelTaxIdLabel'),
    value: '0316725362',
    meta: t('contact.channelTaxIdMeta'),
    href: null,
  },
{
  icon: HiOutlineLocationMarker,
  iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
  iconRing: 'bg-emerald-100',
  label: t('contact.channelOfficeLabel'),
  value: t('contact.channelOfficeValue'),
  meta: t('contact.channelOfficeMeta'),
  href: 'https://maps.google.com/?q=I101B+Building,+Software+Park,+VNU-HCM,+Ho+Chi+Minh+City',
},
];

const getTrustStats = (t) => [
  { value: '< 24h', label: t('contact.trustStat1Label') },
  { value: '500+', label: t('contact.trustStat2Label') },
  { value: '4.9★', label: t('contact.trustStat3Label') },
];

function useBusinessStatus(t) {
  const [status, setStatus] = useState({ isOpen: false, label: '', detail: '' });

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const day = now.getDay();
      const hour = now.getHours();
      const inWorkDay = day >= 1 && day <= 5;
      const inWorkHour = hour >= 8 && hour < 17;
      const isOpen = inWorkDay && inWorkHour;

      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const timeStr = `${hh}:${mm}`;

      setStatus({
        isOpen,
        label: isOpen ? t('contact.statusOpen') : t('contact.statusClosed'),
        detail: isOpen
          ? t('contact.statusOpenDetail', { time: timeStr })
          : t('contact.statusClosedDetail'),
      });
    };

    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [t]);

  return status;
}

export default function ContactPage() {
  const { t } = useI18n();
  const { getOverride } = usePublicLandingOverrides('contact');
  const businessStatus = useBusinessStatus(t);
  const contactChannels = getChannels(t);
  const trustStats = getTrustStats(t);

  const getValue = (key, fallback) => {
    const override = getOverride(key);
    return override || fallback;
  };

  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = t('contact.validationRequired');
    if (!form.email.trim()) {
      nextErrors.email = t('contact.validationRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = t('contact.validationEmail');
    }
    if (!form.message.trim()) {
      nextErrors.message = t('contact.validationRequired');
    } else if (form.message.trim().length < 10) {
      nextErrors.message = t('contact.validationMinLength', { n: 10 });
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const res = await submitContactForm(form);
      toast.success(res.data?.message || t('contact.sentSuccess'));
      setSubmitted(true);
      setForm({ name: '', email: '', phone: '', company: '', message: '' });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('contact.errorMessage'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero Section ── */}
      <section className="relative px-6 pt-12 pb-16 md:pt-16 md:pb-20 overflow-hidden">
        {/* Background dots */}
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />

        {/* Decorative shapes */}
        <div className="absolute top-16 left-10 w-24 h-24 border border-orange-200 rounded-full opacity-40" />
        <div className="absolute top-40 right-16 w-16 h-16 border border-blue-200 rounded-2xl rotate-12 opacity-40" />
        <div className="absolute bottom-20 left-20 w-12 h-12 border border-purple-200 rounded-full opacity-40" />
        <div className="absolute bottom-32 right-32 w-8 h-8 bg-orange-100 rounded-lg rotate-45 opacity-30" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span data-edit="contact.tagline">{getValue('contact.tagline', t('contact.tagline'))}</span>
          </div>

          {/* Title */}
          <h1
            className="text-slate-900 mb-6 whitespace-nowrap"
            style={{ fontSize: 'clamp(32px, 6vw, 56px)', lineHeight: 1.15, fontWeight: 600 }}
            data-edit="contact.title"
          >
            {t('contact.title')}{' '}
            <span className="text-orange-500">{t('contact.titleHighlight')}</span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-slate-600 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
            data-edit="contact.subtitle"
          >
            {t('contact.subtitle')}
          </p>
        </div>
      </section>

      {/* ── DIVIDER ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      {/* ── CONTACT SECTION ── */}
      <section className="pt-12 pb-10 md:pt-14 md:pb-24 bg-white relative overflow-hidden">
        {/* Grid background */}
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-[5fr_6fr] gap-6 lg:gap-8 items-stretch">

            {/* ── Left Panel — Contact Hub ── */}
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/50 to-white p-6 md:p-7 flex flex-col">
              {/* Status bar */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    {businessStatus.isOpen && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${businessStatus.isOpen ? 'bg-green-500' : 'bg-slate-400'}`} />
                  </span>
                  <span className="text-xs font-semibold text-slate-700">
                    {businessStatus.label}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <HiOutlineClock className="w-3 h-3" />
                  {t('contact.workHours')}
                </span>
              </div>

              {/* Header */}
              <div className="mb-5">
                <h3
                  className="text-slate-900 leading-tight mb-1.5"
                  style={{ fontSize: 'clamp(20px, 2.6vw, 26px)', fontWeight: 600 }}
                >
                  {t('contact.connectWithTitle')}{' '}
                  <span className="text-orange-500">{t('contact.connectWithBrand')}</span>
                </h3>
              </div>

              {/* Channel list — icon block style */}
              <div className="space-y-2.5 flex-1">
                {contactChannels.map((ch) => {
                  const inner = (
                    <>
                      <div className={`relative w-10 h-10 rounded-xl ${ch.iconRing} flex items-center justify-center shrink-0`}>
                        <div className={`w-7 h-7 rounded-lg ${ch.iconBg} flex items-center justify-center`}>
                          <ch.icon className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-slate-500">
                          {ch.label}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {ch.value}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {ch.meta}
                        </div>
                      </div>
                      {ch.href ? (
                        <HiOutlineArrowRight className="w-4 h-4 text-slate-300 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                      ) : (
                        <div className="w-4 h-4 shrink-0" />
                      )}
                    </>
                  );

                  const cardClass = `group flex items-center gap-3.5 p-3 rounded-xl border border-slate-200 bg-white transition-all ${
                    ch.href
                      ? 'hover:border-orange-300 hover:shadow-sm cursor-pointer'
                      : 'cursor-default'
                  }`;

                  return ch.href ? (
                    <a
                      key={ch.label}
                      href={ch.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cardClass}
                    >
                      {inner}
                    </a>
                  ) : (
                    <div key={ch.label} className={cardClass}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Right Panel — Form ── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-7 flex flex-col">
              {/* Header */}
              <div className="mb-6 flex items-start justify-between gap-3">
                <div>
                  <h3
                    className="text-slate-900 leading-tight mb-1.5"
                    style={{ fontSize: 'clamp(20px, 2.6vw, 26px)', fontWeight: 600 }}
                  >
                    {t('contact.formPanelTitle')}{' '}
                    <span className="text-orange-500">{t('contact.formPanelHighlight')}</span>
                  </h3>
                </div>
                <div className="shrink-0 w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
                  <HiOutlineMail className="w-4 h-4 text-orange-500" />
                </div>
              </div>

              {submitted ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
                    <HiOutlineCheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <h4 className="text-base font-semibold text-slate-900 mb-1">
                    {t('contact.successTitle')}
                  </h4>
                  <p className="text-slate-600 mb-5 text-sm">
                    {t('contact.successMessage')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm"
                  >
                    {t('contact.sendAnother')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 flex-1 flex flex-col" noValidate>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      label={t('contact.nameLabel')}
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder={t('contact.namePlaceholder')}
                      error={errors.name}
                      required
                    />
                    <FormField
                      label={t('contact.emailLabel')}
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder={t('contact.emailPlaceholder')}
                      error={errors.email}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      label={t('contact.phoneLabel')}
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      placeholder={t('contact.phonePlaceholder')}
                    />
                    <FormField
                      label={t('contact.companyLabel')}
                      name="company"
                      value={form.company}
                      onChange={handleChange}
                      placeholder={t('contact.companyPlaceholder')}
                    />
                  </div>

                  <div className="flex-1 flex flex-col">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t('contact.messageLabel')} <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      rows={4}
                      placeholder={t('contact.messagePlaceholder')}
                      aria-invalid={!!errors.message}
                      className={`w-full px-3.5 py-2.5 rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 outline-none transition-colors resize-none text-sm flex-1 ${
                        errors.message
                          ? 'border-red-400 focus:border-red-500'
                          : 'border-slate-200 focus:border-orange-400'
                      }`}
                    />
                    {errors.message ? (
                      <p className="mt-1 text-xs text-red-500">{errors.message}</p>
                    ) : (
                      <div className="text-xs text-slate-400 mt-1 text-right">
                        {form.message.length} / 5000
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                  >
                    {submitting ? t('contact.submitting') : (
                      <>{t('contact.submitButton')} <HiOutlineArrowRight className="w-4 h-4" /></>
                    )}
                  </button>

                  <p className="text-xs text-slate-500 text-center">
                    {t('contact.privacyNote')}{' '}
                    <a href="/privacy-policy" className="text-orange-600 hover:underline font-medium">
                      {t('contact.privacyLink')}
                    </a>
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
      <HeroChatWidget />
    </div>
  );
}

function FormField({ label, required, type = 'text', name, value, onChange, placeholder, error }) {
  return (
    <div className="flex flex-col">
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={name}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={!!error}
        className={`w-full px-3.5 py-2.5 rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 outline-none transition-colors text-sm ${
          error
            ? 'border-red-400 focus:border-red-500'
            : 'border-slate-200 focus:border-orange-400'
        }`}
      />
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

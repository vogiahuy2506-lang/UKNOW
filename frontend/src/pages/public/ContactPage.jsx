import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineMail, HiOutlinePhone, HiOutlineLocationMarker,
  HiOutlineCheckCircle, HiOutlineArrowRight,
} from 'react-icons/hi';
import { FaArrowRight } from 'react-icons/fa';
import PublicFooter from './components/PublicFooter';
import { submitContactForm } from '../../services/contactApi.service';
import AnimatedSection from '../../components/AnimatedSection';
import { useI18n } from '../../i18n';
import { usePublicLandingOverrides } from '../../features/landing-customizer';

const contactChannels = [
  {
    icon: HiOutlineMail,
    iconBg: 'from-orange-500 to-red-500',
    label: 'Email',
    value: 'info@digiso.vn',
    desc: 'Phản hồi trong 24 giờ làm việc',
    href: 'mailto:info@digiso.vn',
  },
  {
    icon: HiOutlinePhone,
    iconBg: 'from-blue-500 to-indigo-500',
    label: 'Hotline',
    value: '(+84) 877 909 606',
    desc: 'Tư vấn miễn phí 08:00 - 17:00',
    href: 'tel:+84877909606',
  },
  {
    icon: HiOutlineLocationMarker,
    iconBg: 'from-emerald-500 to-teal-500',
    label: 'Văn phòng',
    value: 'Phòng I101B, ĐHQG TP.HCM',
    desc: 'Khu Công nghệ phần mềm, TP.HCM',
    href: 'https://maps.google.com/?q=Phòng+I101B,+Khu+Công+nghệ+phần+mềm+ĐHQG+HCM',
  },
];

export default function ContactPage() {
  const { t } = useI18n();
  const { getOverride } = usePublicLandingOverrides('contact');

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
            <span data-edit="contact.tagline">Liên hệ với chúng tôi</span>
          </div>

          {/* Title */}
          <h1
            className="text-slate-900 mb-6"
            style={{ fontSize: 'clamp(32px, 6vw, 56px)', lineHeight: 1.15, fontWeight: 600 }}
            data-edit="contact.title"
          >
            Chúng tôi luôn sẵn sàng{' '}
            <span className="text-orange-500">hỗ trợ bạn</span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-slate-600 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
            data-edit="contact.subtitle"
          >
            Để lại thông tin, đội ngũ tư vấn sẽ liên hệ lại trong 24 giờ.
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

            {/* ── Left Panel — Contact Channels ── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 flex flex-col">
              {/* Header */}
              <div className="mb-5">
                <div className="text-xs font-bold uppercase tracking-wider text-orange-500 mb-1.5">
                  Thông tin liên hệ
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight">
                  Nhiều cách để kết nối với <span className="text-orange-500">Founder AI</span>
                </h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  Chọn kênh phù hợp nhất với bạn — chúng tôi phản hồi nhanh nhất qua email.
                </p>
              </div>

              {/* Channel list */}
              <div className="space-y-3 flex-1">
                {contactChannels.map((ch) => (
                  <a
                    key={ch.label}
                    href={ch.href}
                    target={ch.href.startsWith('http') ? '_blank' : undefined}
                    rel={ch.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="group flex items-center gap-4 p-3.5 rounded-xl border border-slate-200 hover:border-orange-300 hover:bg-orange-50/40 transition-all"
                  >
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${ch.iconBg} flex items-center justify-center shrink-0 shadow-sm`}>
                      <ch.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {ch.label}
                      </div>
                      <div className="text-sm md:text-base font-semibold text-slate-900 truncate">
                        {ch.value}
                      </div>
                      <div className="text-xs text-slate-500">
                        {ch.desc}
                      </div>
                    </div>
                    <HiOutlineArrowRight className="w-4 h-4 text-slate-300 group-hover:text-orange-500 group-hover:translate-x-1 transition-all shrink-0" />
                  </a>
                ))}
              </div>

              {/* Working Hours */}
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
                  </span>
                  <span className="text-sm font-bold text-slate-900">Đang mở cửa</span>
                  <span className="text-xs text-slate-500">• Thứ 2 – Thứ 6</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Tư vấn miễn phí từ <span className="font-semibold text-slate-900">08:00 – 17:00</span>. Ngoài giờ, vui lòng gửi email — đội ngũ sẽ phản hồi vào đầu giờ làm việc hôm sau.
                </p>
              </div>
            </div>

            {/* ── Right Panel — Form ── */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 md:p-7 flex flex-col">
              {/* Header */}
              <div className="mb-5">
                <div className="text-xs font-bold uppercase tracking-wider text-orange-500 mb-1.5">
                  Gửi yêu cầu
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight">
                  Để lại thông tin, chúng tôi sẽ <span className="text-orange-500">phản hồi sớm</span>
                </h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  Điền form bên dưới — đội ngũ tư vấn sẽ liên hệ lại trong vòng 24 giờ làm việc.
                </p>
              </div>

              {submitted ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-4">
                    <HiOutlineCheckCircle className="w-7 h-7 text-green-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-1.5">
                    {t('contact.successTitle')}
                  </h4>
                  <p className="text-slate-600 mb-5 text-sm max-w-sm">
                    {t('contact.successMessage')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="px-5 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-sm"
                  >
                    Gửi yêu cầu khác
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3.5 flex-1 flex flex-col" noValidate>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      {t('contact.messageLabel')} <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      rows={4}
                      placeholder={t('contact.messagePlaceholder')}
                      aria-invalid={!!errors.message}
                      className={`w-full px-4 py-2.5 rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 outline-none transition-all resize-none text-sm flex-1 ${
                        errors.message
                          ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                          : 'border-slate-300 focus:border-orange-400 focus:ring-2 focus:ring-orange-100'
                      }`}
                    />
                    {errors.message ? (
                      <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.message}</p>
                    ) : (
                      <div className="text-xs text-slate-400 mt-1 text-right">
                        {form.message.length} / 5000
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm shadow-sm hover:shadow-md"
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
    </div>
  );
}

function FormField({ label, required, type = 'text', name, value, onChange, placeholder, error }) {
  return (
    <div className="flex flex-col">
      <label htmlFor={name} className="block text-sm font-semibold text-slate-700 mb-1.5">
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
        className={`w-full px-4 py-2.5 rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 outline-none transition-all text-sm ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'
            : 'border-slate-300 focus:border-orange-400 focus:ring-2 focus:ring-orange-100'
        }`}
      />
      {error && (
        <p className="mt-1.5 text-xs text-red-500 font-medium">{error}</p>
      )}
    </div>
  );
}

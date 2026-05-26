import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineMail, HiOutlinePhone, HiOutlineLocationMarker,
  HiOutlineChat, HiOutlineCheckCircle, HiOutlineArrowRight,
} from 'react-icons/hi';
import { submitContactForm } from '../../services/contactApi.service';
import { useI18n } from '../../i18n';

const COMPANY_SIZES = (t) => [
  { value: '', label: t('contact.companySizePlaceholder') },
  { value: '1-10', label: t('contact.companySize1') },
  { value: '11-50', label: t('contact.companySize2') },
  { value: '51-200', label: t('contact.companySize3') },
  { value: '201-500', label: t('contact.companySize4') },
  { value: '500+', label: t('contact.companySize5') },
];

const CONTACT_CHANNELS = (t) => [
  {
    icon: HiOutlineMail,
    label: t('contact.email'),
    value: t('contact.emailValue'),
    href: 'mailto:hello@founderai.vn',
    description: t('contact.emailDesc'),
  },
  {
    icon: HiOutlinePhone,
    label: t('contact.hotline'),
    value: t('contact.hotlineValue'),
    href: 'tel:19006868',
    description: t('contact.hotlineDesc'),
  },
  {
    icon: HiOutlineChat,
    label: t('contact.zalo'),
    value: t('contact.zaloValue'),
    href: 'https://zalo.me/founderai',
    description: t('contact.zaloDesc'),
  },
  {
    icon: HiOutlineLocationMarker,
    label: t('contact.office'),
    value: t('contact.officeValue'),
    href: null,
    description: t('contact.officeDesc'),
  },
];

export default function ContactPage() {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', companySize: '', message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error(t('contact.validationRequired'));
      return;
    }
    if (form.message.trim().length < 10) {
      toast.error(t('contact.validationMinLength'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitContactForm(form);
      toast.success(res.data?.message || t('contact.sentSuccess'));
      setSubmitted(true);
      setForm({ name: '', email: '', phone: '', company: '', companySize: '', message: '' });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('contact.errorMessage'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <div className="relative pt-8 pb-20">
      {/* Hero */}
      <div className="max-w-7xl mx-auto px-6 text-center mb-12 pt-10">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight mb-4">
          {t('contact.title')}
        </h1>
        <p className="text-base md:text-lg text-white/70 max-w-2xl mx-auto">
          {t('contact.subtitle')}
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
        {/* LEFT: Form (3 cols) */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
            {submitted ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-5">
                  <HiOutlineCheckCircle className="w-9 h-9 text-green-600" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">{t('contact.successTitle')}</h3>
                <p className="text-slate-600 mb-6 max-w-md mx-auto">
                  {t('contact.successMessage')}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                  >
                    {t('contact.sendAnother')}
                  </button>
                  <Link
                    to="/pricing"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold hover:shadow-lg transition-all"
                  >
                    {t('contact.viewPricing')} <HiOutlineArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 mb-1">
                    {t('contact.formTitle')}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {t('contact.formSubtitle')}
                  </p>
                </div>

                {/* Row 1: Name + Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label={t('contact.nameLabel')}
                    required
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder={t('contact.namePlaceholder')}
                  />
                  <FormField
                    label={t('contact.emailLabel')}
                    required
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder={t('contact.emailPlaceholder')}
                  />
                </div>

                {/* Row 2: Phone + Company */}
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

                {/* Row 3: Company size */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    {t('contact.companySizeLabel')}
                  </label>
                  <select
                    name="companySize"
                    value={form.companySize}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
                  >
                    {COMPANY_SIZES(t).map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Row 4: Message */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    {t('contact.messageLabel')} <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="message"
                    value={form.message}
                    onChange={handleChange}
                    rows={5}
                    required
                    placeholder={t('contact.messagePlaceholder')}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition-all resize-none"
                  />
                  <div className="text-xs text-slate-400 mt-1 text-right">
                    {form.message.length} / 5000
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold hover:shadow-lg hover:shadow-orange-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? t('contact.submitting') : (
                    <>{t('contact.submitButton')} <HiOutlineArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <p className="text-xs text-slate-400">
                  {t('contact.privacyNote')}{' '}
                  <a href="/privacy-policy" className="text-orange-600 hover:underline">
                    {t('contact.privacyLink')}
                  </a>.
                </p>
              </form>
            )}
          </div>
        </div>

        {/* RIGHT: Contact info (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl border border-orange-100 p-6">
            <h3 className="text-lg font-black text-slate-900 mb-1">{t('contact.contactChannels')}</h3>
            <p className="text-sm text-slate-600 mb-5">
              {t('contact.contactChannelsSubtitle')}
            </p>

            <div className="space-y-3">
              {CONTACT_CHANNELS(t).map((channel) => {
                const Icon = channel.icon;
                const content = (
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/70 hover:bg-white transition-colors border border-transparent hover:border-orange-200">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {channel.label}
                      </div>
                      <div className="text-sm font-bold text-slate-900 truncate">
                        {channel.value}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {channel.description}
                      </div>
                    </div>
                  </div>
                );

                return channel.href ? (
                  <a
                    key={channel.label}
                    href={channel.href}
                    target={channel.href.startsWith('http') ? '_blank' : undefined}
                    rel={channel.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="block"
                  >
                    {content}
                  </a>
                ) : (
                  <div key={channel.label}>{content}</div>
                );
              })}
            </div>
          </div>

          {/* CTA secondary */}
          <div className="bg-slate-900 rounded-2xl p-6 text-white">
            <h4 className="font-black text-lg mb-2">{t('contact.readyToStart')}</h4>
            <p className="text-sm text-slate-300 mb-4">
              {t('contact.freeTrial')}
            </p>
            <div className="flex flex-col gap-2">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-900 font-bold hover:bg-slate-100 transition-colors text-sm"
              >
                {t('contact.registerFree')} <HiOutlineArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold hover:bg-slate-800 transition-colors text-sm"
              >
                {t('contact.viewPricing')}
              </Link>
            </div>
          </div>
        </div>
      </div>
      </div>{/* end relative content wrapper */}
    </div>
  );
}

function FormField({ label, required, type = 'text', name, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none transition-all"
      />
    </div>
  );
}

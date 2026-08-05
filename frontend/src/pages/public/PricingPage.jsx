import { useI18n } from '../../i18n';
import { usePublicLandingOverrides } from '../../features/landing-customizer';
import PublicFooter from './components/PublicFooter';
import AnimatedSection from '../../components/AnimatedSection';
import PricingSection from './components/PricingSection';
import { FaCheck } from 'react-icons/fa';

const getFaqs = (t) => [
  {
    q: t('pricingPage.faq1Q'),
    a: t('pricingPage.faq1A'),
  },
  {
    q: t('pricingPage.faq2Q'),
    a: t('pricingPage.faq2A'),
  },
  {
    q: t('pricingPage.faq3Q'),
    a: t('pricingPage.faq3A'),
  },
  {
    q: t('pricingPage.faq4Q'),
    a: t('pricingPage.faq4A'),
  },
];

export default function PricingPage() {
  const { t } = useI18n();
  const { getOverride } = usePublicLandingOverrides('pricing');
  const faqs = getFaqs(t);

  const getValue = (key, fallback) => {
    const override = getOverride(key);
    return override || fallback;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ── Hero Section ── */}
      <section className="relative px-6 pt-12 pb-16 md:pt-16 md:pb-24 overflow-hidden">
        {/* Background dots */}
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />

        {/* Decorative shapes */}
        <div className="absolute top-20 left-12 w-20 h-20 border border-orange-200 rounded-full opacity-40" />
        <div className="absolute top-40 left-24 w-12 h-12 border border-blue-200 rounded-2xl rotate-12 opacity-40" />
        <div className="absolute bottom-16 right-20 w-16 h-16 border border-purple-200 rounded-full opacity-40" />
        <div className="absolute bottom-32 right-32 w-8 h-8 bg-orange-100 rounded-lg rotate-45 opacity-30" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-sm font-medium mb-8">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span data-edit="pricing.badge">{getValue('pricing.badge', t('pricingPage.badge'))}</span>
          </div>

          {/* Title */}
          <h1
            className="text-slate-900 mb-6"
            style={{ fontSize: 'clamp(32px, 6vw, 56px)', lineHeight: 1.15, fontWeight: 600 }}
            data-edit="pricing.title"
          >
            {t('pricingPage.titlePrefix')}{' '}
            <span className="text-orange-500">{t('pricingPage.titleHighlight')}</span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-slate-600 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
            data-edit="pricing.subtitle"
          >
            {t('pricingPage.subtitle')}
          </p>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              {t('pricingPage.trust1')}
            </span>
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              {t('pricingPage.trust2')}
            </span>
            <span className="flex items-center gap-2">
              <FaCheck className="w-4 h-4 text-green-500" />
              {t('pricingPage.trust3')}
            </span>
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      {/* ── Pricing Cards (fetched from /api/plans) ── */}
      <PricingSection embedded />

      {/* ── Divider ── */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>

      {/* ── FAQ ── */}
      <section className="py-20 md:py-28 bg-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundColor: '#f8fafc',
          backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />

        <div className="max-w-3xl mx-auto px-6 relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">
              {t('pricingPage.faqTitle')}
            </h2>
            <p className="text-slate-600">
              {t('pricingPage.faqSubtitle')}
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <AnimatedSection key={i} delay={i * 60}>
                <div className="bg-white border border-slate-200 rounded-xl p-6 hover:border-orange-200 transition-colors">
                  <h3 className="text-base font-semibold text-slate-900 mb-2">{faq.q}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{faq.a}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

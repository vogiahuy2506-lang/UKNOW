import PricingSection from './components/PricingSection';
import { useI18n } from '../../i18n';
import { usePublicLandingOverrides } from '../../features/landing-customizer';

export default function PricingPage() {
  const { t } = useI18n();
  const { getOverride } = usePublicLandingOverrides('pricing');

  // Helper to get override value with i18n fallback
  const getValue = (key, fallback) => {
    const override = getOverride(key);
    return override || fallback;
  };

  return (
    <div className="relative min-h-screen">
      <div className="relative pt-4 pb-6">
        {/* Hero heading */}
        <div className="text-center px-6 pt-6 pb-3">
          <p 
            className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-1.5"
            data-edit="pricing.badge"
          >
            {getValue('pricing.badge', 'Founder AI')}
          </p>
          <h1
            className="font-black text-white"
            style={{ fontSize: 'clamp(28px, 4vw, 48px)', lineHeight: 1.05, letterSpacing: '-0.02em' }}
            data-edit="pricing.title"
          >
            {getValue('pricing.title', t('pricing.title'))}
          </h1>
          <p 
            className="text-white/60 text-sm mt-2"
            data-edit="pricing.subtitle"
          >
            {getValue('pricing.subtitle', t('pricing.subtitle') || 'Chọn gói phù hợp với doanh nghiệp của bạn')}
          </p>
        </div>

        <PricingSection embedded glass compact />
      </div>
    </div>
  );
}

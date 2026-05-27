import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaCrown, FaGem, FaRocket, FaStar, FaBolt } from 'react-icons/fa';
import AnimatedSection from '../../../components/AnimatedSection';
import { useAuthStore } from '../../../stores/authStore';
import { getPlans } from '../../../services/plan.service';
import { useI18n } from '../../../i18n';

const ZALO_URL = 'https://zalo.me/0866914382';

const isContactPlan = (plan) => {
  const code = String(plan?.code || '').trim().toLowerCase();
  const name = String(plan?.name || '').trim().toLowerCase();
  return code === 'custom' || code === 'contact' || name.includes('tùy chọn') || name.includes('tuỳ chọn');
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const getPlanTranslationKey = (plan) => {
  const code = normalizeText(plan?.code);
  if (code) return code;

  const name = normalizeText(plan?.name)
    .replace(/^gói\s+/, '')
    .replace(/\s+plan$/, '');

  if (['starter', 'trial', 'basic', 'pro', 'team', 'business', 'enterprise', 'custom'].includes(name)) {
    return name;
  }
  if (name.includes('tùy chọn') || name.includes('tuỳ chọn')) return 'custom';
  return '';
};

const getTranslatedPlanName = (plan, t) => {
  const key = getPlanTranslationKey(plan);
  const translated = key ? t(`pricing.planNames.${key}`) : '';
  return translated && translated !== `pricing.planNames.${key}` ? translated : plan.name;
};

const getTranslatedPlanDescription = (plan, t) => {
  const key = getPlanTranslationKey(plan);
  const translated = key ? t(`pricing.planDescriptions.${key}`) : '';
  return translated && translated !== `pricing.planDescriptions.${key}` ? translated : plan.description;
};

const getTranslatedFeature = (feature, t) => {
  const text = String(feature || '').trim();
  const normalized = normalizeText(text);

  const emailMonth = text.match(/^([\d.,]+)\s*email\s*\/\s*tháng$/i);
  if (emailMonth) return t('pricing.featureTemplates.emailPerMonth', { n: emailMonth[1] });

  const zaloMonth = text.match(/^([\d.,]+)\s*(?:tin nhắn\s*)?zalo\s*\/\s*tháng$/i);
  if (zaloMonth) return t('pricing.featureTemplates.zaloPerMonth', { n: zaloMonth[1] });

  const members = text.match(/^([\d.,]+)\s*thành viên(?:\s*tham gia)?$/i);
  if (members) return t('pricing.featureTemplates.members', { n: members[1] });

  const knownFeatureKeys = {
    'ai viết content nâng cao': 'advancedAiWriting',
    'hỗ trợ ưu tiên 24/7': 'prioritySupport247',
    'hỗ trợ 24/7': 'support247',
    'hỗ trợ qua email': 'emailSupport',
    'multi_language': 'multiLanguage',
    'không giới hạn': 'unlimited',
    'không hỗ trợ': 'notSupported',
  };

  const key = knownFeatureKeys[normalized];
  return key ? t(`pricing.features.${key}`) : text;
};

// Glass mode styles — dùng cho trang /pricing với video background
const GLASS_STYLES = [
  {
    wrapper: 'bg-white/55 border border-white/80 backdrop-blur-sm',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'text-orange-500',
    button: 'bg-orange-500 text-white hover:bg-orange-600',
    corner: 'from-orange-100/40 to-orange-50/20',
    icon: FaRocket,
  },
  {
    wrapper: 'bg-white/75 border border-orange-300/60 backdrop-blur-sm shadow-xl shadow-orange-500/10',
    badge: null, // Will be set from t('pricing.mostPopular')
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'text-orange-500',
    button: 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:shadow-lg hover:shadow-orange-500/30',
    corner: 'from-orange-200/40 to-orange-100/20',
    icon: FaCrown,
  },
  {
    wrapper: 'bg-white/55 border border-white/80 backdrop-blur-sm',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'text-orange-500',
    button: 'bg-orange-500 text-white hover:bg-orange-600',
    corner: 'from-amber-100/40 to-amber-50/20',
    icon: FaBolt,
  },
  {
    wrapper: 'bg-white/55 border border-white/80 backdrop-blur-sm',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'text-orange-500',
    button: 'bg-orange-500 text-white hover:bg-orange-600',
    corner: 'from-amber-100/40 to-amber-50/20',
    icon: FaGem,
  },
];

// Mảng các style động để tự động xoay vòng cho các gói
const DYNAMIC_STYLES = [
  {
    wrapper: 'bg-white border border-slate-200',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'text-orange-500',
    button: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
    corner: 'from-orange-100 to-orange-50',
    icon: FaRocket,
  },
  {
    // Nổi bật bằng màu + shadow + ring, KHÔNG dùng scale (làm card lệch chiều cao so với các card khác)
    wrapper: 'bg-gradient-to-b from-orange-600 to-red-600 shadow-2xl shadow-orange-500/30 ring-2 ring-orange-400 relative z-10',
    badge: true, // Will use t('pricing.mostPopular')
    title: 'text-white',
    price: 'text-white',
    unit: 'text-orange-100',
    feature: 'text-orange-50',
    featureIcon: 'text-orange-200',
    button: 'bg-white text-orange-600 hover:bg-slate-50 shadow-lg shadow-orange-900/20',
    corner: 'bg-white/10',
    icon: FaCrown,
  },
  {
    wrapper: 'bg-white border border-slate-200',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'text-red-500',
    button: 'bg-red-50 text-red-700 hover:bg-red-100',
    corner: 'from-red-100 to-red-50',
    icon: FaBolt,
  },
  {
    wrapper: 'bg-white border border-slate-200',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'text-amber-500',
    button: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    corner: 'from-amber-100 to-amber-50',
    icon: FaGem,
  }
];

/**
 * Section hiển thị bảng giá. Tự fetch plans từ API.
 *
 * Props:
 * - embedded (boolean): ẩn phần hero (badge + heading + subtitle) để nhúng vào trang có hero riêng.
 * - compact  (boolean): thu nhỏ padding/spacing để fit trong 1 viewport.
 */
export default function PricingSection({ embedded = false, compact = false, glass = false }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const getPlansData = async () => {
    try {
      setLoading(true);
      const { data } = await getPlans();
      // Lọc các gói active và sắp xếp theo giá để hiển thị hợp lý
      const sortedPlans = (data.plans || [])
        .filter(p => p.is_active)
        .sort((a, b) => {
          const aContact = isContactPlan(a);
          const bContact = isContactPlan(b);
          if (aContact !== bContact) return aContact ? 1 : -1;
          return Number(a.price || 0) - Number(b.price || 0);
        });
      setPlans(sortedPlans);
    } catch (error) {
      console.error('Lỗi khi lấy dữ liệu gói:', error);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getPlansData();
  }, []);

  const handlePlanClick = (plan) => {
    if (isContactPlan(plan)) {
      window.open(ZALO_URL, '_blank');
      return;
    }
    if (!isAuthenticated) {
      navigate('/login');
    } else {
      navigate('/checkout', { state: { plan } });
    }
  };

  if (loading) {
    return (
      <div className="py-32 flex justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const styleSet = glass ? GLASS_STYLES : DYNAMIC_STYLES;

  const sectionPadding = compact
    ? 'pb-6 md:pb-8'
    : embedded
      ? 'py-12 md:py-16'
      : glass
        ? 'py-16'
        : 'py-32 bg-slate-50 border-t border-slate-200';

  const sectionBg = (glass || compact || embedded) ? '' : '';

  return (
    <section
      id="pricing"
      className={`${sectionPadding} ${sectionBg} relative w-full ${embedded ? '' : 'overflow-hidden'} ${compact ? 'pt-3' : ''}`}
    >
      {!embedded && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-50 via-slate-50 to-slate-50 opacity-70"></div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {!embedded && (
          <AnimatedSection className="text-center mb-20">
            <span className="inline-block px-4 py-2 bg-orange-100 text-orange-700 rounded-full font-bold text-sm tracking-wide uppercase mb-6 shadow-sm border border-orange-200">
              {t('pricing.heroBadge')}
            </span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">
              {t('pricing.heroTitlePrefix')}{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-red-600">
                {t('pricing.heroTitleHighlight')}
              </span>
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              {t('pricing.heroSubtitle')}
            </p>
          </AnimatedSection>
        )}

        {/*
          Layout cố định tối đa 3 cột/hàng — khi nhiều hơn 3 plans, cards tự động wrap xuống hàng tiếp.
          - 1 plan: 1 cột (max-w-md)
          - 2 plans: 2 cột (max-w-4xl)
          - 3+ plans: 3 cột, wrap (max-w-7xl)
        */}
        <div className={`grid ${compact ? 'gap-5' : 'gap-8'} mx-auto items-stretch ${
          plans.length === 1 ? 'grid-cols-1 max-w-md' :
          plans.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-4xl' :
          'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-7xl'
        }`}>
          {plans.map((plan, index) => {
            // Cấp phát style động dựa trên vị trí. Gói ở giữa (index 1) thường nổi bật nhất.
            // Admin có thể thêm code "custom" để ép hiển thị nút liên hệ Zalo.
            const isCustom = isContactPlan(plan);
            const style = styleSet[index % styleSet.length];
            const PlanIcon = style.icon;

            const features = Array.isArray(plan.features)
              ? plan.features
              : JSON.parse(plan.features || '[]');
            const planName = getTranslatedPlanName(plan, t);
            const planDescription = getTranslatedPlanDescription(plan, t);

            return (
              <AnimatedSection key={plan.id} delay={index * 100} className="h-full">
                <div className={`${compact ? 'rounded-3xl p-7' : 'rounded-[2rem] p-8 md:p-10'} transition-all duration-500 hover:-translate-y-2 relative overflow-hidden flex flex-col h-full ${style.wrapper}`}>

                  {/* Corner decoration */}
                  <div className={`absolute top-0 right-0 w-40 h-40 rounded-full -translate-y-1/2 translate-x-1/3 bg-gradient-to-br blur-2xl ${style.corner}`} />

                  {/* Popular badge — dạng pill căn giữa, không bị rounded corners cắt */}
                  {style.badge && (
                    <div className="absolute top-3 inset-x-0 flex justify-center z-20">
                      <span className="bg-white text-orange-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full shadow-md whitespace-nowrap">
                        {t('pricing.mostPopular')}
                      </span>
                    </div>
                  )}

                  <div className={`relative z-10 flex-1 flex flex-col ${style.badge ? 'pt-5' : ''}`}>
                    <div className={`flex items-center justify-between ${compact ? 'mb-3' : 'mb-4'}`}>
                      <h3 className={`${compact ? 'text-2xl' : 'text-2xl'} font-black ${style.title}`}>{planName}</h3>
                      {PlanIcon && (
                        <div className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl flex items-center justify-center bg-white/10 backdrop-blur-sm ${style.featureIcon}`}>
                          <PlanIcon className={compact ? 'w-5 h-5' : 'w-6 h-6'} />
                        </div>
                      )}
                    </div>

                    <p className={`${compact ? 'mb-5 text-sm min-h-[40px]' : 'mb-8 text-sm min-h-[40px]'} font-medium leading-relaxed ${style.unit}`}>{planDescription}</p>

                    <div className={`${compact ? 'mb-5 pb-5' : 'mb-8 pb-8'} border-b border-slate-200/40`}>
                      {isCustom ? (
                        <div className="flex items-end gap-2">
                          <span className={`${compact ? 'text-4xl' : 'text-4xl md:text-5xl'} font-black tracking-tight ${style.price}`}>{t('pricing.contact')}</span>
                        </div>
                      ) : (
                        <div className="flex items-end gap-2">
                          <span className={`${compact ? 'text-4xl' : 'text-4xl md:text-5xl'} font-black tracking-tight ${style.price}`}>
                            {(plan.price / 1000).toLocaleString('vi-VN')}K
                          </span>
                          <span className={`font-semibold ${compact ? 'mb-1.5 text-sm' : 'mb-2'} ${style.unit}`}>{t('pricing.perMonth')}</span>
                        </div>
                      )}
                    </div>

                    <ul className={`${compact ? 'space-y-3 mb-6' : 'space-y-4 mb-8'} flex-1`}>
                      {features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <FaCheckCircle className={`flex-shrink-0 w-5 h-5 mt-0.5 ${style.featureIcon}`} />
                          <span className={`text-sm font-medium leading-relaxed ${style.feature}`}>{getTranslatedFeature(feature, t)}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handlePlanClick(plan)}
                      className={`w-full ${compact ? 'py-3 text-sm' : 'py-4 text-sm'} rounded-xl font-bold tracking-wide transition-all duration-300 mt-auto ${style.button}`}
                    >
                      {isCustom ? t('pricing.getQuote') : t('pricing.startTrial')}
                    </button>
                  </div>
                </div>
              </AnimatedSection>
            );
          })}
        </div>

        {!compact && !glass && (
          <AnimatedSection className="text-center mt-16 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-full px-6 py-3 text-sm font-medium text-slate-600">
              <FaStar className="text-yellow-400 w-5 h-5" /> {t('pricing.trialOffer')}
            </div>
          </AnimatedSection>
        )}
      </div>
    </section>
  );
}

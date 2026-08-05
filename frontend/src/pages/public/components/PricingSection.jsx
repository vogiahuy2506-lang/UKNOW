import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaCrown, FaGem, FaRocket, FaStar, FaBolt, FaArrowRight } from 'react-icons/fa';
import AnimatedSection from '../../../components/AnimatedSection';
import { useAuthStore } from '../../../stores/authStore';
import { getPlans } from '../../../services/plan.service';
import { getActivePromotions } from '../../../services/promotion.service';
import { useI18n } from '../../../i18n';
import CustomPlanBuilder from '../../../features/billing/CustomPlanBuilder';

const isContactPlan = (plan) => {
  const code = String(plan?.code || '').trim().toLowerCase();
  const name = String(plan?.name || '').trim().toLowerCase();
  return code === 'custom' || code === 'contact' || name.includes('tùy chọn') || name.includes('tuỳ chọn');
};

const isFreePlan = (plan) => Number(plan?.price || 0) <= 0 && !isContactPlan(plan);

const getPlanCtaLabel = (plan, t) => {
  if (isContactPlan(plan)) return t('customPlan.cardCta');
  if (isFreePlan(plan)) return t('pricing.startTrial');
  return t('pricing.choosePlan');
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const PLAN_ALIASES = { professional: 'pro' };

const getPlanTranslationKey = (plan) => {
  const code = normalizeText(plan?.code);
  if (code) return PLAN_ALIASES[code] || code;

  const name = normalizeText(plan?.name)
    .replace(/^gói\s+/, '')
    .replace(/\s+plan$/, '');

  const resolved = PLAN_ALIASES[name] || name;
  if (['starter', 'trial', 'basic', 'pro', 'team', 'business', 'enterprise', 'custom'].includes(resolved)) {
    return resolved;
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

  // Email per month: "500 email/tháng" or "500 emails/month"
  const emailMonthVi = text.match(/^([\d.,]+)\s*emails?\s*\/\s*tháng$/i);
  if (emailMonthVi) return t('pricing.featureTemplates.emailPerMonth', { n: emailMonthVi[1] });
  const emailMonthEn = text.match(/^([\d.,]+)\s*emails?\s*\/\s*month$/i);
  if (emailMonthEn) return t('pricing.featureTemplates.emailPerMonth', { n: emailMonthEn[1] });

  // Zalo per month: "1,000 tin Zalo/tháng" or "1,000 tin nhắn Zalo/tháng"
  const zaloMonth = text.match(/^([\d.,]+)\s*(?:tin(?:\s*nhắn)?\s*)?zalo\s*\/\s*tháng$/i);
  if (zaloMonth) return t('pricing.featureTemplates.zaloPerMonth', { n: zaloMonth[1] });

  // Members: "5 thành viên"
  const members = text.match(/^([\d.,]+)\s*thành viên(?:\s*tham gia)?$/i);
  if (members) return t('pricing.featureTemplates.members', { n: members[1] });

  // Campaigns: "3 chiến dịch"
  const campaigns = text.match(/^([\d.,]+)\s*chiến dịch$/i);
  if (campaigns) return t('pricing.featureTemplates.campaigns', { n: campaigns[1] });

  // Landing pages: "2 Landing pages" or "2 landing pages"
  const landingPages = text.match(/^([\d.,]+)\s*landing pages?$/i);
  if (landingPages) return t('pricing.featureTemplates.landingPages', { n: landingPages[1] });

  // Zalo OA accounts: "1 tài khoản Zalo OA"
  const zaloAccounts = text.match(/^([\d.,]+)\s*tài khoản\s*zalo(?:\s*oa)?$/i);
  if (zaloAccounts) return t('pricing.featureTemplates.zaloAccounts', { n: zaloAccounts[1] });

  // Email accounts: "1 tài khoản Email"
  const emailAccounts = text.match(/^([\d.,]+)\s*tài khoản\s*email$/i);
  if (emailAccounts) return t('pricing.featureTemplates.emailAccounts', { n: emailAccounts[1] });

  const knownFeatureKeys = {
    'ai viết content nâng cao': 'advancedAiWriting',
    'hỗ trợ ưu tiên 24/7': 'prioritySupport247',
    'hỗ trợ 24/7': 'support247',
    'hỗ trợ qua email': 'emailSupport',
    'multi_language': 'multiLanguage',
    'không giới hạn': 'unlimited',
    'không hỗ trợ': 'notSupported',
    'nhắn tin zalo oa không giới hạn': 'unlimitedZaloMessages',
    'nhắn tin zalo không giới hạn': 'unlimitedZaloMessages',
    'không giới hạn tin zalo': 'unlimitedZalo',
    'gửi email không giới hạn': 'unlimitedEmailSending',
    'không giới hạn email': 'unlimitedEmail',
    'không giới hạn chiến dịch': 'unlimitedCampaigns',
    'không giới hạn landing pages': 'unlimitedLandingPages',
    'không giới hạn landing page': 'unlimitedLandingPages',
    'không giới hạn tài khoản': 'unlimitedAccounts',
    'tạo chiến dịch zalo & email': 'zaloEmailCampaigns',
    'hỗ trợ qua chat': 'chatSupport',
    'báo cáo chi tiết': 'detailedReports',
    'tự động hoá zalo': 'zaloAutomation',
    'tự động hóa zalo': 'zaloAutomation',
    'api truy cập': 'apiAccess',
    'ưu tiên hỗ trợ': 'prioritySupport',
    'hỗ trợ ưu tiên': 'prioritySupport',
  };

  const key = knownFeatureKeys[normalized];
  return key ? t(`pricing.features.${key}`) : text;
};

// Solid styles — đồng bộ với giao diện tổng thể (ContactPage, HeroPage)
// Tất cả card cùng style border trắng, không có "phổ biến nhất" nổi bật riêng.
const CARD_STYLES = [
  {
    wrapper: 'bg-white border border-slate-200 hover:border-orange-300',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'bg-green-100 text-green-600',
    button: 'bg-slate-900 text-white hover:bg-slate-800',
    iconBg: 'bg-slate-50',
    icon: FaRocket,
  },
  {
    wrapper: 'bg-white border border-slate-200 hover:border-orange-300',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'bg-green-100 text-green-600',
    button: 'bg-slate-900 text-white hover:bg-slate-800',
    iconBg: 'bg-slate-50',
    icon: FaCrown,
  },
  {
    wrapper: 'bg-white border border-slate-200 hover:border-orange-300',
    title: 'text-slate-900',
    price: 'text-slate-900',
    unit: 'text-slate-500',
    feature: 'text-slate-600',
    featureIcon: 'bg-green-100 text-green-600',
    button: 'bg-slate-900 text-white hover:bg-slate-800',
    iconBg: 'bg-slate-50',
    icon: FaBolt,
  },
];

/**
 * Section hiển thị bảng giá. Tự fetch plans từ API.
 *
 * Props:
 * - embedded (boolean): ẩn phần hero (badge + heading + subtitle) để nhúng vào trang có hero riêng.
 * - compact  (boolean): thu nhỏ padding/spacing để fit trong 1 viewport.
 */
const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';

const calcSavings = (monthly, yearly) => {
  const pct = Math.round((Number(monthly) * 12 - Number(yearly)) / (Number(monthly) * 12) * 100);
  return pct > 0 ? pct : 0;
};

export default function PricingSection({ embedded = false, compact = false, glass = false }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [promotionsByPlanCode, setPromotionsByPlanCode] = useState({});
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);

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

  useEffect(() => {
    const loadPromotions = async () => {
      try {
        const { data } = await getActivePromotions({ billingPeriod });
        setPromotionsByPlanCode(data?.data?.byPlanCode || {});
      } catch {
        setPromotionsByPlanCode({});
      }
    };
    loadPromotions();
  }, [billingPeriod]);

  const hasYearlyPricing = plans.some(p => !isContactPlan(p) && p.price_yearly);

  const openCustomBuilder = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setShowCustomBuilder(true);
  };

  const handlePlanClick = (plan) => {
    if (isContactPlan(plan)) {
      openCustomBuilder();
      return;
    }
    if (!isAuthenticated) {
      navigate('/login');
    } else {
      navigate('/checkout', { state: { plan, billingPeriod } });
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const styleSet = CARD_STYLES;

  const sectionPadding = compact
    ? 'pb-6 md:pb-8'
    : embedded
      ? 'pt-8 pb-8 md:pt-10 md:pb-20'
      : 'py-12 md:py-16';

  return (
    <section
      id="pricing"
      className={`${sectionPadding} bg-white relative overflow-hidden`}
    >
      {/* Dot grid background — match ContactPage / HeroPage */}
      <div className="absolute inset-0 opacity-[0.3]" style={{
        backgroundColor: '#f8fafc',
        backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }} />

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        {!embedded && (
          <AnimatedSection className="text-center mb-8">
            {/* Badge — match HeroPage style */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-sm font-medium mb-5">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span>{t('pricing.heroBadge')}</span>
            </div>

            <h2
              className="text-slate-900 mb-4"
              style={{ fontSize: 'clamp(28px, 5vw, 48px)', lineHeight: 1.15, fontWeight: 600 }}
            >
              {t('pricing.heroTitlePrefix')}{' '}
              <span className="text-orange-500">{t('pricing.heroTitleHighlight')}</span>
            </h2>

            <p className="text-slate-600 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              {t('pricing.heroSubtitle')}
            </p>
          </AnimatedSection>
        )}

        {/* Billing period toggle */}
        {hasYearlyPricing && (
          <div className={`flex justify-center ${compact ? 'mb-4' : 'mb-6'}`}>
            <div className="inline-flex items-center rounded-full p-1 gap-1 bg-slate-100 border border-slate-200">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  billingPeriod === 'monthly'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('pricing.billingMonthly')}
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                  billingPeriod === 'yearly'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t('pricing.billingYearly')}
                {billingPeriod !== 'yearly' && (
                  <span className="bg-emerald-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
                    {t('pricing.saveLabel')}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Layout giống ContactPage grid: 1/2/3 cột responsive */}
        <div className={`grid ${compact ? 'gap-4' : 'gap-5'} mx-auto items-stretch ${
          plans.length === 1 ? 'grid-cols-1 max-w-md' :
          plans.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-4xl' :
          'grid-cols-1 md:grid-cols-3 max-w-6xl'
        }`}>
          {plans.map((plan, index) => {
            const isCustom = isContactPlan(plan);
            const style = styleSet[index % styleSet.length];
            const PlanIcon = style.icon;

            const features = Array.isArray(plan.features)
              ? plan.features
              : JSON.parse(plan.features || '[]');
            const planName = getTranslatedPlanName(plan, t);
            const planDescription = getTranslatedPlanDescription(plan, t);
            const planCode = String(plan.code || '').toLowerCase();
            const promotion = promotionsByPlanCode[planCode];
            const hasPromotion = !isCustom && promotion?.discountAmount > 0;
            const rawPlanPrice = billingPeriod === 'yearly' && plan.price_yearly
              ? Number(plan.price_yearly)
              : Number(plan.price || 0);
            const promotedPrice = hasPromotion ? Number(promotion.finalAmount || rawPlanPrice) : rawPlanPrice;
            const discountPct = hasPromotion && rawPlanPrice > 0
              ? Math.round(promotion.discountAmount / rawPlanPrice * 100)
              : 0;

            return (
              <AnimatedSection key={plan.id} delay={index * 100}>
                <div className={`relative h-full rounded-xl p-5 flex flex-col transition-all hover:shadow-lg ${style.wrapper}`}>
                  {/* Plan name + icon */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className={`text-base font-bold ${style.title}`}>{planName}</h3>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${style.iconBg}`}>
                        <PlanIcon className="w-4 h-4 text-orange-500" />
                      </div>
                    </div>
                    <p className={`text-xs leading-relaxed min-h-[32px] ${style.unit}`}>{planDescription}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-5 pb-5 border-b border-slate-200/30">
                    {isCustom ? (
                      <div className={`text-2xl font-black ${style.price}`}>
                        {t('customPlan.priceLabel')}
                      </div>
                    ) : hasPromotion ? (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`text-xs line-through ${style.unit}`}>{fmtVnd(rawPlanPrice)}</span>
                          <span className="bg-emerald-500 text-white text-[9px] font-black px-1 py-0.5 rounded-full leading-none">
                            -{fmtVnd(promotion.discountAmount)}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-0.5">
                          <span className={`text-3xl font-black ${style.price}`}>{fmtVnd(promotedPrice)}</span>
                          <span className={`text-base ${style.unit}`}>đ</span>
                        </div>
                        <div className={`text-xs ${style.unit}`}>
                          {billingPeriod === 'yearly' ? t('pricing.perYear') : t('pricing.perMonth')}
                        </div>
                      </div>
                    ) : billingPeriod === 'yearly' && plan.price_yearly ? (
                      <div>
                        <div className="flex items-baseline gap-0.5">
                          <span className={`text-3xl font-black ${style.price}`}>{fmtVnd(plan.price_yearly)}</span>
                          <span className={`text-base ${style.unit}`}>đ</span>
                        </div>
                        <div className={`text-xs ${style.unit}`}>{t('pricing.perYear')}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`text-xs ${style.unit}`}>
                            ≈ {fmtVnd(Math.round(Number(plan.price_yearly) / 12))} / tháng
                          </span>
                          {calcSavings(plan.price, plan.price_yearly) > 0 && (
                            <span className="bg-emerald-500 text-white text-[9px] font-black px-1 py-0.5 rounded-full leading-none">
                              -{calcSavings(plan.price, plan.price_yearly)}%
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-0.5">
                        <span className={`text-3xl font-black ${style.price}`}>{fmtVnd(plan.price)}</span>
                        <span className={`text-base ${style.unit}`}>đ</span>
                        <span className={`text-xs ml-1 ${style.unit}`}>{t('pricing.perMonth')}</span>
                      </div>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-2 flex-1 mb-5">
                    {features.map((feature, i) => {
                      const featureText = (typeof feature === 'object' && feature !== null)
                        ? (feature[locale] || feature.vi || feature.en || '')
                        : getTranslatedFeature(feature, t);
                      return (
                        <li key={i} className="flex items-start gap-2">
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${style.featureIcon}`}>
                            <FaCheckCircle className="w-2.5 h-2.5" />
                          </div>
                          <span className={`text-xs leading-relaxed ${style.feature}`}>{featureText}</span>
                        </li>
                      );
                    })}
                  </ul>

                  {/* CTA */}
                  <button
                    onClick={() => handlePlanClick(plan)}
                    className={`w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-semibold text-xs transition-all ${style.button}`}
                  >
                    {hasPromotion ? t('pricing.claimOffer') : getPlanCtaLabel(plan, t)}
                    <FaArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </AnimatedSection>
            );
          })}
        </div>

        {!compact && (
          <p className="text-center text-sm text-slate-500 mt-10">
            Tất cả các gói đều bao gồm SSL miễn phí, backup hàng ngày và hỗ trợ kỹ thuật.
          </p>
        )}
      </div>

      <CustomPlanBuilder
        open={showCustomBuilder}
        onClose={() => setShowCustomBuilder(false)}
        billingPeriod={billingPeriod}
        glass={glass}
      />
    </section>
  );
}

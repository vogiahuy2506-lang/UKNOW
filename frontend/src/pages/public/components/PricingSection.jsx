import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaCheck, FaCrown, FaGem, FaRocket, FaStar, FaBolt, FaArrowRight, FaCog, FaClock, FaExclamationTriangle } from 'react-icons/fa';
import AnimatedSection from '../../../components/AnimatedSection';
import { useAuthStore } from '../../../stores/authStore';
import { getMyProfile } from '../../../features/auth/services/authApi.service';
import { getPlans } from '../../../services/plan.service';
import { getActivePromotions } from '../../../services/promotion.service';
import { useI18n } from '../../../i18n';
import CustomPlanBuilder from '../../../features/billing/CustomPlanBuilder';
import { toast } from 'react-hot-toast';
import checkoutApiService from '../../../features/checkout/services/checkoutApi.service';
import { getMyCustomPlan } from '../../../services/customPlan.service';
import { resolvePlanChange } from '../../../utils/planChange.util';
import {
  isContactPlan,
  isFreePlan,
  getPlanCtaLabel,
  getPlanTranslationKey,
  getTranslatedPlanName,
  getTranslatedPlanDescription,
  getTranslatedFeature,
} from '../../../utils/planTranslation.util';

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
// ĐÃ kèm sẵn 'đ' — đừng nối thêm <span>đ</span> ở JSX, sẽ ra "299.000đđ".
const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';

const calcSavings = (monthly, yearly) => {
  const pct = Math.round((Number(monthly) * 12 - Number(yearly)) / (Number(monthly) * 12) * 100);
  return pct > 0 ? pct : 0;
};

export default function PricingSection({ embedded = false, compact = false, glass = false }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { isAuthenticated, user, activeContext, updateUser } = useAuthStore();
const isEmployee = activeContext?.type === 'employee';
  const activePlanId = user?.activePlanId;
  const activePlanIsCustom = Boolean(user?.activePlanIsCustom);
  const activePlanPrice = user?.activePlanPrice;
  const currentPlanId = isAuthenticated && activeContext?.type === 'self'
    ? (user?.active_plan_id ?? user?.activePlanId ?? null)
    : null;
  const subscriptionExpiresAt = isAuthenticated && activeContext?.type === 'self'
    ? (user?.subscription_expires_at ?? user?.subscriptionExpiresAt ?? null)
    : null;
  const activeBillingPeriod = user?.activeBillingPeriod || 'monthly';
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [promotionsByPlanCode, setPromotionsByPlanCode] = useState({});
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  const [activatingPlanId, setActivatingPlanId] = useState(null);
  const [myCustomPlan, setMyCustomPlan] = useState(null);
  const [customPlanInfo, setCustomPlanInfo] = useState(null);
  const [pendingChange, setPendingChange] = useState(null);
  const [dayLossWarningPlan, setDayLossWarningPlan] = useState(null);
  const [planResolutions, setPlanResolutions] = useState({});

  const fetchScheduledChange = useCallback(async () => {
    if (!isAuthenticated || isEmployee) {
      setPendingChange(null);
      return;
    }
    try {
      const { data } = await checkoutApiService.getScheduledChange();
      setPendingChange(data?.scheduledChange || null);
    } catch {
      setPendingChange(null);
    }
  }, [isAuthenticated, isEmployee]);

  useEffect(() => {
    fetchScheduledChange();
  }, [fetchScheduledChange]);

  // Single Source of Truth: Fetch dynamic plan change resolutions directly from BE
  useEffect(() => {
    if (!isAuthenticated || isEmployee || !plans.length) {
      setPlanResolutions({});
      return;
    }
    let cancelled = false;
    const fetchResolutions = async () => {
      const standardPlans = plans.filter((p) => !isContactPlan(p));
      const results = await Promise.all(
        standardPlans.map(async (plan) => {
          try {
            const { data } = await checkoutApiService.resolvePlanChange({
              planId: plan.id,
              planCode: plan.code,
              billingPeriod,
            });
            return { planId: plan.id, resolution: data?.resolution };
          } catch {
            return { planId: plan.id, resolution: null };
          }
        })
      );
      if (!cancelled) {
        const map = {};
        results.forEach(({ planId, resolution }) => {
          if (resolution) map[planId] = resolution;
        });
        setPlanResolutions(map);
      }
    };
    fetchResolutions();
    return () => { cancelled = true; };
  }, [isAuthenticated, isEmployee, plans, billingPeriod, pendingChange, currentPlanId, subscriptionExpiresAt, activeBillingPeriod]);

  const currentPlan = useMemo(() => {
    if (!currentPlanId) return null;
    const found = plans.find((p) => Number(p.id) === Number(currentPlanId));
    if (found) return found;
    if (customPlanInfo) return customPlanInfo;
    return { id: currentPlanId, price: activePlanPrice || 0 };
  }, [currentPlanId, plans, customPlanInfo, activePlanPrice]);

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

  // Store `user` chỉ được nạp lúc đăng nhập — nếu admin gán/đổi gói trong lúc khách
  // đang có phiên đăng nhập cũ, active_plan_id trong store bị cũ (badge "Gói hiện tại"
  // trên thẻ gói sai) cho tới khi họ đăng nhập lại. Banner trên cùng luôn đúng vì nó
  // tự gọi getMyProfile() riêng (effect bên dưới) — hai nguồn lệch nhau gây ra hiện
  // tượng "F5 một lần chưa thấy, F5 lần hai mới thấy". Làm mới store 1 lần khi vào
  // trang để cả hai nơi hiển thị cùng một nguồn ngay từ lần F5 đầu.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getMyProfile();
        if (cancelled) return;
        const profile = data?.data || data;
        // Gộp chứ không ghi đè: /users/profile không trả `memberships` — updateUser(profile)
        // trần sẽ bị normalizeUser mặc định về [] và xoá mất danh sách workspace nhân viên.
        if (profile) updateUser({ ...user, ...profile });
      } catch {
        // im lặng — không phải lỗi chặn, trang vẫn dùng dữ liệu store cũ
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Nếu user đã có plan mà plan đó không có trong list public (gói custom / gói cũ
  // đã bị soft-delete), fetch /users/profile để biết tên gói và hiển thị banner
  // "Bạn đang dùng gói ..." thay vì để trống — chỉ chạy sau khi plans đã load.
  useEffect(() => {
    if (!currentPlanId || loading) return;
    const matched = plans.some((p) => Number(p.id) === Number(currentPlanId));
    if (matched) {
      setCustomPlanInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getMyProfile();
        if (cancelled) return;
        const profile = data?.data || data || {};
        setCustomPlanInfo({
          id: profile.activePlanId ?? currentPlanId,
          name: profile.activePlanName || null,
          code: profile.activePlanCode || null,
          price: profile.activePlanPrice ?? null,
        });
      } catch {
        if (!cancelled) setCustomPlanInfo({ id: currentPlanId });
      }
    })();
    return () => { cancelled = true; };
  }, [currentPlanId, plans, loading]);

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

  useEffect(() => {
    if (!isAuthenticated || !activePlanIsCustom || isEmployee) {
      setMyCustomPlan(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getMyCustomPlan();
        if (!cancelled && data?.data) {
          setMyCustomPlan(data.data);
        }
      } catch (err) {
        console.warn('Failed to load my custom plan', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, activePlanIsCustom, isEmployee]);

  const hasYearlyPricing = plans.some(p => !isContactPlan(p) && p.price_yearly);

  const handleCloseCustomBuilder = useCallback(() => {
    setShowCustomBuilder(false);
  }, []);

  const openCustomBuilder = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (isEmployee) return;
    if (activePlanIsCustom && !myCustomPlan) {
      try {
        const { data } = await getMyCustomPlan();
        if (data?.data) {
          setMyCustomPlan(data.data);
        }
      } catch {
        toast.error(t('customPlan.loadConfigFailed'));
        return;
      }
    }
    setShowCustomBuilder(true);
  };

  const handlePlanClick = async (plan, bypassWarning = false) => {
    if (isContactPlan(plan)) {
      openCustomBuilder();
      return;
    }
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    let resolution = planResolutions[plan.id];
    if (isAuthenticated && !isEmployee && !isContactPlan(plan)) {
      try {
        const { data } = await checkoutApiService.resolvePlanChange({
          planId: plan.id,
          planCode: plan.code,
          billingPeriod,
        });
        if (data?.resolution) {
          resolution = data.resolution;
        }
      } catch {
        // Fallback to local
      }
    }

    if (!resolution) {
      resolution = resolvePlanChange({
        currentPlan,
        currentBillingPeriod: activeBillingPeriod,
        subscriptionExpiresAt,
        targetPlan: plan,
        targetBillingPeriod: billingPeriod,
        pendingChange,
        now: new Date(),
      });
    }

    if (resolution.action === 'blocked') {
      toast.error(resolution.message || t('pricing.actionBlocked'));
      return;
    }

    if (!bypassWarning && resolution.action === 'upgrade_now' && resolution.daysRemaining >= 1) {
      setDayLossWarningPlan({
        plan,
        daysRemaining: Math.ceil(resolution.daysRemaining),
      });
      return;
    }

    // Gói miễn phí (dùng thử): kích hoạt ngay, không đưa qua trang thanh toán.
    // Backend vẫn là nơi chặn thật (1 lượt/tài khoản, không cho hạ gói giữa kỳ).
    if (isFreePlan(plan)) {
      if (activatingPlanId) return;
      setActivatingPlanId(plan.id);
      try {
        const { data } = await checkoutApiService.activateFreePlan({
          planCode: plan.code,
          billingPeriod,
        });
        if (!data?.success) throw new Error(data?.message);
        navigate('/payment-success', {
          replace: true,
          state: { orderCode: data.result.orderCode, fromCheckout: true },
        });
      } catch (err) {
        toast.error(
          err?.response?.data?.message
          || err?.message
          || t('pricing.trialActivateFailed')
        );
      } finally {
        setActivatingPlanId(null);
      }
      return;
    }
    navigate('/checkout', { state: { plan, billingPeriod, resolution } });
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

        {/* Pending scheduled plan change banner */}
        {pendingChange && (
          <div className="max-w-3xl mx-auto mb-6 rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50/40 p-4 flex items-start gap-4 shadow-sm">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
              <FaClock className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                  {t('pricing.pendingChangeBannerTitle')}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {t('pricing.pendingChangeBannerDesc', {
                  planName: pendingChange.plan_name,
                  period: pendingChange.billing_period === 'yearly' ? t('pricing.billingYearly') : t('pricing.billingMonthly'),
                  date: new Date(pendingChange.activate_after).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                })}
              </p>
            </div>
          </div>
        )}

        {/* Current plan banner — chỉ hiện khi user đang dùng plan không có trong list public
            (gói custom / gói cũ đã soft-delete). Khi match card → card tự highlight, không cần banner. */}
        {customPlanInfo && (
          <div className={`max-w-3xl mx-auto mb-6 rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-5 flex items-start gap-4 shadow-sm`}>
            <div className="w-10 h-10 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center">
              <FaCheck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider">
                  {t('pricing.currentPlanBadge')}
                </span>
                {customPlanInfo.name && (
                  <span className="text-sm font-bold text-slate-900 truncate">{customPlanInfo.name}</span>
                )}
                {customPlanInfo.code && (
                  <span className="text-xs text-emerald-700 font-mono">{customPlanInfo.code}</span>
                )}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed mb-3">
                {customPlanInfo.code?.toLowerCase() === 'custom' || !customPlanInfo.code
                  ? t('pricing.customPlanBannerDesc')
                  : t('pricing.currentPlanNoExpiry')}
              </p>
              <button
                onClick={() => navigate('/app/billing')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
              >
                <FaCog className="w-3.5 h-3.5" />
                {t('pricing.customPlanBannerCta')}
              </button>
            </div>
          </div>
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
            const isCurrentCustom = isAuthenticated && !isEmployee && isCustom && activePlanIsCustom;
            const isOwnerCustomForEmployee = isAuthenticated && isEmployee && isCustom && activePlanIsCustom;
            const isCurrentStandard = isAuthenticated
              && !isCustom
              && !activePlanIsCustom
              && Number(plan.id) === Number(activePlanId)
              && billingPeriod === activeBillingPeriod;
            const isCurrentStandardPlan = isAuthenticated
              && activeContext?.type === 'self'
              && !isCustom
              && currentPlanId != null
              && Number(plan.id) === Number(currentPlanId)
              && billingPeriod === activeBillingPeriod;
            const isCurrentPlan = isCurrentCustom || isCurrentStandard || isOwnerCustomForEmployee || isCurrentStandardPlan;
            const planCode = String(plan.code || '').toLowerCase();
            const promotion = promotionsByPlanCode[planCode];
            const hasPromotion = !isCustom && promotion?.discountAmount > 0;

            const resolution = (!isAuthenticated || isEmployee || isCustom)
              ? { action: 'upgrade_now', amountToPay: 0, code: null, daysRemaining: 0 }
              : (planResolutions[plan.id] || resolvePlanChange({
                  currentPlan,
                  currentBillingPeriod: activeBillingPeriod,
                  subscriptionExpiresAt,
                  targetPlan: plan,
                  targetBillingPeriod: billingPeriod,
                  pendingChange,
                  now: new Date(),
                }));

            const isCurrentPlanCard = isCurrentPlan || (isAuthenticated && !isCustom && resolution.action === 'blocked' && resolution.code === 'SAME_PLAN');

            let ctaButtonText = '';
            let ctaButtonDisabled = activatingPlanId === plan.id;
            let ctaButtonAction = () => handlePlanClick(plan);
            let ctaButtonTitle = undefined;

            if (isCurrentPlanCard) {
              ctaButtonText = t('pricing.managePlan');
              ctaButtonAction = () => navigate('/app/billing');
            } else if (resolution.action === 'blocked') {
              ctaButtonDisabled = true;
              ctaButtonTitle = resolution.message || undefined;
              if (resolution.code === 'YEARLY_TO_MONTHLY') {
                ctaButtonText = t('pricing.yearlyToMonthlyBlocked');
              } else if (resolution.code === 'PENDING_DOWNGRADE') {
                ctaButtonText = t('pricing.pendingDowngradeBlocked');
              } else {
                ctaButtonText = t('pricing.currentPlan');
              }
            } else if (resolution.action === 'upgrade_pending') {
              ctaButtonText = t('pricing.upgradePending');
            } else if (resolution.action === 'schedule') {
              ctaButtonText = t('pricing.scheduleChange');
            } else {
              // upgrade_now
              if (currentPlan && subscriptionExpiresAt && new Date(subscriptionExpiresAt) > new Date()) {
                if (billingPeriod === 'yearly' && activeBillingPeriod === 'monthly') {
                  ctaButtonText = t('pricing.upgradeToYearly');
                } else {
                  ctaButtonText = t('pricing.upgradeNow');
                }
              } else {
                ctaButtonText = hasPromotion ? t('pricing.claimOffer') : getPlanCtaLabel(plan, t);
              }
            }

            const style = styleSet[index % styleSet.length];
            const PlanIcon = style.icon;
            const features = Array.isArray(plan.features)
              ? plan.features
              : JSON.parse(plan.features || '[]');
            const planName = getTranslatedPlanName(plan, t);
            const planDescription = getTranslatedPlanDescription(plan, t);
            const rawPlanPrice = billingPeriod === 'yearly' && plan.price_yearly
              ? Number(plan.price_yearly)
              : Number(plan.price || 0);
            const promotedPrice = hasPromotion ? Number(promotion.finalAmount ?? rawPlanPrice) : rawPlanPrice;
            const discountPct = hasPromotion && rawPlanPrice > 0
              ? Math.round(promotion.discountAmount / rawPlanPrice * 100)
              : 0;
            const currentPlanExpiryText = isCurrentStandardPlan && subscriptionExpiresAt
              ? new Date(subscriptionExpiresAt).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })
              : null;

            return (
              <AnimatedSection key={plan.id} delay={index * 100}>
                <div className={`relative h-full rounded-xl p-5 flex flex-col transition-all hover:shadow-lg ${
                  isCurrentPlanCard
                    ? 'bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 border-2 border-emerald-400 shadow-md ring-1 ring-emerald-200'
                    : style.wrapper
                }`}>
                  {/* Current plan badge */}
                  {isCurrentPlanCard && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-md whitespace-nowrap">
                      <FaCheck className="w-3 h-3" />
                      <span>{t('pricing.currentPlanBadge')}</span>
                    </div>
                  )}

                  {/* Plan name + icon */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className={`text-base font-bold ${style.title}`}>{planName}</h3>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${style.iconBg}`}>
                        <PlanIcon className="w-4 h-4 text-orange-500" />
                      </div>
                    </div>
                    <p className={`text-xs leading-relaxed min-h-[32px] ${style.unit}`}>{planDescription}</p>
                    {isCurrentPlanCard && currentPlanExpiryText && (
                      <p className="text-[10px] text-emerald-600 font-medium mt-1">
                        {t('pricing.currentPlanMeta', { date: currentPlanExpiryText })}
                      </p>
                    )}
                    {isCurrentPlanCard && !currentPlanExpiryText && (
                      <p className="text-[10px] text-emerald-600 font-medium mt-1">
                        {t('pricing.currentPlanNoExpiry')}
                      </p>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mb-5 pb-5 border-b border-slate-200/30">
                    {isCustom ? (
                      activePlanIsCustom ? (
                        <div>
                          {billingPeriod === 'yearly' && myCustomPlan?.priceYearly ? (
                            <div>
                              <div className="flex items-baseline gap-0.5">
                                <span className={`text-3xl font-black ${style.price}`}>
                                  {fmtVnd(myCustomPlan.priceYearly)}
                                </span>
                              </div>
                              <div className={`text-xs ${style.unit}`}>{t('pricing.perYear')}</div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className={`text-xs ${style.unit}`}>
                                  ≈ {fmtVnd(Math.round(Number(myCustomPlan.priceYearly) / 12))} / tháng
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-baseline gap-0.5">
                                <span className={`text-3xl font-black ${style.price}`}>
                                  {fmtVnd(activePlanPrice || myCustomPlan?.price || 0)}
                                </span>
                                <span className={`text-xs ml-1 ${style.unit}`}>{t('pricing.perMonth')}</span>
                              </div>
                            </div>
                          )}
                          <div className={`text-[10px] ${style.unit} mt-1`}>
                            {t('checkout.vatIncluded')}
                          </div>
                        </div>
                      ) : (
                        <div className={`text-2xl font-black ${style.price}`}>
                          {t('customPlan.priceLabel')}
                        </div>
                      )
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
                        </div>
                        <div className={`text-xs ${style.unit}`}>
                          {billingPeriod === 'yearly' ? t('pricing.perYear') : t('pricing.perMonth')}
                        </div>
                      </div>
                    ) : billingPeriod === 'yearly' && plan.price_yearly ? (
                      <div>
                        <div className="flex items-baseline gap-0.5">
                          <span className={`text-3xl font-black ${style.price}`}>{fmtVnd(plan.price_yearly)}</span>
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
                        <span className={`text-xs ml-1 ${style.unit}`}>{t('pricing.perMonth')}</span>
                      </div>
                    )}
                    {!isCustom && Number(promotedPrice || rawPlanPrice || plan.price || 0) > 0 && (
                      <div className={`text-[10px] ${style.unit} mt-1`}>
                        {t('checkout.vatIncluded')}
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
                    onClick={ctaButtonAction}
                    disabled={ctaButtonDisabled}
                    title={ctaButtonTitle}
                    className={`w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-semibold text-xs transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                      isCurrentPlanCard
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : style.button
                    }`}
                  >
                    {activatingPlanId === plan.id ? t('pricing.activating') : ctaButtonText}
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

      {/* Day Loss Warning Modal */}
      {dayLossWarningPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <FaExclamationTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {t('pricing.dayLossWarningTitle')}
              </h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t('pricing.dayLossWarningDesc', { days: dayLossWarningPlan.daysRemaining })}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDayLossWarningPlan(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {t('pricing.dayLossWarningCancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = dayLossWarningPlan.plan;
                  setDayLossWarningPlan(null);
                  handlePlanClick(target, true);
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 transition-colors shadow-sm"
              >
                {t('pricing.dayLossWarningConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomPlanBuilder
        open={showCustomBuilder}
        onClose={handleCloseCustomBuilder}
        billingPeriod={myCustomPlan?.customConfig?.billingPeriod || billingPeriod}
        initialQuantities={myCustomPlan?.customConfig?.quantities || (typeof myCustomPlan?.customConfig === 'object' ? myCustomPlan.customConfig : null)}
        reusePlanId={myCustomPlan?.customConfig ? myCustomPlan.id : null}
        glass={glass}
      />
    </section>
  );
}

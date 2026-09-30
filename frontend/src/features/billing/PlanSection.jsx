import { useMemo } from 'react';
import {
  HiOutlineBadgeCheck,
  HiOutlineMail,
  HiOutlineChatAlt2,
  HiOutlineClock,
  HiOutlineTag,
  HiOutlineExclamation,
  HiOutlineSparkles,
} from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { getSubscriptionUiStatus, isUnlimitedPlanLimit } from '../../utils/subscriptionStatus.util.js';
import { isPlaceholderPlan } from '../../utils/placeholderPlan.util.js';
import UsageBar from './UsageBar';
import StorageUsageSection from '../storage/StorageUsageSection';
import { HiOutlineUsers, HiOutlineDesktopComputer } from 'react-icons/hi';

function formatPrice(price, t, isPlaceholder) {
  if (isPlaceholder) return t('accountProfileModal.contactForPrice');
  if (price === null || price === undefined) return t('accountProfileModal.contactForPrice');
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) return t('accountProfileModal.contactForPrice');
  if (numericPrice === 0) return t('accountProfileModal.free');
  return `${numericPrice.toLocaleString('vi-VN')} ₫`;
}

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const formatNumber = (value) => Number(value).toLocaleString('vi-VN');

/**
 * ISO → "dd/mm" theo giờ Việt Nam (ngày kỳ hạn mức làm mới). Rỗng / không hợp lệ → ''.
 * Ghép từ các phần (formatToParts) chứ không tin mẫu của locale: chỉ có ngày + tháng thì vi-VN ở nhiều bản
 * ICU/trình duyệt cho "10-10" (gạch ngang) thay vì "10/10" (đo trên Node 20).
 */
function formatDayMonth(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: VN_TIME_ZONE })
    .formatToParts(date);
  const day = parts.find((part) => part.type === 'day')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return day && month ? `${day}/${month}` : '';
}

/**
 * Tài nguyên cấu trúc hiển thị ở trang Thanh toán. `data.resourceUsage[key]` = { used, limit } do backend tính bằng
 * ĐÚNG hàm của cổng tạo mới (limit đã gồm slot mua thêm còn hạn; null = không giới hạn) hoặc null khi đồng hồ đó
 * lỗi (hiện "—"). `optional`: chỉ hiện khi gói có đặt trần hoặc đã có tài nguyên (WhatsApp/Telegram — W5).
 */
const RESOURCE_ROWS = [
  { key: 'chatbots', icon: HiOutlineSparkles, labelKey: 'topup.items.chatbots' },
  { key: 'landingPages', icon: HiOutlineDesktopComputer, labelKey: 'topup.items.landingPages' },
  { key: 'zaloAccounts', icon: HiOutlineChatAlt2, labelKey: 'topup.items.zaloAccounts' },
  { key: 'emailAccounts', icon: HiOutlineMail, labelKey: 'topup.items.emailAccounts' },
  { key: 'whatsappAccounts', icon: HiOutlineChatAlt2, labelKey: 'accountProfileModal.whatsappAccounts', optional: true },
  { key: 'telegramAccounts', icon: HiOutlineChatAlt2, labelKey: 'accountProfileModal.telegramAccounts', optional: true },
  { key: 'employees', icon: HiOutlineUsers, labelKey: 'topup.items.employees' },
];

function unwrapFeature(feat, locale) {
  if (typeof feat === 'object' && feat !== null) {
    return feat[locale] || feat.vi || feat.en || '';
  }
  return feat;
}

/** Plan + usage section shown for user_admin. */
export default function PlanSection({ data, t }) {
  const { locale } = useI18n();
  const hasPlan = !!data?.activePlanId;
  const planLabel = data?.activePlanName || data?.activePlanCode || (hasPlan ? `#${data.activePlanId}` : '');
  const isYearly = data?.activeBillingPeriod === 'yearly';
  const monthlyPrice = Number(data?.activePlanPrice);
  const isFreePlan = Number.isFinite(monthlyPrice) && monthlyPrice === 0;
  // price_yearly is legitimately NULL for older/custom plans. Keep the agreed
  // "Liên hệ" behavior for paid plans, but a zero-price plan must stay free
  // even if a legacy yearly entitlement has no separate annual price snapshot.
  const displayPrice = isYearly && data?.activePlanPriceYearly == null && isFreePlan
    ? data?.activePlanPrice
    : (isYearly ? data?.activePlanPriceYearly : data?.activePlanPrice);
  const isPlaceholder = isPlaceholderPlan({ code: data?.activePlanCode, isCustom: data?.activePlanIsCustom });

  const features = useMemo(() => {
    if (!data?.activePlanFeatures) return [];
    try {
      return Array.isArray(data.activePlanFeatures)
        ? data.activePlanFeatures
        : JSON.parse(data.activePlanFeatures);
    } catch {
      return [];
    }
  }, [data?.activePlanFeatures]);

  const subscriptionUi = useMemo(() => getSubscriptionUiStatus({
    hasPlan,
    subscriptionExpiresAt: data?.subscriptionExpiresAt,
    gracePeriodDays: data?.planGracePeriodDays,
  }), [hasPlan, data?.subscriptionExpiresAt, data?.planGracePeriodDays]);

  const serviceSuspended = subscriptionUi.serviceSuspended;

  if (!hasPlan) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
        <HiOutlineTag className="w-6 h-6 text-gray-300 mx-auto mb-1" />
        <p className="text-sm text-gray-500">{t('accountProfileModal.noPlanAssigned')}</p>
        <p className="text-xs text-gray-400 mt-0.5">{t('accountProfileModal.contactAdmin')}</p>
      </div>
    );
  }

  // ── Tin nhắn trong KỲ (PLAN_SO_LIEU_DUNG_GON_KHOP PR-3) ───────────────────────────────────────────────
  // Số "đã dùng" do backend đếm bằng ĐÚNG hàm của cổng chặn gửi tin, cùng kỳ 30 ngày từ ngày kích hoạt gói
  // (không phải tháng dương lịch). null = đồng hồ không đọc được → UsageBar hiện "—".
  const sendCycleEnd = formatDayMonth(data.sendCycleEnd);
  // Thanh "hôm nay" và "tổng kỳ" chỉ có nghĩa khi gói THẬT SỰ đặt trần đó; không đặt thì không vẽ thanh nào.
  const hasDailyEmailCap = !isUnlimitedPlanLimit(data.dailyEmailLimit);
  const hasDailyMessagingCap = !isUnlimitedPlanLimit(data.dailyZaloLimit);
  const hasCombinedCap = !isUnlimitedPlanLimit(data.messagesPerPeriod);
  // Ví mua thêm (email / tin nhắn) — chỉ để UsageBar biết khi vượt trần gói là đang dùng phần mua thêm.
  const usingEmailWallet = Number(data.addons?.emails?.granted) > 0;
  const usingMessagingWallet = Number(data.addons?.zaloMessages?.granted) > 0;

  // ── Lượt AI ────────────────────────────────────────────────────────────────────────────────────────────
  // Hạn mức NULL hoặc ≤ 0 = không giới hạn (đúng cổng aiCreditMeter: baseLimit <= 0 → không chặn) — hiện
  // "Không giới hạn", không bao giờ "0 / 0". Ví AI mua thêm KHÔNG hết hạn và không tính vào trần của kỳ.
  const aiLimit = Number(data.aiCreditsPerPeriod);
  const aiUnlimited = !(aiLimit > 0);
  const aiUsed = data.aiCreditsUsed ?? null;
  const aiRemaining = !aiUnlimited && aiUsed !== null ? Math.max(0, aiLimit - Number(aiUsed)) : null;
  const aiRefreshDate = formatDayMonth(data.aiCreditCycleEnd);
  const aiWalletRemaining = Math.max(0, Number(data.addons?.aiCredits?.remaining) || 0);

  return (
    <div className="space-y-5">
      {/* Plan name + price */}
      <div className="flex items-start justify-between gap-3 rounded-xl border border-primary-100 bg-primary-50 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 text-xs font-bold bg-primary-500 text-white rounded-full">
              {planLabel}
            </span>
            {data.activePlanCode && (
              <span className="text-xs text-primary-600 font-mono">{data.activePlanCode}</span>
            )}
          </div>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatPrice(displayPrice, t, isPlaceholder)}</p>
          {!isPlaceholder && displayPrice > 0 && (
            <p className="text-xs text-gray-400">{isYearly ? t('accountProfileModal.perYear') : t('accountProfileModal.perMonth')}</p>
          )}
          {!isPlaceholder && displayPrice > 0 && (
            <p className="text-xs text-gray-400">{t('pricing.taxNoteKct')}</p>
          )}
          <span className="inline-flex mt-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-white/70 text-primary-700 border border-primary-100">
            {isYearly ? t('accountProfileModal.billingYearly') : t('accountProfileModal.billingMonthly')}
          </span>
        </div>
        {data.planMaxEmployees !== null && (
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-500">{t('accountProfileModal.maxEmployees')}</p>
            <p className="text-sm font-bold text-gray-800">
              {data.planMaxEmployees === -1 ? t('accountProfileModal.unlimited') : t('accountProfileModal.people', { count: data.planMaxEmployees })}
            </p>
          </div>
        )}
      </div>

      {/* Expiry date */}
      {data.subscriptionExpiresAt && (() => {
        const expiresAt = new Date(data.subscriptionExpiresAt);
        const graceDays = Number(data.planGracePeriodDays) || 0;
        const graceUntil = new Date(expiresAt);
        graceUntil.setUTCDate(graceUntil.getUTCDate() + graceDays);
        const now = Date.now();
        const isPastExpiry = now > expiresAt.getTime();
        const isFullyExpired = isPastExpiry && now > graceUntil.getTime();
        const isInGrace = isPastExpiry && !isFullyExpired;
        const daysLeft = Math.ceil((expiresAt - now) / 86400000);
        const graceDaysLeft = Math.ceil((graceUntil - now) / 86400000);
        const isWarning = !isPastExpiry && daysLeft <= 7;
        const isDanger = !isPastExpiry && daysLeft <= 3;

        if (isFullyExpired) {
          return (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-red-50 border border-red-200 text-red-700">
              <HiOutlineExclamation className="w-4 h-4 shrink-0" />
              <span className="font-semibold">
                {t('accountProfileModal.fullyExpired')}
              </span>
            </div>
          );
        }

        if (isInGrace) {
          return (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-amber-50 border border-amber-200 text-amber-800">
              <HiOutlineExclamation className="w-4 h-4 shrink-0" />
              <span>
                {t('accountProfileModal.inGracePeriod', { days: graceDaysLeft })}
              </span>
            </div>
          );
        }

        return (
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            isDanger ? 'bg-red-50 border border-red-200 text-red-700'
            : isWarning ? 'bg-amber-50 border border-amber-200 text-amber-700'
            : 'bg-gray-50 border border-gray-200 text-gray-600'
          }`}>
            {isWarning
              ? <HiOutlineExclamation className="w-4 h-4 shrink-0" />
              : <HiOutlineClock className="w-4 h-4 shrink-0" />
            }
            <span>
              {t('accountProfileModal.expiresOn', { date: expiresAt.toLocaleDateString('vi-VN') })}
              {isWarning && daysLeft > 0 && (
                <span className="ml-1 font-semibold">{t('accountProfileModal.daysLeft', { days: daysLeft })}</span>
              )}
            </span>
          </div>
        );
      })()}

      {/* Features */}
      {features.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {features.map((feat, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
            >
              <HiOutlineBadgeCheck className="w-3 h-3 text-green-500" />
              {unwrapFeature(feat, locale)}
            </span>
          ))}
        </div>
      )}

      {/* Tin nhắn trong kỳ — mọi số lấy từ ĐÚNG hàm của cổng chặn gửi tin, cùng kỳ 30 ngày từ ngày kích hoạt gói */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-testid="messages-usage">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {sendCycleEnd
            ? t('accountProfileModal.messagesInCycleUntil', { date: sendCycleEnd })
            : t('accountProfileModal.messagesInCycle')}
        </p>
        <UsageBar
          icon={HiOutlineMail}
          label={t('accountProfileModal.email')}
          used={data.emailSentCycle}
          limit={data.monthlyEmailLimit}
          t={t}
          serviceSuspended={serviceSuspended}
          usingAddons={usingEmailWallet}
        />
        <UsageBar
          icon={HiOutlineChatAlt2}
          label={t('accountProfileModal.messagingChannels')}
          used={data.messagingSentCycle}
          limit={data.monthlyZaloLimit}
          t={t}
          serviceSuspended={serviceSuspended}
          usingAddons={usingMessagingWallet}
        />
        {hasCombinedCap && (
          <UsageBar
            icon={HiOutlineChatAlt2}
            label={t('accountProfileModal.messagesCombined')}
            used={data.combinedSentCycle}
            limit={data.messagesPerPeriod}
            t={t}
            serviceSuspended={serviceSuspended}
          />
        )}
        {hasDailyEmailCap && (
          <UsageBar
            icon={HiOutlineMail}
            label={t('accountProfileModal.emailToday')}
            used={data.emailSentToday}
            limit={data.dailyEmailLimit}
            t={t}
            serviceSuspended={serviceSuspended}
          />
        )}
        {hasDailyMessagingCap && (
          <UsageBar
            icon={HiOutlineChatAlt2}
            label={t('accountProfileModal.messagingToday')}
            used={data.messagingSentToday}
            limit={data.dailyZaloLimit}
            t={t}
            serviceSuspended={serviceSuspended}
          />
        )}
        <p className="text-[11px] text-gray-400">{t('accountProfileModal.includesQuickSend')}</p>
      </div>

      {/* Lượt AI — đã dùng / hạn mức kỳ, còn lại, ngày làm mới; ví mua thêm không hết hạn */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-testid="ai-usage">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('accountProfileModal.aiUsageTitle')}</p>
        <UsageBar
          icon={HiOutlineSparkles}
          label={t('accountProfileModal.aiUsed')}
          used={aiUsed}
          limit={aiUnlimited ? null : aiLimit}
          t={t}
          serviceSuspended={serviceSuspended}
          usingAddons={aiWalletRemaining > 0}
        />
        {!serviceSuspended && aiRemaining !== null && (
          <p className="text-xs text-gray-500" data-testid="ai-usage-remaining">
            {aiRefreshDate
              ? t('accountProfileModal.aiRemainingRefresh', { remaining: formatNumber(aiRemaining), date: aiRefreshDate })
              : t('accountProfileModal.aiRemaining', { remaining: formatNumber(aiRemaining) })}
          </p>
        )}
        {!serviceSuspended && aiWalletRemaining > 0 && (
          <p className="text-xs text-amber-700" data-testid="ai-usage-wallet">
            {t('accountProfileModal.aiWalletExtra', { n: formatNumber(aiWalletRemaining) })}
          </p>
        )}
      </div>

      {/* Tài nguyên — cùng hàm đếm và cùng trần với cổng tạo mới (trần đã gồm slot mua thêm còn hạn) */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-testid="resources-usage">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('accountProfileModal.resourcesTitle')}</p>
        {RESOURCE_ROWS.map(({ key, icon, labelKey, optional }) => {
          const entry = data.resourceUsage?.[key] ?? null;
          // W5: WhatsApp/Telegram chỉ hiện khi gói có đặt trần (NULL = không giới hạn) hoặc đã có tài khoản.
          if (optional && (!entry || (isUnlimitedPlanLimit(entry.limit) && !(entry.used > 0)))) return null;
          return (
            <UsageBar
              key={key}
              icon={icon}
              label={t(labelKey)}
              used={entry ? entry.used : null}
              limit={entry ? entry.limit : null}
              t={t}
              serviceSuspended={serviceSuspended}
            />
          );
        })}
      </div>

      {/* Storage quota usage */}
      <StorageUsageSection />

      {data.addons && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
            {t('accountProfileModal.addonsTitle')}
          </p>
          <ul className="space-y-1 text-sm text-amber-950">
            {[
              ['zaloMessages', 'topup.items.zaloMessages', true],
              ['emails', 'topup.items.emails', true],
              ['aiCredits', 'topup.items.aiCredits', true],
              ['zaloAccounts', 'topup.items.zaloAccounts', false],
              ['telegramAccounts', 'topup.items.telegramAccounts', false],
              ['whatsappAccounts', 'topup.items.whatsappAccounts', false],
              ['emailAccounts', 'topup.items.emailAccounts', false],
              ['landingPages', 'topup.items.landingPages', false],
              ['chatbots', 'topup.items.chatbots', false],
              ['employees', 'topup.items.employees', false],
            ].map(([field, labelKey, isWallet]) => {
              const raw = data.addons[field];
              if (isWallet) {
                const granted = Number(raw?.granted) || 0;
                if (granted <= 0) return null;
                const remaining = Number(raw?.remaining) || 0;
                return (
                  <li key={field}>
                    {t(labelKey)}
                    {' · '}
                    <span className="font-semibold">
                      {t('accountProfileModal.addonsRemaining', {
                        n: remaining.toLocaleString('vi-VN'),
                      })}
                    </span>
                  </li>
                );
              }
              const qty = Number(raw) || 0;
              if (qty <= 0) return null;
              return (
                <li key={field}>
                  {t(labelKey)}
                  {' · '}
                  <span className="font-semibold">
                    +{qty.toLocaleString('vi-VN')}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-amber-700/90 pt-1">
            {t('accountProfileModal.addonsRolloverNote')}
          </p>
        </div>
      )}
    </div>
  );
}

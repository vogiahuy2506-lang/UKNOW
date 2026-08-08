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
import { getSubscriptionUiStatus } from '../../utils/subscriptionStatus.util.js';
import UsageBar from './UsageBar';

function formatPrice(price, t) {
  if (price === null || price === undefined) return t('accountProfileModal.contactForPrice');
  if (price === 0) return t('accountProfileModal.free');
  return `${Number(price).toLocaleString('vi-VN')} ₫`;
}

/** Plan + usage section shown for user_admin. */
export default function PlanSection({ data, t }) {
  const hasPlan = !!data?.activePlanId;
  const planLabel = data?.activePlanName || data?.activePlanCode || (hasPlan ? `#${data.activePlanId}` : '');

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
          <p className="text-lg font-bold text-gray-900 mt-1">{formatPrice(data.activePlanPrice, t)}</p>
          {data.activePlanPrice > 0 && (
            <p className="text-xs text-gray-400">{t('accountProfileModal.perMonth')}</p>
          )}
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
              {feat}
            </span>
          ))}
        </div>
      )}

      {/* Usage bars — always show when user has a plan; each row handles null limit as unlimited */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('accountProfileModal.sendLimits')}</p>
        <UsageBar
          icon={HiOutlineMail}
          label={t('accountProfileModal.emailToday')}
          used={data.emailSentToday}
          limit={data.dailyEmailLimit}
          t={t}
          serviceSuspended={serviceSuspended}
        />
        <UsageBar
          icon={HiOutlineMail}
          label={t('accountProfileModal.emailThisMonth')}
          used={data.emailSentMonth}
          limit={data.monthlyEmailLimit}
          t={t}
          serviceSuspended={serviceSuspended}
          usingAddons={!!data.addons}
        />
        <UsageBar
          icon={HiOutlineChatAlt2}
          label={t('accountProfileModal.zaloToday')}
          used={data.zaloSentToday}
          limit={data.dailyZaloLimit}
          t={t}
          serviceSuspended={serviceSuspended}
        />
        <UsageBar
          icon={HiOutlineChatAlt2}
          label={t('accountProfileModal.zaloThisMonth')}
          used={data.zaloSentMonth}
          limit={data.monthlyZaloLimit}
          t={t}
          serviceSuspended={serviceSuspended}
          usingAddons={!!data.addons}
        />
        <UsageBar
          icon={HiOutlineSparkles}
          label={t('accountProfileModal.aiCredits')}
          used={data.aiCreditsUsed || 0}
          limit={data.aiCreditsPerPeriod}
          t={t}
          serviceSuspended={serviceSuspended}
          usingAddons={!!data.addons}
        />
      </div>

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

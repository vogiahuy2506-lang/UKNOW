import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineExclamation, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { getAiBillingBlockState, isUnlimitedPlanLimit } from '../../utils/subscriptionStatus.util.js';
import useStorageQuota from '../../features/storage/useStorageQuota';
import { formatBytes, getStorageAlertLevel } from '../../features/storage/storageUtils';

const DISMISS_KEY_PREFIX = 'founder_ai_credit_warning_dismissed:';

const isAdminUser = (user) => {
  const role = String(user?.roleCode || user?.role || '').trim().toLowerCase();
  return role === 'admin';
};

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const walletRemaining = (addons, field) => {
  if (!addons || typeof addons !== 'object') return 0;
  return Math.max(0, toFiniteNumber(addons[field]?.remaining));
};

/**
 * Build alert for a single quota metric.
 * Yellow/red only when wallet remaining is 0 (null addons = 0).
 */
const metricAlert = ({ key, used, limit, remainingWallet, t, resourceKey }) => {
  if (isUnlimitedPlanLimit(limit)) return null;
  const limitN = toFiniteNumber(limit);
  if (limitN <= 0) return null;
  if (remainingWallet > 0) return null;

  const usedN = Math.max(0, toFiniteNumber(used));
  const ratio = usedN / limitN;
  if (ratio < 0.8) return null;

  const leftover = Math.max(0, Math.ceil(limitN - usedN));
  const remainingPercent = Math.max(0, Math.round((1 - ratio) * 100));
  const resource = t(`creditBanner.resources.${resourceKey}`);
  const isEmpty = ratio >= 1;

  return {
    metric: key,
    kind: isEmpty ? `${key}-empty` : `${key}-low`,
    isEmpty,
    ratio,
    message: isEmpty
      ? t('creditBanner.empty', { resource })
      : t('creditBanner.low', {
          resource,
          remaining: leftover.toLocaleString(),
          percent: remainingPercent,
        }),
    used: usedN,
    limit: limitN,
  };
};

const CreditWarningBanner = ({ placement = 'page' }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const activeContext = useAuthStore((state) => state.activeContext);
  const aiCredits = useAuthStore((state) => state.aiCredits);
  const sendUsage = useAuthStore((state) => state.sendUsage);
  const addons = useAuthStore((state) => state.addons);
  const billingStatus = useAuthStore((state) => state.billingStatus);
  const { usage: storageUsage } = useStorageQuota();
  const [dismissedKind, setDismissedKind] = useState(null);
  const isEmployeeCtx = activeContext?.type === 'employee';

  const alertState = useMemo(() => {
    if (isAdminUser(user)) return null;

    if (billingStatus?.isFullyExpired) {
      return {
        metric: 'expired',
        kind: 'expired',
        isEmpty: true,
        ratio: 2,
        message: t('creditBanner.expired'),
      };
    }

    const aiWallet = walletRemaining(addons, 'aiCredits');
    const aiBlock = getAiBillingBlockState({
      isAdmin: false,
      billingStatus,
      aiCredits,
      walletRemaining: aiWallet,
    });

    const candidates = [];

    // Storage quota warning (evaluated for both owner and employee)
    const storageAlertLevel = getStorageAlertLevel(storageUsage);
    if (storageAlertLevel === 'critical') {
      candidates.push({
        metric: 'storage',
        kind: 'storage-critical',
        isEmpty: false,
        ratio: 0.99,
        message: isEmployeeCtx
          ? t('creditBanner.storageEmployeeLow')
          : t('creditBanner.storageCritical', {
              remaining: formatBytes(storageUsage?.remainingBytes),
            }),
      });
    } else if (storageAlertLevel === 'warning') {
      candidates.push({
        metric: 'storage',
        kind: 'storage-warning',
        isEmpty: false,
        ratio: 0.8,
        message: isEmployeeCtx
          ? t('creditBanner.storageEmployeeLow')
          : t('creditBanner.storageWarning', {
              percent: storageUsage?.percent,
              remaining: formatBytes(storageUsage?.remainingBytes),
            }),
      });
    }

    if (aiBlock?.type === 'credits') {
      candidates.push({
        metric: 'ai',
        kind: 'credits-empty',
        isEmpty: true,
        ratio: 1,
        message: t('creditBanner.empty', { resource: t('creditBanner.resources.ai') }),
      });
    } else {
      const aiLow = metricAlert({
        key: 'ai',
        used: aiCredits?.used,
        limit: aiCredits?.limit,
        remainingWallet: aiWallet,
        t,
        resourceKey: 'ai',
      });
      if (aiLow) candidates.push(aiLow);
    }

    // Email/Zalo usage counts are scoped to the logged-in userId, not billing
    // owner — only meaningful in self context.
    if (!isEmployeeCtx) {
      const emailAlert = metricAlert({
        key: 'email',
        used: sendUsage?.email?.used,
        limit: sendUsage?.email?.limit,
        remainingWallet: walletRemaining(addons, 'emails'),
        t,
        resourceKey: 'email',
      });
      if (emailAlert) candidates.push(emailAlert);

      const zaloAlert = metricAlert({
        key: 'zalo',
        used: sendUsage?.zalo?.used,
        limit: sendUsage?.zalo?.limit,
        remainingWallet: walletRemaining(addons, 'zaloMessages'),
        t,
        resourceKey: 'zalo',
      });
      if (zaloAlert) candidates.push(zaloAlert);
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (a.isEmpty !== b.isEmpty) return a.isEmpty ? -1 : 1;
      return (b.ratio || 0) - (a.ratio || 0);
    });
    return candidates[0];
  }, [addons, aiCredits, billingStatus, isEmployeeCtx, sendUsage, storageUsage, t, user]);

  useEffect(() => {
    if (!alertState?.kind || alertState.isEmpty) {
      setDismissedKind(null);
      return;
    }
    try {
      if (sessionStorage.getItem(`${DISMISS_KEY_PREFIX}${alertState.kind}`) === '1') {
        setDismissedKind(alertState.kind);
      } else {
        setDismissedKind(null);
      }
    } catch {
      setDismissedKind(null);
    }
  }, [alertState?.isEmpty, alertState?.kind]);

  if (!alertState || (!alertState.isEmpty && dismissedKind === alertState.kind)) return null;

  const handleDismiss = () => {
    if (alertState.isEmpty || !alertState.kind) return;
    try {
      sessionStorage.setItem(`${DISMISS_KEY_PREFIX}${alertState.kind}`, '1');
    } catch {
      // ignore storage failures
    }
    setDismissedKind(alertState.kind);
  };

  const isComposer = placement === 'composer';
  const showBuyTopup = alertState.kind !== 'expired' && alertState.metric !== 'storage' && !isEmployeeCtx;
  const primaryHref = (alertState.kind === 'expired' || isEmployeeCtx)
    ? '/pricing'
    : '/app/billing';
  const primaryCta = (alertState.kind === 'expired' || isEmployeeCtx)
    ? t('creditBanner.viewPricing')
    : t('creditBanner.goBilling');

  return (
    <div
      className={`flex items-center justify-between gap-3 border shadow-sm ${
        isComposer
          ? 'mb-2 rounded-xl px-3 py-2 text-xs'
          : 'sticky top-0 z-20 mb-4 rounded-md px-3 py-2 text-sm'
      } ${
        alertState.isEmpty
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2">
        <HiOutlineExclamation
          className={`shrink-0 ${isComposer ? 'h-4 w-4' : 'h-5 w-5'} ${alertState.isEmpty ? 'text-red-500' : 'text-amber-500'}`}
        />
        <span className="min-w-0">{alertState.message}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showBuyTopup && (
          <button
            type="button"
            onClick={() => navigate('/app/topup')}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
              alertState.isEmpty
                ? 'border border-red-600 bg-white text-red-700 hover:bg-red-50'
                : 'border border-amber-500 bg-white text-amber-800 hover:bg-amber-50'
            }`}
          >
            {t('creditBanner.buyTopup')}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(primaryHref)}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
            alertState.isEmpty
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-amber-500 text-white hover:bg-amber-600'
          }`}
        >
          {primaryCta}
        </button>
        {!alertState.isEmpty && (
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded p-1 text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900"
            aria-label={t('creditBanner.dismiss')}
          >
            <HiOutlineX className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default CreditWarningBanner;

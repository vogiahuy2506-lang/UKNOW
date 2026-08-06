import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineExclamation, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { getAiBillingBlockState } from '../../utils/subscriptionStatus.util.js';

const DISMISS_KEY = 'founder_ai_credit_warning_dismissed';

const isAdminUser = (user) => {
  const role = String(user?.roleCode || user?.role || '').trim().toLowerCase();
  return role === 'admin';
};

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const CreditWarningBanner = ({ placement = 'page' }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const aiCredits = useAuthStore((state) => state.aiCredits);
  const billingStatus = useAuthStore((state) => state.billingStatus);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const alertState = useMemo(() => {
    if (isAdminUser(user)) return null;

    if (billingStatus?.isFullyExpired) {
      return {
        kind: 'expired',
        isEmpty: true,
        message: t('creditBanner.expired'),
        cta: t('creditBanner.viewPricing'),
      };
    }

    const aiBlock = getAiBillingBlockState({ isAdmin: false, billingStatus, aiCredits });
    if (aiBlock?.type === 'credits') {
      const limit = toFiniteNumber(aiCredits?.limit);
      const used = Math.max(0, toFiniteNumber(aiCredits?.used));
      return {
        kind: 'credits-empty',
        isEmpty: true,
        message: t('creditBanner.empty'),
        cta: t('creditBanner.upgrade'),
        used,
        limit,
      };
    }

    const limit = toFiniteNumber(aiCredits?.limit);
    if (limit <= 0) return null;

    const used = Math.max(0, toFiniteNumber(aiCredits?.used));
    const ratio = used / limit;
    if (ratio < 0.8) return null;

    const remaining = Math.max(0, Math.ceil(limit - used));
    const remainingPercent = Math.max(0, Math.round((1 - ratio) * 100));
    return {
      kind: 'credits-low',
      isEmpty: false,
      message: t('creditBanner.low', {
        remaining: remaining.toLocaleString(),
        percent: remainingPercent,
      }),
      cta: t('creditBanner.upgrade'),
      used,
      limit,
      remaining,
      remainingPercent,
    };
  }, [aiCredits, billingStatus, t, user]);

  useEffect(() => {
    if (alertState?.isEmpty) setIsDismissed(false);
  }, [alertState?.isEmpty, alertState?.kind]);

  if (!alertState || (!alertState.isEmpty && isDismissed)) return null;

  const handleDismiss = () => {
    if (alertState.isEmpty) return;
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore storage failures
    }
    setIsDismissed(true);
  };

  const isComposer = placement === 'composer';

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
        {alertState.kind !== 'expired' && (
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
          onClick={() => navigate('/pricing')}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
            alertState.isEmpty
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-amber-500 text-white hover:bg-amber-600'
          }`}
        >
          {alertState.cta}
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

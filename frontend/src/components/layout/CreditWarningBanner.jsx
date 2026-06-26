import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineExclamation, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';

const DISMISS_KEY = 'founder_ai_credit_warning_dismissed';

const isAdminUser = (user) => {
  const role = String(user?.roleCode || user?.role || '').trim().toLowerCase();
  return role === 'admin';
};

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const CreditWarningBanner = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const aiCredits = useAuthStore((state) => state.aiCredits);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const creditState = useMemo(() => {
    const limit = toFiniteNumber(aiCredits?.limit);
    if (limit <= 0 || isAdminUser(user)) return null;

    const used = Math.max(0, toFiniteNumber(aiCredits?.used));
    const ratio = used / limit;
    if (ratio < 0.8) return null;

    const remaining = Math.max(0, Math.ceil(limit - used));
    const remainingPercent = Math.max(0, Math.round((1 - ratio) * 100));
    return {
      used,
      limit,
      ratio,
      remaining,
      remainingPercent,
      isEmpty: ratio >= 1,
    };
  }, [aiCredits?.limit, aiCredits?.used, user]);

  useEffect(() => {
    if (creditState?.isEmpty) setIsDismissed(false);
  }, [creditState?.isEmpty]);

  if (!creditState || (!creditState.isEmpty && isDismissed)) return null;

  const handleDismiss = () => {
    if (creditState.isEmpty) return;
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore storage failures
    }
    setIsDismissed(true);
  };

  return (
    <div
      className={`sticky top-0 z-20 mb-4 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm shadow-sm ${
        creditState.isEmpty
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2">
        <HiOutlineExclamation
          className={`h-5 w-5 shrink-0 ${creditState.isEmpty ? 'text-red-500' : 'text-amber-500'}`}
        />
        <span className="min-w-0">
          {creditState.isEmpty
            ? t('creditBanner.empty')
            : t('creditBanner.low', {
                remaining: creditState.remaining.toLocaleString(),
                percent: creditState.remainingPercent,
              })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/pricing')}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
            creditState.isEmpty
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-amber-500 text-white hover:bg-amber-600'
          }`}
        >
          {t('creditBanner.upgrade')}
        </button>
        {!creditState.isEmpty && (
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

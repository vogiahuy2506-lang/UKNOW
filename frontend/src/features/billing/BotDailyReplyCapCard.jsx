import { useEffect, useState } from 'react';
import { HiOutlineChatAlt2 } from 'react-icons/hi';
import { updateBotDailyReplyCap } from '../auth/services/authApi.service';

/** UX-only: dưới mức này gần như chắc đang gõ nhầm — không lấy từ env. */
const LOW_CAP_WARN_BELOW = 20;

/**
 * Owner-only control: daily cap on bot AI replies across all channels/chatbots.
 */
export default function BotDailyReplyCapCard({ data, t, onSaved }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    const cap = data?.botDailyReplyCap;
    setValue(cap != null && Number(cap) > 0 ? String(cap) : '');
  }, [data?.botDailyReplyCap]);

  const aiUsed = Number(data?.aiCreditsUsed) || 0;
  const aiLimit = data?.aiCreditsPerPeriod;
  const aiRemaining = aiLimit == null ? null : Math.max(0, Number(aiLimit) - aiUsed);

  const usedToday = Number(data?.botRepliesUsedToday);
  const usedTodaySafe = Number.isFinite(usedToday) && usedToday >= 0 ? usedToday : 0;
  const savedCap = data?.botDailyReplyCap != null && Number(data.botDailyReplyCap) > 0
    ? Number(data.botDailyReplyCap)
    : null;

  const typedCap = (() => {
    const trimmed = String(value || '').trim();
    if (trimmed === '') return null;
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const showLowCapWarn = typedCap != null && typedCap < LOW_CAP_WARN_BELOW;

  const limits = data?.chatbotRateLimits;
  const showSystemLimits = limits
    && Number.isFinite(Number(limits.perSenderPerMin))
    && Number.isFinite(Number(limits.perSenderPerHour))
    && Number.isFinite(Number(limits.perSenderPerDay))
    && Number.isFinite(Number(limits.perChatbotPerHour));

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSavedOk(false);
    setSaving(true);
    try {
      const trimmed = String(value || '').trim();
      const payload = {
        botDailyReplyCap: trimmed === '' ? null : Number.parseInt(trimmed, 10),
      };
      if (payload.botDailyReplyCap != null
        && (!Number.isFinite(payload.botDailyReplyCap) || payload.botDailyReplyCap <= 0)) {
        setError(t('billingHub.botCapInvalid'));
        return;
      }
      const res = await updateBotDailyReplyCap(payload);
      const next = res?.data?.botDailyReplyCap ?? null;
      setValue(next != null ? String(next) : '');
      setSavedOk(true);
      onSaved?.(next);
    } catch (err) {
      setError(err?.response?.data?.message || t('billingHub.botCapSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"
    >
      <div className="flex items-start gap-2">
        <HiOutlineChatAlt2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">
            {t('billingHub.botCapTitle')}
          </h3>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            {t('billingHub.botCapHelp')}
          </p>
          {aiRemaining != null && (
            <p className="mt-1 text-xs text-gray-500">
              {t('billingHub.botCapCreditsLeft', {
                n: aiRemaining.toLocaleString('vi-VN'),
              })}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-600">
            {savedCap != null
              ? t('billingHub.botCapUsedTodayWithCap', {
                used: usedTodaySafe.toLocaleString('vi-VN'),
                cap: savedCap.toLocaleString('vi-VN'),
              })
              : t('billingHub.botCapUsedToday', {
                used: usedTodaySafe.toLocaleString('vi-VN'),
              })}
          </p>
          <p className="mt-1 text-xs text-amber-700/90">
            {t('billingHub.botCapCacheNote')}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="bot-daily-reply-cap">
          {t('billingHub.botCapTitle')}
        </label>
        <input
          id="bot-daily-reply-cap"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          placeholder={t('billingHub.botCapPlaceholder')}
          value={value}
          onChange={(ev) => {
            setSavedOk(false);
            setValue(ev.target.value);
          }}
          className="w-full sm:max-w-[12rem] rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>

      {showLowCapWarn && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
          {t('billingHub.botCapLowWarn', { n: typedCap })}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {savedOk && !error && (
        <p className="text-sm text-green-600">{t('billingHub.botCapSaved')}</p>
      )}

      {showSystemLimits && (
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3 space-y-2">
          <p className="text-xs font-semibold text-slate-700">
            {t('billingHub.botCapSystemTitle')}
          </p>
          <p className="text-[11px] text-slate-500">
            {t('billingHub.botCapSystemSubtitle')}
          </p>
          <ul className="text-xs text-slate-600 space-y-1">
            <li>
              {t('billingHub.botCapSystemPerSender', {
                min: limits.perSenderPerMin,
                hour: limits.perSenderPerHour,
                day: limits.perSenderPerDay,
              })}
            </li>
            <li>
              {t('billingHub.botCapSystemPerBot', {
                hour: limits.perChatbotPerHour,
              })}
            </li>
          </ul>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {t('billingHub.botCapSystemSilent')}
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {t('billingHub.botCapSystemNotify')}
          </p>
        </div>
      )}
    </form>
  );
}

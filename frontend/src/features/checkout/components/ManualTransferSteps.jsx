/**
 * Manual transfer steps — shown under the QR / bank-info block when the
 * user prefers to type the transfer in manually instead of scanning.
 *
 * Kept pure: receives only the i18n `t` function plus the 3 step strings,
 * so the parent doesn't have to know about the visual layout.
 */
export default function ManualTransferSteps({ t, stepKeys }) {
  const steps = stepKeys.map((key) => t(key));
  return (
    <div className="bg-gradient-to-br from-orange-50/60 to-transparent border border-orange-200/70 rounded-2xl p-3.5 space-y-2">
      <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">
        {t('checkout.manualTransferTitle')}
      </p>
      {steps.map((step, i) => (
        <div
          key={i}
          className="flex items-center gap-3 text-xs text-slate-700 bg-white/80 p-2.5 rounded-xl border border-white"
        >
          <span className="shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-orange-500 to-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
            {i + 1}
          </span>
          <span className="font-medium leading-snug">{step}</span>
        </div>
      ))}
      <p className="text-[10px] text-slate-500 italic leading-tight pt-1 border-t border-orange-200/40">
        {t('checkout.manualTransferCaveat')}
      </p>
    </div>
  );
}

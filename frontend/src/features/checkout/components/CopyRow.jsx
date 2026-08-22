import { useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineCheck, HiOutlineDuplicate } from 'react-icons/hi';

/**
 * Compact copy cell — shows a label/value pair with a copy-to-clipboard
 * button. Used by the PayOS instructions block on the checkout page so
 * users can copy the bank name, account number, amount, etc.
 *
 * Visual feedback: the button swaps to a check icon for 1.5s after a
 * successful copy, and a toast fires `checkout.copied`.
 */
export default function CopyRow({ label, value, displayValue, onCopied, t, hint }) {
  const [copied, setCopied] = useState(false);

  const handle = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      toast.success(t('checkout.copied'));
      onCopied?.();
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-white border border-slate-200/80 hover:border-orange-200 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </div>
        <div className="text-sm font-mono font-bold text-slate-800 truncate">
          {displayValue || '—'}
        </div>
        {hint && (
          <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{hint}</div>
        )}
      </div>
      <button
        type="button"
        onClick={handle}
        disabled={!value}
        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700 px-2.5 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {copied ? (
          <>
            <HiOutlineCheck className="w-3.5 h-3.5" />
            <span>{t('checkout.copiedField')}</span>
          </>
        ) : (
          <>
            <HiOutlineDuplicate className="w-3.5 h-3.5" />
            <span>{t('checkout.copyField')}</span>
          </>
        )}
      </button>
    </div>
  );
}

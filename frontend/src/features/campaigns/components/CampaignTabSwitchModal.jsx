import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineExclamation } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Hộp hỏi khi đổi tab (Từng bước ⇄ Sơ đồ khối) lúc còn thay đổi CHƯA LƯU: `Lưu rồi chuyển` · `Bỏ thay đổi` · `Ở lại`.
 * Hai tab không đồng bộ ngầm trong trình duyệt — chỉ đồng bộ qua server — nên bắt buộc phải chọn một trong ba.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {boolean} [props.isSaving] đang lưu: khoá cả ba nút
 * @param {() => void} props.onSave Lưu rồi chuyển
 * @param {() => void} props.onDiscard Bỏ thay đổi (chuyển luôn)
 * @param {() => void} props.onStay Ở lại
 */
export default function CampaignTabSwitchModal({ isOpen, isSaving = false, onSave, onDiscard, onStay }) {
  const { t } = useI18n();
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setTimeout(() => ref.current?.focus(), 30);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSaving) onStay?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSaving, onStay]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-tab-switch-title"
      data-testid="campaign-tab-switch-modal"
    >
      <div className="fixed inset-0" onClick={() => !isSaving && onStay?.()} aria-hidden="true" />
      <div
        ref={ref}
        tabIndex={-1}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl outline-none dark:border-dk-border/90 dark:bg-dk-surface"
      >
        <div className="flex items-start gap-4 p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
            <HiOutlineExclamation className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 id="campaign-tab-switch-title" className="text-base font-bold leading-snug text-slate-900 dark:text-dk-text sm:text-lg">
              {t('campaignTabs.unsavedTitle')}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-dk-text2">{t('campaignTabs.unsavedBody')}</p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2.5 border-t border-slate-100 bg-slate-50/80 px-6 py-4 dark:border-dk-border dark:bg-dk-raised/80 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onStay}
            disabled={isSaving}
            data-testid="campaign-tab-switch-stay"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-dk-border dark:bg-dk-surface dark:text-dk-text dark:hover:bg-dk-raised"
          >
            {t('campaignTabs.stay')}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            data-testid="campaign-tab-switch-discard"
            className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:bg-dk-surface dark:text-rose-300 dark:hover:bg-rose-950/30"
          >
            {t('campaignTabs.discard')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            data-testid="campaign-tab-switch-save"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-500/20 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50"
          >
            {isSaving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />}
            {t('campaignTabs.saveAndSwitch')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

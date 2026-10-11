import { useI18n } from '../../../i18n';

/**
 * Thẻ thu gọn của một khối tuỳ chọn trong trình soạn biểu mẫu (Đặt lịch hẹn / Thu tiền / Giao diện).
 * Bấm vào thì khối thật mở ra (state do FormEditorPage giữ). Khối đang bật tính năng nào thì
 * FormEditorPage mở sẵn khối đó, không dựng thẻ này.
 *
 * @param {{
 *   id: string,
 *   title: string,
 *   hint?: string,
 *   icon: import('react').ComponentType<{ className?: string }>,
 *   onOpen: () => void,
 * }} props
 */
export default function AddSectionCard({ id, title, hint, icon: Icon, onOpen }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      id={id}
      aria-expanded="false"
      onClick={onOpen}
      className="w-full flex items-center gap-3.5 text-left bg-gradient-to-r from-slate-50/80 to-white dark:from-dk-raised dark:to-dk-surface hover:from-orange-50/50 hover:to-amber-50/30 dark:hover:from-orange-950/20 dark:hover:to-amber-950/10 rounded-2xl border-2 border-dashed border-slate-300 dark:border-dk-border hover:border-orange-400 dark:hover:border-orange-500/60 px-6 py-5 transition-all duration-200 group shadow-2xs hover:shadow-sm"
    >
      <span className="w-11 h-11 rounded-2xl bg-white dark:bg-dk-raised border border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-text2 group-hover:bg-gradient-to-br group-hover:from-orange-500 group-hover:to-amber-500 group-hover:text-white group-hover:border-transparent group-hover:shadow-md group-hover:shadow-orange-500/25 transition-all flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-800 dark:text-dk-text group-hover:text-orange-700 dark:group-hover:text-orange-400 transition-colors">
          {title}
        </span>
        {hint && <span className="block text-xs text-slate-500 dark:text-dk-text2 mt-0.5 leading-relaxed">{hint}</span>}
      </span>
      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white dark:bg-dk-raised border border-slate-200 dark:border-dk-border text-slate-400 dark:text-dk-text group-hover:border-orange-300 dark:group-hover:border-orange-500/50 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-all shrink-0">
        + {t('forms.editorPage.openBlock')}
      </span>
    </button>
  );
}

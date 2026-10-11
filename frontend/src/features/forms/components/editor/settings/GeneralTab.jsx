import { useI18n } from '../../../../../i18n';

/**
 * Tab "Thông tin chung" của modal Cài đặt: mô tả / lời chào hiển thị dưới tiêu đề biểu mẫu.
 * Tiêu đề nhập ngay trên thanh trên cùng của trang (ô tên biểu mẫu) nên không lặp lại ở đây.
 */
export default function GeneralTab({ description, setDescription, errors }) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-dk-text2">{t('forms.editorPage.generalInfoSubtitle')}</p>

      <div>
        <label htmlFor="form-description" className="block text-sm font-semibold text-slate-700 dark:text-dk-text mb-1.5">
          {t('forms.formDescription')}
        </label>
        <textarea
          id="form-description"
          rows={5}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('forms.editorPage.descPlaceholder')}
          className={`w-full px-4 py-2.5 rounded-xl border text-sm text-slate-800 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted bg-white dark:bg-dk-bg focus:outline-none focus:ring-4 transition shadow-2xs resize-y ${
            errors.description
              ? 'border-red-300 dark:border-red-500/60 focus:ring-red-100 dark:focus:ring-red-950/30'
              : 'border-slate-200 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border-strong focus:border-orange-500 focus:ring-orange-500/10'
          }`}
        />
        {errors.description && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.description}</p>}
        <p className="text-xs text-slate-400 dark:text-dk-muted mt-1.5 text-right">{description.length}/5000</p>
      </div>

      <p className="text-xs text-slate-500 dark:text-dk-text2 rounded-xl bg-slate-50 dark:bg-dk-raised/60 border border-slate-100 dark:border-dk-border px-3.5 py-2.5">
        {t('forms.editorPage.settings.titleHint')}
      </p>
    </div>
  );
}

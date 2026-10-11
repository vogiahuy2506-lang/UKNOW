import { useI18n } from '../../../../../i18n';
import { MAX_CONSENT_TEXT_LENGTH } from '../formEditorConstants';

/**
 * Tab "Sau khi gửi" của modal Cài đặt: thông báo chủ biểu mẫu, ô đồng ý (kèm lời đồng ý tuỳ chỉnh), email xác nhận,
 * chữ nút gửi, lời cảm ơn, chuyển hướng. Chuyển NGUYÊN VĂN khối "Sau khi gửi" của trình soạn cũ (state/handler không đổi).
 */
export default function AfterSubmitTab({ settings, setSettings, errors }) {
  const { t } = useI18n();

  // Dòng tóm tắt, vd "Hiện lời cảm ơn · báo email cho bạn".
  const afterSubmitSummary = [
    settings.redirectUrl?.trim()
      ? t('forms.editorPage.afterSubmit.summaryRedirect')
      : t('forms.editorPage.afterSubmit.summaryThanks'),
    settings.notifyOwner && t('forms.editorPage.afterSubmit.summaryNotifyOwner'),
    settings.sendConfirmation && t('forms.editorPage.afterSubmit.summaryConfirmation'),
    settings.consentEnabled && t('forms.editorPage.afterSubmit.summaryConsent'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/50 px-3.5 py-2.5">
        <p className="text-xs text-slate-600 dark:text-dk-text2">{t('forms.editorPage.afterSubmitSubtitle')}</p>
        <p className="text-xs font-semibold text-teal-800 dark:text-teal-300 mt-1">
          <span>{t('forms.editorPage.afterSubmit.summaryLabel')} </span>
          <span data-testid="after-submit-summary">{afterSubmitSummary}</span>
        </p>
      </div>

      <div id="section-settings-body" className="space-y-4 divide-y divide-slate-100 dark:divide-dk-border">
        {/* notifyOwner */}
        <div className="flex items-start justify-between gap-4 pt-4 first:pt-0">
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-dk-text">{t('forms.notifyOwner')}</div>
            <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">{t('forms.editorPage.notifyOwnerHelp')}</p>
          </div>
          <input
            type="checkbox"
            aria-label={t('forms.notifyOwner')}
            checked={settings.notifyOwner}
            onChange={(e) => setSettings((prev) => ({ ...prev, notifyOwner: e.target.checked }))}
            className="mt-1 h-4 w-4 rounded text-teal-600 dark:text-teal-400 focus:ring-teal-500 border-slate-300 dark:border-dk-border-strong"
          />
        </div>

        {/* consentEnabled */}
        <div className="flex items-start justify-between gap-4 pt-4">
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-dk-text">{t('forms.consentEnabled')}</div>
            <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">{t('forms.editorPage.consentEnabledHelp')}</p>
          </div>
          <input
            type="checkbox"
            aria-label={t('forms.consentEnabled')}
            checked={settings.consentEnabled}
            onChange={(e) => setSettings((prev) => ({ ...prev, consentEnabled: e.target.checked }))}
            className="mt-1 h-4 w-4 rounded text-teal-600 dark:text-teal-400 focus:ring-teal-500 border-slate-300 dark:border-dk-border-strong"
          />
        </div>

        {/* consentText — lời đồng ý tuỳ chỉnh, chỉ có nghĩa khi bật ô đồng ý */}
        {settings.consentEnabled && (
          <div className="pt-4 space-y-1">
            <label htmlFor="form-consent-text" className="block text-sm font-semibold text-slate-700 dark:text-dk-text">
              {t('forms.editorPage.afterSubmit.consentTextLabel')}
            </label>
            <textarea
              id="form-consent-text"
              rows={2}
              maxLength={MAX_CONSENT_TEXT_LENGTH}
              value={settings.consentText || ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, consentText: e.target.value }))}
              placeholder={t('publicForm.consentLabel')}
              className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-dk-bg text-sm text-slate-800 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 shadow-2xs resize-y ${
                errors.consentText
                  ? 'border-red-300 dark:border-red-500/60 focus:ring-red-200 dark:focus:ring-red-950/30'
                  : 'border-slate-200 dark:border-dk-border focus:ring-teal-100 dark:focus:ring-teal-950/40 focus:border-teal-500'
              }`}
            />
            <p className="text-xs text-slate-500 dark:text-dk-text2">{t('forms.editorPage.afterSubmit.consentTextHelp')}</p>
            {errors.consentText && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.consentText}</p>}
          </div>
        )}

        {/* sendConfirmation */}
        <div className="flex items-start justify-between gap-4 pt-4">
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-dk-text">{t('forms.sendConfirmation')}</div>
            <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">{t('forms.editorPage.sendConfirmationHelp')}</p>
          </div>
          <input
            type="checkbox"
            aria-label={t('forms.sendConfirmation')}
            checked={settings.sendConfirmation}
            onChange={(e) => setSettings((prev) => ({ ...prev, sendConfirmation: e.target.checked }))}
            className="mt-1 h-4 w-4 rounded text-teal-600 dark:text-teal-400 focus:ring-teal-500 border-slate-300 dark:border-dk-border-strong"
          />
        </div>

        {/* submitButtonText */}
        <div className="pt-4 space-y-1">
          <label className="block text-sm font-semibold text-slate-700 dark:text-dk-text">
            {t('forms.submitButtonText')}
          </label>
          <input
            type="text"
            maxLength={50}
            value={settings.submitButtonText}
            onChange={(e) => setSettings((prev) => ({ ...prev, submitButtonText: e.target.value }))}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-bg text-sm text-slate-800 dark:text-dk-text focus:outline-none focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950/40 focus:border-teal-500 shadow-2xs"
          />
          {errors.submitButtonText && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.submitButtonText}</p>
          )}
        </div>

        {/* successMessage */}
        <div className="pt-4 space-y-1">
          <label className="block text-sm font-semibold text-slate-700 dark:text-dk-text">
            {t('forms.successMessage')}
          </label>
          <textarea
            rows={2}
            maxLength={500}
            value={settings.successMessage}
            onChange={(e) => setSettings((prev) => ({ ...prev, successMessage: e.target.value }))}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-bg text-sm text-slate-800 dark:text-dk-text focus:outline-none focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950/40 focus:border-teal-500 shadow-2xs resize-y"
          />
          {errors.successMessage && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.successMessage}</p>
          )}
        </div>

        {/* redirectUrl */}
        <div className="pt-4 space-y-1">
          <label className="block text-sm font-semibold text-slate-700 dark:text-dk-text">
            {t('forms.redirectUrl')}
          </label>
          <input
            type="url"
            maxLength={2000}
            value={settings.redirectUrl}
            onChange={(e) => setSettings((prev) => ({ ...prev, redirectUrl: e.target.value }))}
            placeholder="https://example.com/cam-on"
            className={`w-full px-4 py-2.5 rounded-xl border text-sm bg-white dark:bg-dk-bg text-slate-800 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 shadow-2xs ${
              errors.redirectUrl
                ? 'border-red-300 dark:border-red-500/60 focus:ring-red-200 dark:focus:ring-red-950/30'
                : 'border-slate-200 dark:border-dk-border focus:ring-teal-100 dark:focus:ring-teal-950/40 focus:border-teal-500'
            }`}
          />
          {errors.redirectUrl && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.redirectUrl}</p>}
        </div>
      </div>
    </div>
  );
}

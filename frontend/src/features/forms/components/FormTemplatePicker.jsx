import { useEffect, useRef, useState } from 'react';
import {
  HiOutlineArrowLeft,
  HiOutlineCalendar,
  HiOutlineCash,
  HiOutlineChatAlt2,
  HiOutlineClipboardList,
  HiOutlineDocument,
  HiOutlineSparkles,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { FORM_TEMPLATES } from '../constants/formTemplates';
import { aiDraftForm } from '../services/formAdminApi.service';
import { getAiDraftErrorMessage } from '../utils/aiDraftError.util';

// Khớp trần mô tả của backend (aiFormDraft.service.js MAX_DRAFT_DESCRIPTION_LENGTH).
const MAX_AI_DESCRIPTION_LENGTH = 1000;
// Bốn câu mô tả mẫu bấm điền nhanh — chữ nằm ở i18n (`forms.editorPage.ai.picker.examples.<id>.{label,text}`).
const AI_EXAMPLE_IDS = ['englishTrial', 'clinicBooking', 'courseDeposit', 'satisfactionSurvey'];

const TEMPLATE_ICONS = {
  consult: HiOutlineChatAlt2,
  booking: HiOutlineCalendar,
  payment: HiOutlineCash,
  survey: HiOutlineClipboardList,
  blank: HiOutlineDocument,
};

/**
 * Bước đầu khi TẠO biểu mẫu mới: nhờ AI dựng từ mô tả, hoặc chọn một mẫu dựng sẵn (hoặc "Trống").
 * Chỉ hiện ở /app/forms/new — sửa biểu mẫu cũ đi thẳng vào trình soạn.
 *
 * AI (PR-5): `POST /forms/ai-draft` chỉ trả NHÁP — `onAiDraft(draft)` đổ nháp vào trình soạn, KHÔNG lưu; người dùng xem lại rồi
 * bấm Lưu. Lỗi (hết lượt AI, AI trả về hỏng…) hiện ngay tại ô AI, các mẫu thường bên dưới vẫn chọn được.
 *
 * @param {{
 *   onSelect: (templateId: string) => void,
 *   onAiDraft?: (draft: object) => void,
 *   onBack: () => void,
 *   isEmployee: boolean,
 * }} props
 *   isEmployee: mẫu `ownerOnly` (thu tiền) chỉ chủ tài khoản dùng được — nhân viên không gửi được paymentConfig.
 */
export default function FormTemplatePicker({ onSelect, onAiDraft, onBack, isEmployee = false }) {
  const { t, locale } = useI18n();
  const [description, setDescription] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [error, setError] = useState('');
  // Cờ trong ref chứ không chỉ state: `disabled` theo state chỉ có hiệu lực sau lần render kế, hai cú bấm sát nhau vẫn lọt hai lời
  // gọi — tức trừ HAI lượt AI cho một ý định (cùng khuôn "AI viết hộ" chatbot).
  const inFlightRef = useRef(false);
  // Rời bước chọn mẫu giữa lúc AI đang chạy (bấm Quay lại) thì bỏ kết quả — đừng đè trình soạn bằng một nháp không ai chờ.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleDraft = async () => {
    if (inFlightRef.current || !onAiDraft) return;
    const trimmed = description.trim();
    if (!trimmed) {
      setError(t('forms.editorPage.ai.picker.descriptionRequired'));
      return;
    }
    if (trimmed.length > MAX_AI_DESCRIPTION_LENGTH) {
      setError(t('forms.editorPage.ai.picker.descriptionTooLong', { max: MAX_AI_DESCRIPTION_LENGTH }));
      return;
    }
    setError('');
    inFlightRef.current = true;
    setIsDrafting(true);
    try {
      const draft = await aiDraftForm({
        mode: 'create',
        description: trimmed,
        locale: locale === 'en' ? 'en' : 'vi',
      });
      if (!mountedRef.current) return;
      if (!draft || !Array.isArray(draft.fields) || draft.fields.length === 0) {
        setError(t('forms.editorPage.ai.picker.emptyResult'));
        return;
      }
      onAiDraft(draft);
    } catch (err) {
      if (mountedRef.current) {
        setError(getAiDraftErrorMessage(err, t, t('forms.editorPage.ai.picker.failed')));
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setIsDrafting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="form-template-picker">
      <div className="flex items-center gap-3 py-3.5 border-b border-gray-100 dark:border-dk-border">
        <button
          type="button"
          onClick={onBack}
          className="p-2.5 rounded-xl border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-gray-50 dark:hover:bg-dk-strong text-gray-600 dark:text-dk-text hover:text-gray-900 dark:hover:text-dk-text shadow-2xs transition-all"
          title={t('forms.submissionsPage.backToForms')}
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dk-text">{t('forms.createNew')}</h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-dk-text2 mt-0.5">{t('forms.editorPage.templates.subtitle')}</p>
        </div>
      </div>

      {onAiDraft && (
        <section
          data-testid="form-ai-draft-card"
          aria-busy={isDrafting}
          className="rounded-2xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/20 p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md shadow-violet-500/25 flex items-center justify-center shrink-0">
              <HiOutlineSparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 dark:text-dk-text">{t('forms.editorPage.ai.picker.title')}</h2>
              <p className="text-xs text-gray-600 dark:text-dk-text2 mt-0.5 leading-relaxed">{t('forms.editorPage.ai.picker.subtitle')}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="form-ai-description" className="text-xs font-semibold text-gray-700 dark:text-dk-text block">
              {t('forms.editorPage.ai.picker.label')}
            </label>
            <textarea
              id="form-ai-description"
              data-testid="form-ai-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_AI_DESCRIPTION_LENGTH}
              rows={3}
              disabled={isDrafting}
              placeholder={t('forms.editorPage.ai.picker.placeholder')}
              className="input resize-y min-h-[84px] text-sm w-full disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-gray-500 dark:text-dk-text2">{t('forms.editorPage.ai.picker.examplesLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {AI_EXAMPLE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={isDrafting}
                  data-testid={`form-ai-example-${id}`}
                  onClick={() => {
                    setDescription(t(`forms.editorPage.ai.picker.examples.${id}.text`));
                    setError('');
                  }}
                  className="px-3 py-1.5 rounded-full border border-violet-200 dark:border-violet-800/60 bg-white dark:bg-dk-raised text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100/70 dark:hover:bg-dk-strong transition disabled:opacity-60"
                >
                  {t(`forms.editorPage.ai.picker.examples.${id}.label`)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" data-testid="form-ai-draft-error" className="text-xs text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950/40 rounded-xl">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="text-[11px] text-gray-500 dark:text-dk-text2">
              {isDrafting ? t('forms.editorPage.ai.picker.creatingHint') : t('forms.editorPage.ai.creditNote')}
            </span>
            <button
              type="button"
              data-testid="form-ai-draft-submit"
              onClick={handleDraft}
              disabled={isDrafting}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white text-sm font-bold shadow-xs transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isDrafting ? (
                <>
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white/40 border-t-white" aria-hidden="true" />
                  <span>{t('forms.editorPage.ai.picker.creating')}</span>
                </>
              ) : (
                <>
                  <HiOutlineSparkles className="w-4 h-4" />
                  <span>{t('forms.editorPage.ai.picker.create')}</span>
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {onAiDraft && (
        <p className="text-xs font-semibold text-gray-500 dark:text-dk-text2 -mb-2">{t('forms.editorPage.ai.picker.orPickTemplate')}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FORM_TEMPLATES.map((template) => {
          const Icon = TEMPLATE_ICONS[template.id] || HiOutlineDocument;
          const locked = template.ownerOnly && isEmployee;
          return (
            <button
              key={template.id}
              type="button"
              // Đang chờ AI thì khoá luôn các mẫu: chọn mẫu giữa chừng rồi nháp AI về sau là một đường đua không ai muốn.
              disabled={locked || isDrafting}
              onClick={() => onSelect(template.id)}
              data-testid={`form-template-${template.id}`}
              className="text-left p-5 rounded-2xl border border-gray-200/90 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xs hover:border-orange-300 dark:hover:border-orange-500/50 hover:shadow-sm active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-gray-200/90 dark:disabled:hover:border-dk-border disabled:hover:shadow-xs space-y-3"
            >
              <div className="inline-flex p-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-base font-bold text-gray-900 dark:text-dk-text">{t(template.nameKey)}</div>
                <p className="text-xs text-gray-500 dark:text-dk-text2 mt-1 leading-relaxed">{t(template.descKey)}</p>
                {locked && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">{t('forms.editorPage.payment.employeeReadOnlyNotice')}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

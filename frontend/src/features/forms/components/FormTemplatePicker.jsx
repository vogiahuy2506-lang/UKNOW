import { useEffect, useRef, useState } from 'react';
import {
  HiOutlineCalendar,
  HiOutlineCash,
  HiOutlineChatAlt2,
  HiOutlineClipboardList,
  HiOutlineDocument,
  HiOutlineDocumentText,
  HiOutlineLightBulb,
  HiOutlinePaperAirplane,
  HiOutlineSparkles,
} from 'react-icons/hi';
import { EditorTopbar } from '../../../components/editor/AdminEditorShell';
import { useI18n } from '../../../i18n';
import { FORM_TEMPLATES } from '../constants/formTemplates';
import { aiDraftForm } from '../services/formAdminApi.service';
import { getAiDraftErrorMessage } from '../utils/aiDraftError.util';

// Khớp trần mô tả của backend (aiFormDraft.service.js MAX_DRAFT_DESCRIPTION_LENGTH).
const MAX_AI_DESCRIPTION_LENGTH = 1000;
// Bốn câu mô tả mẫu bấm điền nhanh — chữ nằm ở i18n (`forms.editorPage.ai.picker.examples.<id>.{label,text}`).
const AI_EXAMPLE_IDS = ['englishTrial', 'clinicBooking', 'courseDeposit', 'satisfactionSurvey'];
// Mẫu "Trống" không nằm trong lưới thẻ mà đứng ở hàng cuối ("Muốn tự soạn từ đầu?").
const BLANK_TEMPLATE_ID = 'blank';

const TEMPLATE_ICONS = {
  consult: HiOutlineChatAlt2,
  booking: HiOutlineCalendar,
  payment: HiOutlineCash,
  survey: HiOutlineClipboardList,
  blank: HiOutlineDocument,
};

/**
 * Bước đầu khi TẠO biểu mẫu mới: nhờ AI dựng từ mô tả, hoặc chọn một mẫu dựng sẵn (hoặc "Biểu mẫu trống").
 * Chỉ hiện ở /app/forms/new — sửa biểu mẫu cũ đi thẳng vào trình soạn.
 *
 * Bố cục (13/10/2026) CHÉP từ màn tạo landing page (`landing-canvas/components/CanvasChatPanel.jsx`, khối `CenteredStudioView`):
 * thanh trên gọn → hero căn giữa → khung soạn lớn (Enter gửi, Shift+Enter xuống dòng) → chip gợi ý → lưới thẻ mẫu gọn → hàng cuối
 * "Muốn tự soạn từ đầu?". Chỉ chép KIỂU, không dùng chung component với landing (hai luồng khác nhau).
 *
 * AI (PR-5): `POST /forms/ai-draft` chỉ trả NHÁP — `onAiDraft(draft)` đổ nháp vào trình soạn, KHÔNG lưu; người dùng xem lại rồi
 * bấm Lưu. Lỗi (hết lượt AI, AI trả về hỏng…) hiện ngay dưới khung soạn, các mẫu thường bên dưới vẫn chọn được.
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

  // Enter = gửi, Shift+Enter = xuống dòng (như ô soạn của landing). Gõ tiếng Việt bằng bộ gõ có lúc Enter chỉ để chốt chữ đang gõ
  // dở (`isComposing`) — đó không phải lệnh gửi, nếu không sẽ trừ một lượt AI khi người dùng chưa nhập xong.
  const handleDescriptionKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
      e.preventDefault();
      handleDraft();
    }
  };

  const blankTemplate = FORM_TEMPLATES.find((template) => template.id === BLANK_TEMPLATE_ID);
  const gridTemplates = FORM_TEMPLATES.filter((template) => template.id !== BLANK_TEMPLATE_ID);

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50 dark:bg-dk-bg overflow-hidden" data-testid="form-template-picker">
      <EditorTopbar
        onBack={onBack}
        backTitle={t('forms.submissionsPage.backToForms')}
        icon={HiOutlineDocumentText}
        title={t('forms.editorPage.templates.topbarTitle')}
      />

      <div className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-b from-gray-50/70 via-white to-orange-50/20 dark:from-dk-bg dark:via-dk-surface dark:to-dk-bg flex flex-col items-center p-4 sm:p-6 lg:p-8" data-testid="form-template-scroll">
        {/* Căn giữa dọc bằng my-auto, KHÔNG justify-center ở khung cuộn: nội dung cao hơn màn (điện thoại) thì justify-center đẩy
            phần đầu (badge + tiêu đề) lên trên mép, không cuộn tới được. */}
        <div className="w-full max-w-3xl my-auto py-6">
          <div className="w-full flex flex-col items-center text-center">
            {onAiDraft ? (
              <>
                {/* Badge lấp lánh */}
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-orange-500/10 border border-orange-200/60 dark:border-orange-500/30 text-orange-700 dark:text-orange-400 text-xs font-semibold mb-3 shadow-2xs backdrop-blur-sm animate-pulse">
                  <HiOutlineSparkles className="w-4 h-4 text-orange-500 dark:text-orange-400" />
                  <span>{t('forms.editorPage.ai.picker.badge')}</span>
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 dark:text-dk-text tracking-tight leading-tight">
                  {t('forms.editorPage.ai.picker.heading')}
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-dk-text2 max-w-xl mt-2 leading-relaxed">
                  {t('forms.editorPage.ai.picker.subtitle')}
                </p>

                <section data-testid="form-ai-draft-card" aria-busy={isDrafting} className="w-full mt-6 text-left">
                  {/* Khung soạn lớn ở giữa */}
                  <div className="bg-white dark:bg-dk-surface rounded-2xl border border-gray-200/90 dark:border-dk-border shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.4)] hover:shadow-[0_12px_36px_rgb(0,0,0,0.09)] focus-within:border-orange-400 dark:focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-500/10 transition-all p-3 sm:p-4">
                    <label htmlFor="form-ai-description" className="sr-only">
                      {t('forms.editorPage.ai.picker.label')}
                    </label>
                    <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                      <textarea
                        id="form-ai-description"
                        data-testid="form-ai-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={handleDescriptionKeyDown}
                        maxLength={MAX_AI_DESCRIPTION_LENGTH}
                        rows={3}
                        disabled={isDrafting}
                        placeholder={t('forms.editorPage.ai.picker.placeholder')}
                        className="flex-1 min-w-0 resize-none bg-gray-50/60 dark:bg-dk-inset hover:bg-white dark:hover:bg-dk-surface focus:bg-white dark:focus:bg-dk-inset border border-gray-200 dark:border-dk-border focus:border-orange-500 dark:focus:border-orange-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-gray-900 dark:text-dk-text placeholder:text-gray-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 focus:ring-orange-500/15 disabled:bg-gray-50 dark:disabled:bg-dk-bg disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                        style={{ maxHeight: 180 }}
                      />
                      <button
                        type="button"
                        data-testid="form-ai-draft-submit"
                        onClick={handleDraft}
                        disabled={isDrafting}
                        className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all shrink-0 shadow-xs text-xs font-bold"
                      >
                        {isDrafting ? (
                          <>
                            <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white/40 border-t-white" aria-hidden="true" />
                            <span>{t('forms.editorPage.ai.picker.creating')}</span>
                          </>
                        ) : (
                          <>
                            <span>{t('forms.editorPage.ai.picker.createButton')}</span>
                            <HiOutlinePaperAirplane className="w-4 h-4 -rotate-45" aria-hidden="true" />
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-gray-400 dark:text-dk-muted mt-2 px-1 select-none">
                      <span>{t('forms.editorPage.ai.picker.shortcutHint')}</span>
                      <span>{isDrafting ? t('forms.editorPage.ai.picker.creatingHint') : t('forms.editorPage.ai.creditNote')}</span>
                    </div>
                  </div>

                  {error && (
                    <p role="alert" data-testid="form-ai-draft-error" className="mt-3 text-xs text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950/40 rounded-xl">
                      {error}
                    </p>
                  )}

                  {/* Gợi ý nhanh: bấm chỉ điền sẵn mô tả — KHÔNG tự gửi, không tốn lượt AI. */}
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-dk-text2">{t('forms.editorPage.ai.picker.examplesLabel')}</span>
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
                        className="px-3 py-1.5 rounded-full border border-gray-200/90 dark:border-dk-border bg-white dark:bg-dk-raised text-xs font-medium text-gray-700 dark:text-dk-text hover:border-orange-400 dark:hover:border-orange-500/60 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-dk-strong transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {t(`forms.editorPage.ai.picker.examples.${id}.label`)}
                      </button>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-dk-text tracking-tight leading-tight">{t('forms.createNew')}</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-dk-text2 max-w-xl mt-2 leading-relaxed">{t('forms.editorPage.templates.subtitle')}</p>
              </>
            )}

            {/* Mẫu có sẵn */}
            <div className="w-full mt-8 text-left">
              {onAiDraft && (
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-bold text-gray-600 dark:text-dk-text uppercase tracking-wider flex items-center gap-1.5">
                    <HiOutlineLightBulb className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                    {t('forms.editorPage.ai.picker.templatesHeading')}
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-dk-muted font-medium">
                    {t('forms.editorPage.templates.count', { count: gridTemplates.length })}
                  </span>
                </div>
              )}

              <div data-testid="form-template-grid" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {gridTemplates.map((template) => {
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
                      className="group relative flex items-start gap-3 p-3.5 rounded-xl border border-gray-200/90 dark:border-dk-border bg-white dark:bg-dk-surface hover:border-orange-400 dark:hover:border-orange-500/60 hover:shadow-sm dark:hover:bg-dk-raised hover:scale-[1.01] transition-all text-left cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none disabled:hover:border-gray-200/90 dark:disabled:hover:border-dk-border dark:disabled:hover:bg-dk-surface"
                    >
                      <span className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 group-hover:bg-orange-100 dark:group-hover:bg-orange-500/25 transition-all">
                        <Icon className="w-5 h-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-gray-900 dark:text-dk-text group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors truncate">
                          {t(template.nameKey)}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-dk-text2 mt-0.5 line-clamp-2 leading-relaxed">{t(template.descKey)}</p>
                        {locked && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 leading-relaxed">{t('forms.editorPage.payment.employeeReadOnlyNotice')}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hàng cuối: tự soạn từ đầu */}
            {blankTemplate && (
              <div
                data-testid="form-template-blank-row"
                className="w-full mt-7 pt-5 border-t border-gray-200/60 dark:border-dk-border flex flex-wrap items-center justify-center gap-3 text-xs text-gray-500 dark:text-dk-text2"
              >
                <span className="text-gray-400 dark:text-dk-muted">{t('forms.editorPage.templates.blankQuestion')}</span>
                <button
                  type="button"
                  disabled={isDrafting}
                  onClick={() => onSelect(blankTemplate.id)}
                  data-testid={`form-template-${blankTemplate.id}`}
                  title={t(blankTemplate.descKey)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-dk-border/80 bg-white dark:bg-dk-raised hover:bg-gray-50 dark:hover:bg-dk-strong hover:border-gray-300 dark:hover:border-dk-border-strong text-gray-700 dark:text-dk-text font-semibold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  <HiOutlineDocument className="w-4 h-4 text-gray-500 dark:text-dk-text2" aria-hidden="true" />
                  <span>{t('forms.editorPage.templates.blankButton')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

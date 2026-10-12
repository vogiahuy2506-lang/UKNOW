import { useEffect, useRef, useState } from 'react';
import { HiOutlineSparkles, HiOutlineReply, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../../i18n';
import { aiDraftForm } from '../../services/formAdminApi.service';
import { getAiDraftErrorMessage } from '../../utils/aiDraftError.util';
import { isDisplayFieldType } from '../../utils/formFieldTypes.util';
import { MAX_FIELDS } from './formEditorConstants';

const MAX_NOTE_LENGTH = 300;

/**
 * Hai nút AI của trình soạn biểu mẫu (PR-5, PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING):
 *  - "AI gợi ý câu hỏi": AI đề xuất câu hỏi MỚI (không lặp câu đã có) → hiện danh sách để TÍCH CHỌN từng câu rồi mới thêm vào cuối;
 *  - "AI viết lại câu chữ": AI viết lại nhãn / chữ hướng dẫn / lựa chọn cho rõ ràng — áp ngay lên các trường, số lượng, loại,
 *    bắt buộc và thứ tự giữ nguyên; có nút "Hoàn tác" 1 bước.
 * Cả hai chỉ gọi khi người dùng bấm "chạy" (có ghi chú "1 lượt AI"), không tự gọi. Component KHÔNG giữ state biểu mẫu: thêm trường /
 * áp bản viết lại / hoàn tác đều qua callback của trang.
 *
 * @param {{
 *   title: string,
 *   description: string,
 *   fields: Array<object>,
 *   productId?: string,
 *   onAddFields: (fields: object[]) => number,
 *   onApplyRewrite: (patches: object[]) => number,
 *   canUndo: boolean,
 *   onUndo: () => void,
 * }} props
 *   `onAddFields` trả số trường thực sự thêm (trang cắt theo trần 30); `onApplyRewrite` trả số trường thực sự đổi chữ.
 */
export default function FormAiTools({ title, description, fields, productId = '', onAddFields, onApplyRewrite, canUndo, onUndo }) {
  const { t, locale } = useI18n();
  // 'suggest' | 'rewrite' | null — panel đang mở bên dưới hai nút.
  const [panel, setPanel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  // Cờ trong ref: hai cú bấm sát nhau không được lọt thành hai lời gọi (= trừ hai lượt AI cho một ý định).
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const inputCount = fields.filter((f) => !isDisplayFieldType(f.type)).length;
  const remaining = Math.max(0, MAX_FIELDS - inputCount);
  const aiLocale = locale === 'en' ? 'en' : 'vi';

  const togglePanel = (next) => {
    if (busy) return;
    setError('');
    setSuggestions(null);
    setNote('');
    setPanel((prev) => (prev === next ? null : next));
  };

  // Biểu mẫu đang soạn (kể cả chưa lưu) gửi cho AI. Trường mới key rỗng.
  const buildExistingForm = () => ({
    title,
    description,
    fields: fields.map((f) => ({
      key: f.key || '',
      type: f.type,
      label: f.label || '',
      required: Boolean(f.required),
      role: f.role || '',
      placeholder: f.placeholder || '',
      helpText: f.helpText || '',
      width: f.width === 'half' ? 'half' : 'full',
      options: Array.isArray(f.options) ? f.options : [],
    })),
  });

  const baseRequest = (mode) => {
    const request = { mode, existingForm: buildExistingForm(), locale: aiLocale };
    if (note.trim()) request.description = note.trim();
    const pid = Number(productId);
    if (Number.isInteger(pid) && pid > 0) request.productId = pid;
    return request;
  };

  const runSuggest = async () => {
    if (inFlightRef.current) return;
    if (remaining <= 0) {
      setError(t('forms.editorPage.ai.tools.suggest.full', { max: MAX_FIELDS }));
      return;
    }
    setError('');
    inFlightRef.current = true;
    setBusy(true);
    try {
      const draft = await aiDraftForm(baseRequest('suggest_questions'));
      if (!mountedRef.current) return;
      const list = Array.isArray(draft?.fields) ? draft.fields : [];
      if (list.length === 0) {
        setError(t('forms.editorPage.ai.tools.suggest.empty'));
        return;
      }
      setSuggestions(list);
      setSelected(new Set(list.map((_, i) => i)));
    } catch (err) {
      if (mountedRef.current) setError(getAiDraftErrorMessage(err, t, t('forms.editorPage.ai.tools.suggest.failed')));
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const toggleSelected = (index) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const addSelected = () => {
    const chosen = (suggestions || []).filter((_, i) => selected.has(i));
    if (chosen.length === 0) return;
    onAddFields(chosen);
    setSuggestions(null);
    setPanel(null);
    setNote('');
  };

  const runRewrite = async () => {
    if (inFlightRef.current) return;
    if (!fields.some((f) => f.type !== 'page_break' && f.label && f.label.trim())) {
      setError(t('forms.editorPage.ai.tools.rewrite.empty'));
      return;
    }
    setError('');
    inFlightRef.current = true;
    setBusy(true);
    // Chỉ số trong đáp án ứng với chỉ số lúc GỬI — nhớ uid của từng vị trí để áp đúng trường dù người dùng sửa/xếp lại khi đang chờ.
    const sentUids = fields.map((f) => f.uid);
    try {
      const draft = await aiDraftForm(baseRequest('rewrite'));
      if (!mountedRef.current) return;
      const out = Array.isArray(draft?.fields) ? draft.fields : [];
      if (out.length !== sentUids.length) {
        setError(t('forms.editorPage.ai.tools.rewrite.failed'));
        return;
      }
      onApplyRewrite(
        out.map((f, i) => ({
          uid: sentUids[i],
          label: typeof f.label === 'string' ? f.label : '',
          helpText: typeof f.helpText === 'string' ? f.helpText : '',
          placeholder: typeof f.placeholder === 'string' ? f.placeholder : '',
          options: Array.isArray(f.options) ? f.options.map(String) : [],
        }))
      );
      setPanel(null);
      setNote('');
    } catch (err) {
      if (mountedRef.current) setError(getAiDraftErrorMessage(err, t, t('forms.editorPage.ai.tools.rewrite.failed')));
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  const selectedCount = selected.size;
  const addCount = Math.min(selectedCount, remaining);

  const toolButton =
    'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div className="px-3 pt-3 sm:px-4 sm:pt-4 min-w-0" data-testid="form-ai-tools">
      <div className="rounded-2xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-950/20 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-800 dark:text-violet-300">
            <HiOutlineSparkles className="w-3.5 h-3.5" />
            {t('forms.editorPage.ai.tools.title')}
          </span>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button
              type="button"
              data-testid="form-ai-suggest-toggle"
              aria-expanded={panel === 'suggest'}
              disabled={busy}
              onClick={() => togglePanel('suggest')}
              className={`${toolButton} ${panel === 'suggest' ? 'bg-violet-100 dark:bg-dk-strong border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200' : 'bg-white dark:bg-dk-raised border-violet-200 dark:border-violet-800/60 text-violet-700 dark:text-violet-300 hover:bg-violet-100/70 dark:hover:bg-dk-strong'}`}
            >
              <HiOutlineSparkles className="w-3.5 h-3.5" />
              {t('forms.editorPage.ai.tools.suggest.toggle')}
            </button>
            <button
              type="button"
              data-testid="form-ai-rewrite-toggle"
              aria-expanded={panel === 'rewrite'}
              disabled={busy}
              onClick={() => togglePanel('rewrite')}
              className={`${toolButton} ${panel === 'rewrite' ? 'bg-violet-100 dark:bg-dk-strong border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200' : 'bg-white dark:bg-dk-raised border-violet-200 dark:border-violet-800/60 text-violet-700 dark:text-violet-300 hover:bg-violet-100/70 dark:hover:bg-dk-strong'}`}
            >
              <HiOutlineSparkles className="w-3.5 h-3.5" />
              {t('forms.editorPage.ai.tools.rewrite.toggle')}
            </button>
            {canUndo && (
              <button
                type="button"
                data-testid="form-ai-rewrite-undo"
                disabled={busy}
                onClick={onUndo}
                className={`${toolButton} bg-white dark:bg-dk-raised border-gray-300 dark:border-dk-border text-gray-700 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-strong`}
              >
                <HiOutlineReply className="w-3.5 h-3.5" />
                {t('forms.editorPage.ai.tools.rewrite.undo')}
              </button>
            )}
          </div>
        </div>

        {panel && (
          <div className="space-y-2.5" data-testid={`form-ai-panel-${panel}`}>
            {!suggestions && (
              <>
                <p className="text-xs text-gray-600 dark:text-dk-text2 leading-relaxed">
                  {panel === 'suggest' ? t('forms.editorPage.ai.tools.suggest.description') : t('forms.editorPage.ai.tools.rewrite.description')}
                </p>
                <div className="space-y-1">
                  <label htmlFor="form-ai-note" className="text-xs font-semibold text-gray-700 dark:text-dk-text block">
                    {panel === 'suggest' ? t('forms.editorPage.ai.tools.suggest.noteLabel') : t('forms.editorPage.ai.tools.rewrite.noteLabel')}
                  </label>
                  <input
                    id="form-ai-note"
                    type="text"
                    value={note}
                    maxLength={MAX_NOTE_LENGTH}
                    disabled={busy}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={panel === 'suggest' ? t('forms.editorPage.ai.tools.suggest.notePlaceholder') : t('forms.editorPage.ai.tools.rewrite.notePlaceholder')}
                    className="input text-sm w-full disabled:opacity-60"
                  />
                </div>
              </>
            )}

            {error && (
              <p role="alert" data-testid="form-ai-tools-error" className="text-xs text-red-600 dark:text-red-400 p-2.5 bg-red-50 dark:bg-red-950/40 rounded-xl">
                {error}
              </p>
            )}

            {suggestions && (
              <div className="space-y-2" data-testid="form-ai-suggestions">
                <p className="text-xs font-semibold text-gray-800 dark:text-dk-text">
                  {t('forms.editorPage.ai.tools.suggest.resultTitle', { count: suggestions.length })}
                </p>
                <ul className="space-y-1.5">
                  {suggestions.map((s, i) => {
                    const optionsText = Array.isArray(s.options) && s.options.length > 0 ? s.options.join(' · ') : '';
                    return (
                      <li key={`${s.label}-${i}`}>
                        <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-violet-200/80 dark:border-violet-900/50 bg-white dark:bg-dk-surface cursor-pointer min-w-0">
                          <input
                            type="checkbox"
                            checked={selected.has(i)}
                            onChange={() => toggleSelected(i)}
                            aria-label={s.label}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-dk-border text-violet-600 focus:ring-violet-500 shrink-0"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-gray-900 dark:text-dk-text break-words">{s.label}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300">
                                {t(`forms.types.${s.type}`)}
                              </span>
                              {s.required && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                                  {t('forms.editorPage.ai.tools.suggest.required')}
                                </span>
                              )}
                            </span>
                            {optionsText && (
                              <span className="block mt-1 text-[11px] text-gray-500 dark:text-dk-text2 break-words">
                                {t('forms.editorPage.ai.tools.suggest.optionsLabel', { options: optionsText })}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {selectedCount > remaining && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {t('forms.editorPage.ai.tools.suggest.capacityNote', { count: remaining })}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-[11px] text-gray-500 dark:text-dk-text2">
                {busy ? t('forms.editorPage.ai.tools.working') : t('forms.editorPage.ai.creditNote')}
              </span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => togglePanel(panel)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-dk-text2 hover:bg-white/70 dark:hover:bg-dk-strong transition disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-1">
                    <HiOutlineX className="w-3.5 h-3.5" />
                    {t('forms.editorPage.ai.tools.close')}
                  </span>
                </button>
                {suggestions ? (
                  <>
                    <button
                      type="button"
                      data-testid="form-ai-suggest-again"
                      disabled={busy}
                      onClick={runSuggest}
                      className={`${toolButton} bg-white dark:bg-dk-raised border-violet-200 dark:border-violet-800/60 text-violet-700 dark:text-violet-300 hover:bg-violet-100/70 dark:hover:bg-dk-strong`}
                    >
                      {busy ? t('forms.editorPage.ai.tools.suggest.running') : t('forms.editorPage.ai.tools.suggest.again')}
                    </button>
                    <button
                      type="button"
                      data-testid="form-ai-suggest-add"
                      disabled={busy || addCount === 0}
                      onClick={addSelected}
                      className={`${toolButton} border-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700`}
                    >
                      {t('forms.editorPage.ai.tools.suggest.add', { count: addCount })}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    data-testid={panel === 'suggest' ? 'form-ai-suggest-run' : 'form-ai-rewrite-run'}
                    disabled={busy}
                    onClick={panel === 'suggest' ? runSuggest : runRewrite}
                    className={`${toolButton} border-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700`}
                  >
                    {busy ? (
                      <>
                        <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/40 border-t-white" aria-hidden="true" />
                        {panel === 'suggest' ? t('forms.editorPage.ai.tools.suggest.running') : t('forms.editorPage.ai.tools.rewrite.running')}
                      </>
                    ) : panel === 'suggest' ? (
                      t('forms.editorPage.ai.tools.suggest.run')
                    ) : (
                      t('forms.editorPage.ai.tools.rewrite.run')
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

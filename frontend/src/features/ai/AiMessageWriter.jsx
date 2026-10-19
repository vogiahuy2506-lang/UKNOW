import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { HiOutlineSparkles, HiOutlineX, HiOutlineReply } from 'react-icons/hi';
import aiApi from '../../services/aiApi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';

const MAX_INSTRUCTION_LENGTH = 500;
const QUICK_ACTIONS = [
  ['shorter', 'quickShorter'],
  ['friendlier', 'quickFriendlier'],
  ['formal', 'quickFormal'],
  ['fix_spelling', 'quickFixSpelling'],
  ['add_cta', 'quickAddCta'],
];

/** Khoá quyền cần có để dùng "Viết bằng AI" — khớp `requireWriteMessagePermission` ở backend. */
function permissionKeyFor({ context, channel }) {
  if (context === 'campaign') return 'campaigns_create';
  return channel === 'email' ? 'email_templates' : 'zalo_templates';
}

const INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text dark:placeholder:text-dk-muted';

/** Hiển thị một bản (email HTML trong khung cách ly, còn lại là chữ). */
function VersionView({ html, text, testId }) {
  if (html) {
    return (
      <iframe
        title={testId}
        data-testid={testId}
        sandbox=""
        srcDoc={html}
        className="h-64 w-full rounded-lg border border-slate-200 bg-white dark:border-dk-border"
      />
    );
  }
  return (
    <pre
      data-testid={testId}
      className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text"
    >
      {text}
    </pre>
  );
}

/**
 * Nút + bảng "Viết bằng AI" dùng chung cho ô soạn mẫu tin và mục Nội dung của chiến dịch (PLAN_AI_VIET_MAU_TIN_2026-10-19.md).
 * Ô soạn trống → viết mới; có chữ → sửa TRÊN bản đang có. Luôn xem trước rồi mới áp; áp xong có Hoàn tác một cấp.
 *
 * @param {object} props
 * @param {'email'|'zalo'|'telegram'|'whatsapp'} props.channel
 * @param {'template'|'campaign'} [props.context]
 * @param {'html'|'text'} [props.format] định dạng ô soạn (email HTML hay chữ thuần)
 * @param {string} [props.subject] tiêu đề hiện tại (chỉ email)
 * @param {string} props.body nội dung hiện tại
 * @param {(next: {subject?: string, body: string}) => void} props.onApply thay nội dung ô soạn (cũng dùng cho Hoàn tác)
 * @param {() => ({start: number, end: number}|null)} [props.getSelection] đoạn đang bôi đen trong ô soạn lúc bấm nút
 * @param {string} [props.testId]
 */
export default function AiMessageWriter({
  channel,
  context = 'template',
  format = 'text',
  subject = '',
  body = '',
  onApply,
  getSelection,
  testId = 'ai-message-writer',
}) {
  const { t, locale } = useI18n();
  const activeContext = useAuthStore((state) => state.activeContext);
  const isEmployee = activeContext?.type === 'employee';
  const allowed = !isEmployee || activeContext?.permissions?.[permissionKeyFor({ context, channel })] === true;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('create');
  const [instruction, setInstruction] = useState('');
  const [quickAction, setQuickAction] = useState(null);
  const [selection, setSelection] = useState(null); // { start, end, text }
  const [onlySelection, setOnlySelection] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { subject?, body, warnings, missingVariables }
  const [notice, setNotice] = useState(null); // { kind: 'refused'|'layout'|'error'|'credit', message }
  const [lastApplied, setLastApplied] = useState(null); // { before: {subject, body}, after: {subject, body} }
  // Cờ trong ref: state `busy` cập nhật sau lần render kế nên hai cú bấm sát nhau vẫn lọt hai lời gọi = trừ hai lượt.
  const inFlightRef = useRef(false);

  const isEmail = channel === 'email';
  const hasContent = String(body || '').trim().length > 0;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!allowed) return null;

  const openPanel = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const range = typeof getSelection === 'function' ? getSelection() : null;
    const text = range && range.end > range.start ? String(body).slice(range.start, range.end) : '';
    setSelection(text.trim() ? { start: range.start, end: range.end, text } : null);
    setOnlySelection(true);
    setMode(hasContent ? 'edit' : 'create');
    setResult(null);
    setNotice(null);
    setQuickAction(null);
    setOpen(true);
  };

  const write = async () => {
    if (inFlightRef.current) return;
    const trimmed = instruction.trim();
    if (mode === 'create' && !trimmed) {
      setNotice({ kind: 'error', message: t('aiMessageWriter.instructionRequired') });
      return;
    }
    if (mode === 'edit' && !trimmed && !quickAction) {
      setNotice({ kind: 'error', message: t('aiMessageWriter.editNeedsInput') });
      return;
    }
    const useSelection = mode === 'edit' && selection && onlySelection ? selection : null;
    const payload = {
      mode,
      channel,
      context,
      locale: locale === 'en' ? 'en' : 'vi',
      ...(trimmed ? { instruction: trimmed } : {}),
      current: mode === 'edit'
        ? { ...(isEmail ? { subject } : {}), body, format }
        : { format },
      ...(mode === 'edit' && quickAction ? { quickAction } : {}),
      ...(useSelection ? { selection: useSelection.text } : {}),
    };
    inFlightRef.current = true;
    setBusy(true);
    setNotice(null);
    setResult(null);
    try {
      const res = await aiApi.writeMessage(payload);
      const data = res?.data || {};
      if (data.refused) {
        setNotice({ kind: data.refusedCategory === 'unsafe' ? 'unsafe' : 'refused', message: data.message || t('aiMessageWriter.refusedTitle') });
      } else if (!data.body) {
        setNotice({ kind: 'error', message: t('aiMessageWriter.failed') });
      } else {
        setResult({
          subject: data.subject,
          body: data.body,
          warnings: data.warnings || [],
          missingVariables: data.missingVariables || [],
          selection: useSelection,
          mode,
        });
      }
    } catch (error) {
      const status = error?.response?.status;
      const data = error?.response?.data || {};
      if (status === 402 || data.code === 'RESOURCE_LIMIT_EXCEEDED') {
        setNotice({ kind: 'credit', message: data.message || t('aiMessageWriter.outOfCredit') });
      } else if (data.code === 'layout_changed') {
        setNotice({ kind: 'layout', message: data.message });
      } else {
        setNotice({ kind: 'error', message: data.message || t('aiMessageWriter.failed') });
      }
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  const apply = () => {
    if (!result) return;
    let nextBody = result.body;
    if (result.selection) {
      // Đoạn bôi đen có thể đã dịch chỗ nếu người dùng gõ tiếp khi bảng mở: tìm lại theo nội dung, không tin vị trí cũ.
      const { start, end, text } = result.selection;
      let from = start;
      if (String(body).slice(start, end) !== text) {
        from = String(body).indexOf(text);
        if (from < 0) {
          toast.error(t('aiMessageWriter.selectionChanged'));
          return;
        }
      }
      nextBody = String(body).slice(0, from) + result.body + String(body).slice(from + text.length);
    }
    const next = { body: nextBody, ...(isEmail && result.subject && !result.selection ? { subject: result.subject } : {}) };
    setLastApplied({
      before: { subject, body },
      after: { subject: next.subject ?? subject, body: next.body },
    });
    onApply?.(next);
    setResult(null);
    setInstruction('');
    setOpen(false);
    toast.success(t('aiMessageWriter.applied'));
  };

  const undo = () => {
    if (!lastApplied) return;
    onApply?.({ body: lastApplied.before.body, ...(isEmail ? { subject: lastApplied.before.subject } : {}) });
    setLastApplied(null);
    toast.success(t('aiMessageWriter.undone'));
  };

  // Hoàn tác chỉ còn nghĩa khi nội dung vẫn đúng như lúc vừa áp; người dùng gõ tiếp thì thôi (không đè chữ mới của họ).
  const canUndo = Boolean(lastApplied) && lastApplied.after.body === body;

  const examples = isEmail
    ? ['exampleEmail1', 'exampleEmail2', 'exampleEmail3']
    : ['exampleMessage1', 'exampleMessage2', 'exampleMessage3'];
  const asHtml = format === 'html';
  const currentView = result?.selection ? result.selection.text : body;
  // Viết mới trên ô trống: không có "bản hiện tại" để đặt cạnh, chỉ hiện bản AI viết (rộng hơn, dễ đọc).
  const showOld = String(currentView || '').trim().length > 0;

  const panel = open && createPortal(
    <div
      role="dialog"
      aria-label={t('aiMessageWriter.panelTitle')}
      data-testid={`${testId}-panel`}
      className={`fixed inset-x-0 bottom-0 z-[10001] flex max-h-[88vh] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-dk-border dark:bg-dk-surface sm:inset-x-auto sm:bottom-6 sm:right-6 sm:rounded-2xl ${result && showOld ? 'sm:w-[660px]' : 'sm:w-[440px]'}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-dk-border">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-dk-text">
          <HiOutlineSparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          {t('aiMessageWriter.panelTitle')}
          <span className="text-xs font-normal text-slate-500 dark:text-dk-text2">
            · {mode === 'edit' ? t('aiMessageWriter.editHeading') : t('aiMessageWriter.createHeading')}
          </span>
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('aiMessageWriter.close')}
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-dk-text2 dark:hover:bg-dk-raised"
        >
          <HiOutlineX className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!result && (
          <>
            {mode === 'edit' && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('aiMessageWriter.editHeading')}>
                {QUICK_ACTIONS.map(([id, key]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={quickAction === id}
                    data-testid={`${testId}-quick-${id}`}
                    onClick={() => setQuickAction((current) => (current === id ? null : id))}
                    disabled={busy}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${quickAction === id ? 'border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-950/40 dark:text-violet-300' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised'}`}
                  >
                    {t(`aiMessageWriter.${key}`)}
                  </button>
                ))}
              </div>
            )}

            {mode === 'edit' && selection && (
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-dk-text">
                <input
                  type="checkbox"
                  checked={onlySelection}
                  onChange={(event) => setOnlySelection(event.target.checked)}
                  data-testid={`${testId}-only-selection`}
                />
                {t('aiMessageWriter.onlySelection', { n: selection.text.length })}
              </label>
            )}

            <div>
              <label htmlFor={`${testId}-instruction`} className="block text-xs font-semibold text-slate-800 dark:text-dk-text">
                {mode === 'edit' ? t('aiMessageWriter.editLabel') : t('aiMessageWriter.createLabel')}
              </label>
              <textarea
                id={`${testId}-instruction`}
                data-testid={`${testId}-instruction`}
                rows={3}
                maxLength={MAX_INSTRUCTION_LENGTH}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={mode === 'edit' ? t('aiMessageWriter.editPlaceholder') : t('aiMessageWriter.createPlaceholder')}
                disabled={busy}
                className={`mt-1 resize-y ${INPUT_CLASS}`}
              />
              <p className="mt-0.5 text-right text-[11px] text-slate-500 dark:text-dk-text2">
                {instruction.length}/{MAX_INSTRUCTION_LENGTH}
              </p>
            </div>

            {mode === 'create' && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-dk-text2">{t('aiMessageWriter.examplesLabel')}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {examples.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setInstruction(t(`aiMessageWriter.${key}`))}
                      disabled={busy}
                      data-testid={`${testId}-${key}`}
                      className="rounded-full border border-slate-200 px-3 py-1 text-left text-xs text-slate-700 hover:bg-slate-50 dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised"
                    >
                      {t(`aiMessageWriter.${key}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasContent && (
              mode === 'edit' ? (
                <button
                  type="button"
                  onClick={() => { setMode('create'); setQuickAction(null); setNotice(null); }}
                  disabled={busy}
                  data-testid={`${testId}-rewrite`}
                  className="text-xs font-medium text-violet-600 underline dark:text-violet-400"
                >
                  {t('aiMessageWriter.rewriteFromScratch')}
                </button>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-amber-700 dark:text-amber-300" data-testid={`${testId}-rewrite-warning`}>{t('aiMessageWriter.rewriteWarning')}</p>
                  <button
                    type="button"
                    onClick={() => { setMode('edit'); setNotice(null); }}
                    disabled={busy}
                    className="text-xs font-medium text-violet-600 underline dark:text-violet-400"
                  >
                    {t('aiMessageWriter.backToEdit')}
                  </button>
                </div>
              )
            )}
          </>
        )}

        {notice && (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            data-testid={`${testId}-notice-${notice.kind}`}
            className={notice.kind === 'error'
              ? 'rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
              : notice.kind === 'unsafe'
                ? 'rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200'
                : 'rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200'}
          >
            {notice.kind === 'unsafe' && <p className="mb-0.5 font-semibold">{t('aiMessageWriter.unsafeTitle')}</p>}
            {notice.kind === 'refused' && <p className="mb-0.5 font-semibold">{t('aiMessageWriter.refusedTitle')}</p>}
            {notice.kind === 'layout' && <p className="mb-0.5 font-semibold">{t('aiMessageWriter.layoutChangedTitle')}</p>}
            <p>{notice.message}</p>
            {notice.kind === 'credit' && (
              <a href="/pricing" target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-orange-600 underline dark:text-orange-400">
                {t('aiMessageWriter.upgrade')}
              </a>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-2" data-testid={`${testId}-result`}>
            <p className="text-xs font-semibold text-slate-800 dark:text-dk-text">{t('aiMessageWriter.resultTitle')}</p>
            {result.selection && <p className="text-[11px] text-slate-500 dark:text-dk-text2">{t('aiMessageWriter.selectionNote')}</p>}
            {isEmail && result.subject && !result.selection && (
              <p className="text-xs text-slate-800 dark:text-dk-text">
                <span className="font-semibold">{t('aiMessageWriter.subjectLabel')}: </span>
                <span data-testid={`${testId}-result-subject`}>{result.subject}</span>
              </p>
            )}
            <div className={`grid grid-cols-1 gap-2 ${showOld ? 'sm:grid-cols-2' : ''}`}>
              {showOld && (
                <div className="min-w-0">
                  <p className="mb-1 text-[11px] font-semibold text-slate-500 dark:text-dk-text2">{t('aiMessageWriter.currentVersion')}</p>
                  <VersionView html={asHtml ? currentView : null} text={currentView} testId={`${testId}-old`} />
                </div>
              )}
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-semibold text-slate-500 dark:text-dk-text2">{t('aiMessageWriter.newVersion')}</p>
                <VersionView html={asHtml ? result.body : null} text={result.body} testId={`${testId}-new`} />
              </div>
            </div>
            {result.warnings.includes('missing_variables') && (
              <p role="alert" data-testid={`${testId}-missing-variables`} className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                {t('aiMessageWriter.missingVariables', { list: result.missingVariables.map((name) => `{{${name}}}`).join(', ') })}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-200 px-4 py-3 dark:border-dk-border">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {result ? (
            <>
              <button type="button" onClick={() => setResult(null)} data-testid={`${testId}-discard`} className="rounded-lg px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:text-dk-text dark:hover:bg-dk-raised">
                {t('aiMessageWriter.discard')}
              </button>
              <button type="button" onClick={write} disabled={busy} data-testid={`${testId}-retry`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised">
                {busy ? t('aiMessageWriter.writing') : t('aiMessageWriter.retry')}
              </button>
              <button type="button" onClick={apply} disabled={busy} data-testid={`${testId}-apply`} className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-50">
                {t('aiMessageWriter.apply')}
              </button>
            </>
          ) : (
            <button type="button" onClick={write} disabled={busy} data-testid={`${testId}-write`} className="rounded-lg bg-primary-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-600 disabled:opacity-50">
              {busy ? t('aiMessageWriter.writing') : t('aiMessageWriter.write')}
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-dk-text2">{t('aiMessageWriter.creditNote')}</p>
      </div>
    </div>,
    document.body,
  );

  return (
    <>
      <button
        type="button"
        // Giữ nguyên vùng bôi đen trong ô soạn khi bấm nút.
        onMouseDown={(event) => event.preventDefault()}
        onClick={openPanel}
        aria-expanded={open}
        title={t('aiMessageWriter.buttonTitle')}
        data-testid={`${testId}-button`}
        className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 transition-all hover:bg-violet-100 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40"
      >
        <HiOutlineSparkles className="h-4 w-4" aria-hidden="true" />
        {t('aiMessageWriter.button')}
      </button>
      {canUndo && (
        <button
          type="button"
          onClick={undo}
          title={t('aiMessageWriter.undoTitle')}
          data-testid={`${testId}-undo`}
          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-dk-border dark:bg-dk-raised dark:text-dk-text dark:hover:bg-dk-strong"
        >
          <HiOutlineReply className="h-4 w-4" aria-hidden="true" />
          {t('aiMessageWriter.undo')}
        </button>
      )}
      {panel}
    </>
  );
}

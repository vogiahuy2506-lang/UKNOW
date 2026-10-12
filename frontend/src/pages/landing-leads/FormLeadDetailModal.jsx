import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { HiOutlineExternalLink, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import LandingLeadConsentBadge from '../../features/landing/components/LandingLeadConsentBadge.jsx';
import { buildAnswerEntries } from '../../features/forms/utils/formLeads.util.js';
import FormAnswerFiles from '../../features/forms/components/FormAnswerFiles.jsx';
import FormLeadStatusBadge from './FormLeadStatusBadge.jsx';

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function formatSubmittedAt(raw) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', { timeZone: VIETNAM_TIME_ZONE, hourCycle: 'h23' });
}

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 px-6 py-3.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-dk-text2 sm:pt-0.5">{label}</dt>
      <dd className="sm:col-span-2 min-w-0 text-sm text-slate-900 dark:text-dk-text break-words">{children}</dd>
    </div>
  );
}

/**
 * Modal chi tiết một bài nộp biểu mẫu: hiện ĐỦ thông tin người nộp, nguồn, trạng thái và toàn bộ câu trả
 * lời theo NHÃN trường (bảng chỉ có một dòng gọn). Thao tác tiền / huỷ lượt đặt vẫn ở trang bài nộp của
 * từng biểu mẫu — nút "Mở trong biểu mẫu" dẫn sang đó.
 *
 * @param {object} props
 * @param {object|null} props.submission dòng từ `GET /api/forms/submissions` (null = đóng)
 * @param {Array<{ key?: string, label?: string, type?: string }>} [props.formFields] trường của biểu mẫu (tra nhãn / thứ tự / loại)
 * @param {() => void} props.onClose
 */
export default function FormLeadDetailModal({ submission, formFields = [], onClose }) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  // onClose do trang cha truyền có thể là hàm viết thẳng trong JSX → giữ qua ref để effect không chạy lại
  // mỗi lần cha vẽ lại (kéo focus về đầu hộp thoại giữa lúc người dùng đang đọc).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!submission) return undefined;
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [submission]);

  const answerEntries = useMemo(
    () => buildAnswerEntries(submission?.answers, formFields, t),
    [submission?.answers, formFields, t]
  );

  if (!submission) return null;

  const publicUrl = submission.landingPageSlug ? `${window.location.origin}/${submission.landingPageSlug}` : null;
  const submittedAt = formatSubmittedAt(submission.createdAt);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-lead-detail-title"
      data-testid="form-lead-detail-modal"
    >
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => onCloseRef.current()} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative z-10 w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-dk-surface border border-slate-200/90 dark:border-dk-border shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50/80 dark:bg-dk-raised/60">
          <h3 id="form-lead-detail-title" className="min-w-0 text-base font-bold text-slate-900 dark:text-dk-text truncate">
            {t('landingLeads.formsTab.detailTitle')}
          </h3>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="rounded-xl p-2 text-slate-400 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-raised transition-colors"
            aria-label={t('common.close')}
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Thông tin người nộp + nguồn */}
        <dl className="divide-y divide-slate-100 dark:divide-dk-border">
          <DetailRow label={t('landingLeads.fullName')}>
            {submission.respondentName || <span className="italic text-slate-400 dark:text-dk-muted">{t('landingLeads.formsTab.notProvided')}</span>}
          </DetailRow>
          <DetailRow label={t('landingLeads.email')}>
            {submission.respondentEmail ? <span className="break-all">{submission.respondentEmail}</span> : '—'}
          </DetailRow>
          <DetailRow label={t('landingLeads.phone')}>{submission.respondentPhone || '—'}</DetailRow>
          <DetailRow label={t('landingLeads.formsTab.colForm')}>{submission.formTitle || '—'}</DetailRow>
          <DetailRow label={t('landingLeads.formsTab.colSource')}>
            {publicUrl ? (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:underline break-all"
              >
                /{submission.landingPageSlug}
                <HiOutlineExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            ) : (
              '—'
            )}
            {submission.utmSource ? (
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-dk-text2">
                {t('landingLeads.formsTab.utmSource', { source: submission.utmSource })}
              </span>
            ) : null}
          </DetailRow>
          <DetailRow label={t('landingLeads.formsTab.colStatus')}>
            <FormLeadStatusBadge submission={submission} />
          </DetailRow>
          <DetailRow label={t('forms.submissionsPage.colConsent')}>
            <LandingLeadConsentBadge row={submission} />
          </DetailRow>
          <DetailRow label={t('landingLeads.formsTab.submittedAt')}>{submittedAt || '—'}</DetailRow>
        </dl>

        {/* Toàn bộ câu trả lời, theo nhãn trường */}
        <div className="border-t border-slate-100 dark:border-dk-border px-6 py-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-dk-text2">
            {t('landingLeads.formsTab.answers')}
          </h4>
          {answerEntries.length > 0 ? (
            <ul className="mt-3 space-y-2" data-testid="form-lead-answer-list">
              {answerEntries.map((entry) => (
                <li key={entry.key} className="text-sm text-slate-900 dark:text-dk-text break-words whitespace-pre-line">
                  <span className="font-semibold text-slate-600 dark:text-dk-text2">{entry.label}:</span>{' '}
                  {entry.type === 'file' ? (
                    <FormAnswerFiles
                      formId={submission.formId}
                      submissionId={submission.id}
                      fieldKey={entry.key}
                      files={entry.files}
                      fileStatus={entry.fileStatus}
                    />
                  ) : (
                    <span>{entry.value || '—'}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm italic text-slate-400 dark:text-dk-muted">{t('landingLeads.formsTab.noAnswers')}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-dk-border bg-slate-50/80 dark:bg-dk-raised/60">
          <Link
            to={`/app/forms/${submission.formId}/submissions`}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 hover:bg-orange-100 dark:hover:bg-orange-950/50 rounded-xl transition-colors"
          >
            {t('landingLeads.formsTab.openInForm')}
            <HiOutlineExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-dk-text bg-white dark:bg-dk-inset border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-raised rounded-xl transition-colors shadow-2xs"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

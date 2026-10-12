import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineDownload, HiOutlinePaperClip } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { useAuthStore } from '../../../stores/authStore';
import { fetchSubmissionFileLink } from '../services/formAdminApi.service';
import { formatFileSize } from '../utils/formFileKinds.util';

/**
 * Câu trả lời của trường `file` trong màn bài nộp (`FormSubmissionsPage`) và modal chi tiết khách (`FormLeadDetailModal`) — PR-4b:
 * tên tệp + cỡ + nút "Tải về" cho từng tệp; nếu khách đã đính kèm mà hệ thống chưa nhận được (chủ hết dung lượng / kho lỗi) thì hiện
 * câu giải thích (kèm link mua thêm dung lượng cho CHỦ tài khoản — nhân viên không vào được trang đó).
 *
 * "Tải về": xin link NGẮN HẠN qua API có xác thực rồi mở bằng thẻ <a> để trình duyệt tự tải (tệp có thể tới 1 GB nên không kéo qua
 * axios/blob). Tệp luôn được phục vụ dạng attachment — không bao giờ mở inline trên tên miền của ta.
 *
 * @param {object} props
 * @param {number|string} props.formId
 * @param {number|string} props.submissionId
 * @param {string} props.fieldKey
 * @param {Array<{ name: string, size?: number }>} [props.files]
 * @param {'received'|'quota_exceeded'|'failed'|string} [props.fileStatus]
 */
export default function FormAnswerFiles({ formId, submissionId, fieldKey, files = [], fileStatus }) {
  const { t, locale } = useI18n();
  const activeContext = useAuthStore((state) => state.activeContext);
  const isEmployee = activeContext?.type === 'employee';
  const [busyIndex, setBusyIndex] = useState(null);

  const handleDownload = async (index) => {
    if (busyIndex !== null) return;
    setBusyIndex(index);
    try {
      const link = await fetchSubmissionFileLink(formId, submissionId, fieldKey, index);
      const anchor = document.createElement('a');
      anchor.href = link.url;
      anchor.rel = 'noopener';
      anchor.download = link.fileName || '';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      const code = error?.response?.data?.code;
      toast.error(
        code === 'FILE_NOT_FOUND' || code === 'SUBMISSION_NOT_FOUND'
          ? t('forms.submissionsPage.file.notFound')
          : t('forms.submissionsPage.file.downloadError')
      );
    } finally {
      setBusyIndex(null);
    }
  };

  const hasFiles = Array.isArray(files) && files.length > 0;
  const missingNote =
    fileStatus === 'quota_exceeded'
      ? t('forms.submissionsPage.file.quotaExceeded')
      : fileStatus === 'failed'
        ? t('forms.submissionsPage.file.failed')
        : '';

  return (
    <div className="space-y-1" data-testid={`answer-files-${fieldKey}`}>
      {hasFiles && (
        <ul className="space-y-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-2 min-w-0">
              <HiOutlinePaperClip className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-dk-muted" aria-hidden="true" />
              <span className="min-w-0 truncate text-slate-800 dark:text-dk-text" title={file.name}>
                {file.name}
              </span>
              {Number.isFinite(file.size) && (
                <span className="shrink-0 text-[11px] text-slate-500 dark:text-dk-text2">{formatFileSize(file.size, locale)}</span>
              )}
              <button
                type="button"
                onClick={() => handleDownload(index)}
                disabled={busyIndex !== null}
                aria-label={t('forms.submissionsPage.file.downloadAria', { name: file.name })}
                className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-dk-border px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-dk-text hover:bg-slate-50 dark:hover:bg-dk-raised disabled:opacity-50 transition-colors"
              >
                <HiOutlineDownload className="w-3 h-3" aria-hidden="true" />
                {busyIndex === index ? t('forms.submissionsPage.file.downloading') : t('forms.submissionsPage.file.download')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {missingNote && (
        <p className="text-[11px] italic text-amber-700 dark:text-amber-300" data-testid={`answer-files-missing-${fieldKey}`}>
          {missingNote}
          {fileStatus === 'quota_exceeded' && !isEmployee && (
            <>
              {' '}
              <Link to="/app/topup" className="font-semibold underline not-italic">
                {t('forms.submissionsPage.file.buyStorage')}
              </Link>
            </>
          )}
        </p>
      )}
      {!hasFiles && !missingNote && <span className="text-slate-400 dark:text-dk-muted">—</span>}
    </div>
  );
}

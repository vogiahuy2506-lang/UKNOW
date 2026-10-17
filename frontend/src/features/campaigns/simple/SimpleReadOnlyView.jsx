import { HiOutlineEye, HiOutlineViewGrid } from 'react-icons/hi';
import { buildReviewSummary } from './simpleCampaign.summary';

/** Ghép chuỗi có `**in đậm**` thành phần tử — không dùng dangerouslySetInnerHTML vì có tên do người dùng đặt. */
function RichSummary({ text }) {
  return (
    <>
      {String(text).split('**').map((part, index) => (
        index % 2 === 1
          ? <strong key={index} className="font-bold text-slate-900 dark:text-dk-text">{part}</strong>
          : <span key={index}>{part}</span>
      ))}
    </>
  );
}

/**
 * Tab Từng bước khi KHÔNG sửa được ở đây (`editable:false`, đang chạy, hoặc thiếu quyền dựng chiến dịch): chỉ xem.
 * Có câu tóm tắt (nếu đọc ngược được), lý do bằng lời thường, và MỘT nút lớn sang Sơ đồ khối. Không có nút lưu.
 *
 * @param {object} props
 * @param {object} props.wizard kết quả `useSimpleCampaignWizard` ở chế độ sửa
 * @param {boolean} props.canOpenBuilder có quyền mở Sơ đồ khối để sửa
 * @param {() => void} props.onOpenBuilder
 * @param {(key: string, params?: object) => string} props.t
 * @param {string} props.locale
 */
export default function SimpleReadOnlyView({ wizard, canOpenBuilder, onOpenBuilder, t, locale }) {
  const { state, editInfo } = wizard;
  const reasons = (editInfo?.reasons || []).filter((reason) => String(reason?.message || '').trim());
  const summary = editInfo?.hasForm && state.channel ? buildReviewSummary({ state, preview: null, t, locale, manualWhen: true }) : '';
  const followUps = Array.isArray(state.followUps) ? state.followUps.length : 0;

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-dk-border dark:bg-dk-surface sm:p-6" data-testid="simple-readonly">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-dk-raised dark:text-dk-text2" aria-hidden="true">
          <HiOutlineEye className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text sm:text-2xl">{t('simpleCampaign.edit.readOnly.title')}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-dk-text2">
            {canOpenBuilder ? t('simpleCampaign.edit.readOnly.hint') : t('simpleCampaign.edit.readOnly.noPermission')}
          </p>
        </div>
      </div>

      {editInfo?.running && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200" role="status" data-testid="simple-readonly-running">
          {t('simpleCampaign.edit.readOnly.running')}
        </p>
      )}

      {summary && (
        <p className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4 text-base leading-relaxed text-slate-700 dark:border-orange-500/30 dark:bg-orange-950/30 dark:text-dk-text" data-testid="simple-readonly-summary">
          <RichSummary text={summary} />
          {followUps > 0 && <span> {t('simpleCampaign.edit.readOnly.followUps', { count: followUps + 1 })}</span>}
        </p>
      )}

      {reasons.length > 0 && (
        <div data-testid="simple-readonly-reasons">
          <p className="text-sm font-semibold text-slate-800 dark:text-dk-text">{t('simpleCampaign.edit.readOnly.reasonsTitle')}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-dk-text2">
            {reasons.map((reason, index) => <li key={reason.code || index}>{reason.message}</li>)}
          </ul>
        </div>
      )}

      {canOpenBuilder && (
        <button
          type="button"
          onClick={onOpenBuilder}
          data-testid="simple-readonly-open-builder"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3.5 text-base font-bold text-white shadow-md shadow-orange-500/20 hover:from-orange-600 hover:to-amber-600 sm:w-auto"
        >
          <HiOutlineViewGrid className="h-5 w-5" aria-hidden="true" />
          {t('simpleCampaign.edit.readOnly.openBuilder')}
        </button>
      )}
    </div>
  );
}

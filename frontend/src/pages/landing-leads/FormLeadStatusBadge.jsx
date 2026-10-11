import { useI18n } from '../../i18n';
import { getSubmissionDisplayStatus } from '../../features/forms/utils/formLeads.util.js';

const STATUS_CLASSES = {
  submitted:
    'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50',
  confirmed:
    'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900/50',
  pending_payment:
    'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50',
  hold_expired:
    'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50',
  cancelled: 'bg-slate-100 dark:bg-dk-raised text-slate-600 dark:text-dk-text border-slate-200 dark:border-dk-border',
};

/**
 * Huy hiệu trạng thái bài nộp ở tab "Từ biểu mẫu": đã nhận · đã xác nhận · chờ thanh toán · hết hạn thanh
 * toán · đã huỷ. Dùng chung cho ô trong bảng và modal chi tiết (hai nơi phải hiện cùng một trạng thái).
 *
 * @param {{ submission: { status?: string, holdExpiresAt?: string|null } }} props
 */
export default function FormLeadStatusBadge({ submission }) {
  const { t } = useI18n();
  const displayStatus = getSubmissionDisplayStatus(submission);
  const className = STATUS_CLASSES[displayStatus] || STATUS_CLASSES.submitted;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}
      data-testid="form-lead-status"
      data-status={displayStatus}
    >
      {t(`landingLeads.formsTab.status.${displayStatus}`)}
    </span>
  );
}

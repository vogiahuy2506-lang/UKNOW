import { useI18n } from '../../../i18n';

/**
 * Huy hiệu "Đồng ý tiếp thị" của một lead: Đã rút · Có · Không · chưa hỏi (—).
 * Dùng chung cho ô trong bảng /app/landing-leads và modal chi tiết khách — hai nơi phải hiện
 * cùng một trạng thái (khách đã rút đồng ý thì không được hiện "Có" ở modal).
 *
 * @param {{ row: { consentWithdrawnAt?: string|null, marketingConsent?: boolean|null } }} props
 */
export default function LandingLeadConsentBadge({ row }) {
  const { t } = useI18n();

  if (row.consentWithdrawnAt) {
    return (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-900/50 shadow-2xs"
        title={new Date(row.consentWithdrawnAt).toLocaleString('vi-VN')}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {t('forms.submissionsPage.consentWithdrawn', {
          date: new Date(row.consentWithdrawnAt).toLocaleDateString('vi-VN'),
        })}
      </span>
    );
  }
  if (row.marketingConsent === true) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-900/50 shadow-2xs">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {t('forms.submissionsPage.consentYes')}
      </span>
    );
  }
  if (row.marketingConsent === false) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-dk-raised text-slate-600 dark:text-dk-text border border-slate-200 dark:border-dk-border shadow-2xs">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-dk-strong" />
        {t('forms.submissionsPage.consentNo')}
      </span>
    );
  }
  return (
    <span className="text-slate-400 dark:text-dk-muted font-medium">
      {t('forms.submissionsPage.consentNone')}
    </span>
  );
}

import toast from 'react-hot-toast';
import Notice from '../../../components/common/Notice';
import { useI18n } from '../../../i18n';
import {
  useNotificationPreferencesQuery,
  useUpdateNotificationPreference,
} from '../../../hooks/queries/useNotificationsQuery';

/** Mã lỗi `PUT /notifications/preferences` (backend PR-1) → câu theo ngôn ngữ; mã lạ → câu chung. */
function preferenceErrorMessage(error, t) {
  switch (error?.response?.data?.code) {
    case 'NOTIFICATION_EMAIL_LOCKED':
      return t('notifications.preferences.emailLocked');
    case 'NOTIFICATION_EMAIL_DISABLED_BY_SYSTEM':
      return t('notifications.preferences.emailOffBySystem');
    default:
      return t('notifications.preferences.saveFailed');
  }
}

function EmailSwitch({ checked, disabled, label, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 ${
        checked ? 'bg-orange-500' : 'bg-slate-300 dark:bg-dk-border-strong'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/**
 * Nội dung bảng "Tuỳ chọn thông báo" (dùng chung cho tab trong NotificationsPage và trang riêng NotificationPreferencesPage).
 */
export default function NotificationPreferencesContent() {
  const { t, locale } = useI18n();
  const query = useNotificationPreferencesQuery();
  const update = useUpdateNotificationPreference();

  const rows = query.data || [];

  const handleToggle = (row) => {
    update.mutate(
      { eventType: row.eventType, emailEnabled: !row.emailEnabled },
      { onError: (error) => toast.error(preferenceErrorMessage(error, t)) }
    );
  };

  return (
    <div className="space-y-4">
      {query.isError && !query.data && (
        <Notice
          variant="danger"
          title={t('notifications.preferences.loadFailed')}
          action={
            <button
              type="button"
              onClick={() => query.refetch()}
              className="text-sm font-medium text-red-700 dark:text-red-300 hover:underline"
            >
              {t('notifications.retry')}
            </button>
          }
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
        <div className="overflow-x-auto">
          <table className="w-full sm:min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-raised text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-dk-text2">
              <tr>
                <th scope="col" className="px-3 sm:px-4 py-3">{t('notifications.preferences.columnEvent')}</th>
                <th scope="col" className="w-24 sm:w-36 px-3 sm:px-4 py-3">{t('notifications.preferences.columnBell')}</th>
                <th scope="col" className="w-[4.5rem] sm:w-36 px-3 sm:px-4 py-3">{t('notifications.preferences.columnEmail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
              {query.isPending && query.fetchStatus !== 'idle' && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400 dark:text-dk-muted">{t('notifications.loading')}</td>
                </tr>
              )}
              {rows.map((row) => {
                const label = (locale === 'en' && row.labelEn) || row.label;
                const offBySystem = row.systemEmailEnabled === false;
                const locked = offBySystem || !row.userCanDisableEmail;
                const saving = update.isPending && update.variables?.eventType === row.eventType;
                return (
                  <tr key={row.eventType} data-testid={`preference-row-${row.eventType}`}>
                    <td className="px-3 sm:px-4 py-3.5 align-top">
                      <p className="font-medium text-slate-900 dark:text-dk-text">{label}</p>
                      {row.description && <p className="mt-0.5 text-xs text-slate-500 dark:text-dk-text2">{row.description}</p>}
                      {locked && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          {offBySystem ? t('notifications.preferences.emailOffBySystem') : t('notifications.preferences.emailLocked')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-3.5 align-top">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          row.inAppEnabled ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-dk-raised text-slate-500 dark:text-dk-text2'
                        }`}
                      >
                        {row.inAppEnabled ? t('notifications.preferences.bellAlwaysOn') : t('notifications.preferences.bellOffBySystem')}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-3.5 align-top">
                      <EmailSwitch
                        checked={Boolean(row.emailEnabled)}
                        disabled={locked || saving}
                        label={t('notifications.preferences.emailToggleLabel', { event: label })}
                        onToggle={() => handleToggle(row)}
                      />
                    </td>
                  </tr>
                );
              })}
              {!query.isPending && !query.isError && rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400 dark:text-dk-muted">{t('notifications.preferences.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

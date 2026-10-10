import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineBell } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import Notice from '../../components/common/Notice';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import {
  useNotificationPreferencesQuery,
  useUpdateNotificationPreference,
} from '../../hooks/queries/useNotificationsQuery';
import { notificationsPagePath } from '../../features/notifications/utils/notificationPaths';

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
        checked ? 'bg-orange-500' : 'bg-slate-300'
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
 * Trang "Tuỳ chọn thông báo" (`/app/settings/notifications`, admin: `/admin/settings/notifications`).
 *
 * Chuông luôn bật (người dùng không tắt được). Email: công tắc chỉ BẤM ĐƯỢC khi loại đó cho phép tắt
 * (`userCanDisableEmail`) VÀ quản trị viên chưa tắt email của loại đó (`systemEmailEnabled`); còn lại công tắc bị
 * khoá kèm chú thích lý do. Không bọc OwnerRoute / PermissionRoute.
 */
export default function NotificationPreferencesPage() {
  const { t, locale } = useI18n();
  const { user } = useAuthStore();
  const navigate = useNavigate();
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
    <PageContainer
      icon={HiOutlineBell}
      title={t('notifications.preferences.title')}
      subtitle={t('notifications.preferences.subtitle')}
      onBack={() => navigate(notificationsPagePath(user))}
      backLabel={t('notifications.title')}
    >
      {query.isError && !query.data && (
        <Notice
          variant="danger"
          title={t('notifications.preferences.loadFailed')}
          action={
            <button type="button" onClick={() => query.refetch()} className="text-sm font-medium text-red-700 hover:underline">
              {t('notifications.retry')}
            </button>
          }
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">{t('notifications.preferences.columnEvent')}</th>
                <th scope="col" className="w-36 px-4 py-3">{t('notifications.preferences.columnBell')}</th>
                <th scope="col" className="w-36 px-4 py-3">{t('notifications.preferences.columnEmail')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.isPending && query.fetchStatus !== 'idle' && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400">{t('notifications.loading')}</td>
                </tr>
              )}
              {rows.map((row) => {
                const label = (locale === 'en' && row.labelEn) || row.label;
                const offBySystem = row.systemEmailEnabled === false;
                const locked = offBySystem || !row.userCanDisableEmail;
                const saving = update.isPending && update.variables?.eventType === row.eventType;
                return (
                  <tr key={row.eventType} data-testid={`preference-row-${row.eventType}`}>
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-medium text-slate-900">{label}</p>
                      {row.description && <p className="mt-0.5 text-xs text-slate-500">{row.description}</p>}
                      {locked && (
                        <p className="mt-1 text-xs text-amber-700">
                          {offBySystem ? t('notifications.preferences.emailOffBySystem') : t('notifications.preferences.emailLocked')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          row.inAppEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {row.inAppEnabled ? t('notifications.preferences.bellAlwaysOn') : t('notifications.preferences.bellOffBySystem')}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 align-top">
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
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400">{t('notifications.preferences.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}

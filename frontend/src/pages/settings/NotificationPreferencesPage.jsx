import { useNavigate } from 'react-router-dom';
import { HiOutlineBell } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { notificationsPagePath } from '../../features/notifications/utils/notificationPaths';
import NotificationPreferencesContent from '../../features/notifications/components/NotificationPreferencesContent';

/**
 * Trang "Tuỳ chọn thông báo" (`/app/settings/notifications`, admin: `/admin/settings/notifications`).
 *
 * Chuông luôn bật (người dùng không tắt được). Email: công tắc chỉ BẤM ĐƯỢC khi loại đó cho phép tắt
 * (`userCanDisableEmail`) VÀ quản trị viên chưa tắt email của loại đó (`systemEmailEnabled`); còn lại công tắc bị
 * khoá kèm chú thích lý do. Không bọc OwnerRoute / PermissionRoute.
 */
export default function NotificationPreferencesPage() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  return (
    <PageContainer
      icon={HiOutlineBell}
      title={t('notifications.preferences.title')}
      subtitle={t('notifications.preferences.subtitle')}
      onBack={() => navigate(notificationsPagePath(user))}
      backLabel={t('notifications.title')}
    >
      <NotificationPreferencesContent />
    </PageContainer>
  );
}


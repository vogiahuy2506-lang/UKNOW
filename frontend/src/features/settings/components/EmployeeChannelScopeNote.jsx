import { useI18n } from '../../../i18n';
import { useAuthStore } from '../../../stores/authStore';

/**
 * PLAN_GIAO_TK_TG_WA PR-H3 — dòng nhắc nhỏ ở trang cài đặt kênh Telegram / WhatsApp khi người xem là NHÂN VIÊN: chỉ tài khoản chủ
 * đã giao (hoặc do chính họ đăng nhập) mới hiện; danh sách trống không có nghĩa là chủ chưa kết nối. Chủ không thấy dòng này.
 */
export default function EmployeeChannelScopeNote({ className = 'mb-3 text-xs text-slate-500' }) {
  const { t } = useI18n();
  const isEmployeeContext = useAuthStore((state) => state.activeContext?.type) === 'employee';
  if (!isEmployeeContext) return null;
  return (
    <p role="note" className={className} data-testid="employee-channel-scope-note">
      {t('channelAccountScope.employeeNote')}
    </p>
  );
}

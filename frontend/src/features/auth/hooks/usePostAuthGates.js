import { useAuthStore } from '../../../stores/authStore';

/**
 * Hook quản lý trạng thái các cổng sau đăng nhập (PR-B).
 *
 * Thứ tự ưu tiên cổng:
 *   1. Đổi mật khẩu bắt buộc (`mustChangePassword`)
 *   2. Đồng ý điều khoản & xử lý dữ liệu NĐ 330 (`consentRequired`)
 *   3. Bổ sung / xác thực số điện thoại (`phoneRequired`)
 *
 * Vai trò & Ranh giới:
 *   - `role !== 'admin'`: khớp isSuperAdmin() backend (bypass admin khỏi cổng đồng ý & SĐT).
 *   - `phoneReminderDismissed`: lưu trong RAM authStore — KHÔNG lưu storage để "Để sau"
 *     chỉ tắt trong phiên xem hiện tại; đăng nhập lại hoặc user khác vào vẫn được nhắc.
 *   - `(phoneOtpEnabled && !user?.phoneVerifiedAt)`: có số rồi vẫn nhắc nếu OTP bật mà số chưa verify.
 */
export const usePostAuthGates = () => {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const phoneOtpEnabled = useAuthStore((s) => s.phoneOtpEnabled);
  const phoneReminderDismissed = useAuthStore((s) => s.phoneReminderDismissed);

  const mustChangePassword = Boolean(user?.mustChangePassword === true);

  const consentRequired = Boolean(
    isAuthenticated
    && !mustChangePassword
    && !user?.hasConsented
    && user?.role !== 'admin'
  );

  const phoneRequired = Boolean(
    isAuthenticated
    && !mustChangePassword
    && !consentRequired
    && (!user?.phone || (phoneOtpEnabled && !user?.phoneVerifiedAt))
    && user?.role !== 'admin'
    && !phoneReminderDismissed
  );

  const anyGateOpen = Boolean(mustChangePassword || consentRequired || phoneRequired);

  return {
    mustChangePassword,
    consentRequired,
    phoneRequired,
    anyGateOpen,
  };
};

export default usePostAuthGates;

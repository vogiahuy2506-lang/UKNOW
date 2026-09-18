import { useAuthStore } from '../../../stores/authStore';
import { isVietnamMobilePhone } from '../../../utils/phoneValidation';

/**
 * Helper kiểm tra xem người dùng đã từng bấm bỏ qua / xác nhận mã giới thiệu hay chưa.
 * Lưu trong localStorage theo userId để đảm bảo chỉ nhắc duy nhất 1 lần lúc mới đăng ký.
 */
export const isReferralPromptDismissed = (userId) => {
  if (!userId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(`referral_prompt_dismissed_${userId}`) === '1';
  } catch {
    return false;
  }
};

export const markReferralPromptDismissed = (userId) => {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`referral_prompt_dismissed_${userId}`, '1');
  } catch {
    // ignore
  }
};

/**
 * Hook quản lý trạng thái các cổng sau đăng nhập (PR-B).
 *
 * Thứ tự ưu tiên cổng:
 *   1. Đổi mật khẩu bắt buộc (`mustChangePassword`)
 *   2. Đồng ý điều khoản & xử lý dữ liệu NĐ 330 (`consentRequired`)
 *   3. Bổ sung / xác thực số điện thoại (`phoneRequired`)
 *   4. Nhập mã giới thiệu thành viên mới (`referralPromptRequired` - chỉ 1 lần duy nhất trong 24h đầu)
 *
 * Vai trò & Ranh giới:
 *   - `role !== 'admin'`: khớp isSuperAdmin() backend (bypass admin khỏi cổng đồng ý, SĐT & mã giới thiệu).
 *   - `phoneReminderDismissed`: lưu trong RAM authStore — KHÔNG lưu storage để "Để sau"
 *     chỉ tắt trong phiên xem hiện tại; đăng nhập lại hoặc user khác vào vẫn được nhắc.
 *   - `referralPromptDismissed`: lưu cả RAM và localStorage để không bao giờ hỏi lại sau khi bỏ qua.
 *   - `(phoneOtpEnabled && isVietnamMobilePhone(user?.phone) && !user?.phoneVerifiedAt)`:
 *     số bàn và số nước ngoài không nhận được SMS OTP nên chỉ đòi xác thực đối với số di động VN.
 */
export const usePostAuthGates = () => {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const phoneOtpEnabled = useAuthStore((s) => s.phoneOtpEnabled);
  const phoneReminderDismissed = useAuthStore((s) => s.phoneReminderDismissed);
  const referralPromptDismissed = useAuthStore((s) => s.referralPromptDismissed);

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
    && (!user?.phone || (phoneOtpEnabled && isVietnamMobilePhone(user?.phone) && !user?.phoneVerifiedAt))
    && user?.role !== 'admin'
    && !phoneReminderDismissed
  );

  const isWithin24Hours = Boolean(
    user?.createdAt && (Date.now() - new Date(user.createdAt).getTime() <= 24 * 60 * 60 * 1000)
  );

  const referralPromptRequired = Boolean(
    isAuthenticated
    && !mustChangePassword
    && !consentRequired
    && !phoneRequired
    && !user?.referredByUserId
    && user?.role !== 'admin'
    && isWithin24Hours
    && !referralPromptDismissed
    && !isReferralPromptDismissed(user?.id)
  );

  const anyGateOpen = Boolean(mustChangePassword || consentRequired || phoneRequired || referralPromptRequired);

  return {
    mustChangePassword,
    consentRequired,
    phoneRequired,
    referralPromptRequired,
    anyGateOpen,
  };
};

export default usePostAuthGates;


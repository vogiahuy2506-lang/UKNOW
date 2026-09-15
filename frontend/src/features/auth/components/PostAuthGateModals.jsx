/* eslint-disable react-refresh/only-export-components */
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import { usePostAuthGates } from '../hooks/usePostAuthGates';
import ChangePasswordModal from './ChangePasswordModal';
import PhoneRequiredModal from './PhoneRequiredModal';
import ConsentRequiredModal from './ConsentRequiredModal';

/**
 * Danh sách tiền tố đường dẫn được loại trừ khỏi cổng sau đăng nhập.
 *
 * Tiêu chí:
 *   - Trang xác thực: `/login`, `/register`, v.v. (tránh vòng lặp).
 *   - Trang văn bản pháp lý & chính sách: link trong modal mở tới các trang này (tab mới),
 *     modal đè lên sẽ ngăn người dùng đọc tài liệu.
 *   - Trang công khai cho khách của chủ shop: `/lp/`, `/embed/`, `/chat/`, `/f/`.
 */
export const GATE_EXCLUDED_PATH_PREFIXES = [
  // Xác thực
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/activate',
  // Văn bản pháp lý & hỗ trợ
  '/terms',
  '/privacy-policy',
  '/public-dpa',
  '/pricing-policy',
  '/payment-policy',
  '/complaint-policy',
  '/refund-policy',
  '/service-terms',
  '/support',
  '/contact',
  // Trang công khai của chủ shop cho khách hàng
  '/lp',
  '/embed',
  '/chat',
  '/f',
];

/**
 * Kiểm tra xem pathname có khớp tiền tố loại trừ có ranh giới hay không
 * (ví dụ: `/terms` khớp `/terms` và `/terms/`, nhưng KHÔNG khớp `/termsx`).
 */
export const isPathExcludedFromPostAuthGates = (pathname) => {
  if (!pathname || typeof pathname !== 'string') return false;
  return GATE_EXCLUDED_PATH_PREFIXES.some((prefix) => {
    const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    return pathname === cleanPrefix || pathname.startsWith(`${cleanPrefix}/`);
  });
};

/**
 * Component toàn cục render các modal cổng sau đăng nhập (PR-B).
 * Được gắn một lần duy nhất trong `<Router>` ở `App.jsx`.
 */
const PostAuthGateModals = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);
  const dismissPhoneReminder = useAuthStore((s) => s.dismissPhoneReminder);

  const { mustChangePassword, consentRequired, phoneRequired } = usePostAuthGates();

  // Không hiển thị nếu chưa đăng nhập hoặc đang ở đường dẫn bị loại trừ
  if (!isAuthenticated || isPathExcludedFromPostAuthGates(location.pathname)) {
    return null;
  }

  const handleDeclineConsent = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <ChangePasswordModal
        isOpen={mustChangePassword}
        forced
        onClose={() => {}}
        onChanged={() => updateUser({ ...user, mustChangePassword: false })}
      />

      <PhoneRequiredModal
        isOpen={phoneRequired}
        onClose={dismissPhoneReminder}
        onChanged={(phone, phoneVerifiedAt) =>
          updateUser({ ...user, phone, ...(phoneVerifiedAt ? { phoneVerifiedAt } : {}) })}
      />

      <ConsentRequiredModal
        isOpen={consentRequired}
        isOutdated={Boolean(user?.consentVersionOutdated)}
        onConsented={() =>
          updateUser({
            ...user,
            hasConsented: true,
            consentVersionOutdated: false,
            consents: {
              terms: { granted: true, document_version: '2026-09-10' },
              privacy: { granted: true, document_version: '2026-09-10' },
              dpa: { granted: true, document_version: '2026-09-10' },
            },
          })
        }
        onDecline={handleDeclineConsent}
      />
    </>
  );
};

export default PostAuthGateModals;

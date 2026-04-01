import PrivacyPolicy from './PrivacyPolicy';

/**
 * Trang public data policy chạy trực tiếp bằng React component.
 *
 * Luồng hoạt động:
 * 1. Route public gọi component này tại `/privacy-policy` hoặc `/private-policy` (cùng nội dung, không cần đăng nhập).
 * 2. Component chỉ đóng vai trò wrapper để tách biệt route public với nội dung chính sách.
 * 3. Toàn bộ UI và tương tác được render trong `PrivacyPolicy` thay vì nhúng file HTML tĩnh.
 *
 * @returns {JSX.Element} Trang chính sách bảo mật public.
 */
function PublicDataPolicyPage() {
  return <PrivacyPolicy />;
}

export default PublicDataPolicyPage;

import { useAuthStore } from '../stores/authStore';
import MainLayout from './MainLayout';
import DocsLayout from './DocsLayout';

/**
 * Khung cho trung tâm hướng dẫn `/huong-dan`.
 *
 * Phản hồi sếp 14/09/2026: bấm "Hướng dẫn" trên thanh trên của app là sang một giao diện khác,
 * mất menu chính (không còn sidebar bên trái) nên khó thao tác tiếp. Vì vậy:
 *   - đã đăng nhập  → trang hướng dẫn chạy BÊN TRONG khung app (`MainLayout`: thanh trên +
 *     sidebar + panel trợ lý), `DocsLayout` vào chế độ `embedded` để không dựng header thứ hai;
 *   - chưa đăng nhập → giữ NGUYÊN layout công khai như trước (trang hướng dẫn là trang công khai,
 *     khách chưa có tài khoản vẫn phải đọc được; tuyệt đối không bọc `ProtectedRoute`).
 *
 * Vì sao xét cả `accessToken` trong kho chứ không chỉ `isAuthenticated`: `authStore` khởi tạo
 * `isAuthenticated: false` + `isLoading: true` rồi mới xác thực lại bằng API. Nếu chỉ đọc
 * `isAuthenticated`, người đang đăng nhập sẽ thấy layout công khai nhấp nháy một nhịp rồi mới
 * đổi sang khung app. Có token thì hiện khung app ngay từ khung hình đầu; token hỏng thì
 * `checkAuth` trả false và trang tự chuyển về layout công khai.
 */
function hasStoredAccessToken() {
  try {
    return Boolean(localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken'));
  } catch {
    // Trình duyệt chặn kho lưu trữ (cửa sổ ẩn danh, chặn cookie) → coi như chưa đăng nhập.
    return false;
  }
}

export default function HelpDocsRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);

  const insideApp = isAuthenticated || (isLoading && hasStoredAccessToken());

  if (!insideApp) return <DocsLayout />;

  return (
    <MainLayout>
      <DocsLayout embedded />
    </MainLayout>
  );
}

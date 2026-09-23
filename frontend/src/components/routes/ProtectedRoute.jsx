import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import LoadingScreen from '../LoadingScreen';
import NoPlanScreen from '../../pages/auth/NoPlanScreen';

/**
 * Bảo vệ /app/* — yêu cầu đăng nhập, và nếu đang ở không gian CÁ NHÂN thì phải có gói của chính mình.
 *
 * Tách khỏi App.jsx để test được, cùng lý do đã ghi ở PermissionRoute: nằm trong App.jsx thì muốn kiểm
 * nó phải nạp cả trăm module của ứng dụng, nên thực tế là không ca nào ghim.
 *
 * NHÁNH "CHƯA CÓ GÓI" PHẢI **RENDER**, KHÔNG ĐƯỢC ĐIỀU HƯỚNG. Bản cũ trả `<Navigate to="/" />` và
 * đẻ ra hai chuyện:
 *   1. người dùng bị đá thẳng ra trang bán hàng công khai, không một lời giải thích;
 *   2. sự cố trắng trang 23/09/2026 — nút "Tài khoản của tôi" gọi `switchContext(null)` rồi
 *      `navigate('/app')`, cú `Navigate` ở đây chạy ngược lại, hai bên giẫm chân nhau và React dựng
 *      ra cây rỗng. Không một lỗi JS nào; đo trên production thì `#root` chỉ còn thẻ toast.
 * Render thẳng thì không còn cuộc đua nào để thua.
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user, activeContext } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => {
        useAuthStore.setState({ isLoading: false, isAuthenticated: false });
      }, 15000);
      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search || ''}`);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;

  // Không gian NHÂN VIÊN dựa vào gói của chủ — middleware phía máy chủ đã gác, frontend không kiểm lại.
  if (activeContext?.type === 'self' && !user?.active_plan_id) {
    return <NoPlanScreen />;
  }

  return children;
};

export default ProtectedRoute;

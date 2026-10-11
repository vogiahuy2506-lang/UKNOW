import { Navigate } from 'react-router-dom';
import { useAuthStore, hasStoredAccessToken } from '../../stores/authStore';
import LoadingScreen from '../LoadingScreen';
import SessionCheckFailedScreen from './SessionCheckFailedScreen';
import UnauthorizedScreen from '../../pages/auth/UnauthorizedScreen';

/**
 * Bảo vệ /admin/* — chỉ super_admin được vào, role khác thấy màn hình unauthorized.
 *
 * Tách khỏi App.jsx để test được (cùng lý do với ProtectedRoute/PermissionRoute: nằm trong App.jsx thì muốn
 * kiểm nó phải nạp cả ứng dụng). Hành vi giữ nguyên, trừ một nhánh mới: phiên chưa kiểm tra được vì lỗi tạm
 * thời (429/5xx/mất mạng) mà máy còn token → màn "Thử lại", KHÔNG điều hướng ra /login.
 */
const AdminRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user, sessionCheckFailed } = useAuthStore();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) {
    if (sessionCheckFailed && hasStoredAccessToken()) return <SessionCheckFailedScreen />;
    return <Navigate to="/login" replace />;
  }
  if (user?.role !== 'admin') return <UnauthorizedScreen />;

  return children;
};

export default AdminRoute;

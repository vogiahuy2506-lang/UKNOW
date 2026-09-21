import { useAuthStore } from '../../stores/authStore';
import UnauthorizedScreen from '../../pages/auth/UnauthorizedScreen';

/**
 * Cổng route theo quyền nhân viên. Self context luôn vào được; employee context chỉ vào được nếu có ít
 * nhất 1 trong các permission. Thiếu quyền → màn "không có quyền" với `reason="permission"` để nhân viên
 * thấy "{công ty} chưa cấp quyền này cho bạn" + nút kiểm tra lại (PLAN_NHAN_VIEN PR-3 mục 5.2). Tách khỏi
 * App.jsx để test được — trước đó nó là hàm nội bộ nên dòng truyền `reason` không có test nào ghim.
 */
const PermissionRoute = ({ permission, children }) => {
  const { activeContext } = useAuthStore();
  if (activeContext?.type === 'employee') {
    const perms = Array.isArray(permission) ? permission : [permission];
    const hasPermission = perms.some((p) => activeContext?.permissions?.[p] === true);
    if (!hasPermission) return <UnauthorizedScreen reason="permission" />;
  }
  return children;
};

export default PermissionRoute;

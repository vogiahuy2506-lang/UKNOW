import { isSuperAdmin, isUserAdmin, isEmployee } from '../utils/roleScope.util.js';

/**
 * Middleware kiểm tra superadmin — quyền cao nhất, quản lý toàn hệ thống.
 * Giữ tên requireAdmin để tương thích với các route cũ đang dùng.
 */
export function requireAdmin(req, res, next) {
  if (!isSuperAdmin(req.user?.role)) {
    return res.status(403).json({
      success: false,
      message: 'Bạn không có quyền truy cập chức năng quản trị',
    });
  }
  return next();
}

/**
 * Middleware kiểm tra role linh hoạt.
 * @param {...string} roles - vd: requireRole('superadmin', 'user_admin')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền thực hiện hành động này',
      });
    }
    return next();
  };
}

/**
 * Middleware đảm bảo user_admin đã có gói dịch vụ active.
 * - superadmin : bypass (không cần plan).
 * - employee   : bypass (dùng plan của owner).
 * - user_admin với active_plan_id = NULL : chặn, trả code NO_ACTIVE_PLAN.
 */
export function requireActivePlan(req, res, next) {
  const { role, active_plan_id } = req.user || {};

  if (isSuperAdmin(role) || isEmployee(role)) {
    return next();
  }

  if (isUserAdmin(role) && !active_plan_id) {
    return res.status(403).json({
      success: false,
      message: 'Bạn cần đăng ký gói dịch vụ để sử dụng tính năng này',
      code: 'NO_ACTIVE_PLAN',
    });
  }

  return next();
}

/**
 * Middleware kiểm tra permission cụ thể cho employee.
 * - superadmin và user_admin : luôn được phép.
 * - employee : kiểm tra key tương ứng trong req.user.permissions.
 *
 * @param {string} permissionKey - key trong JSONB permissions, vd: 'campaigns_run'
 */
export function requirePermission(permissionKey) {
  return (req, res, next) => {
    const { role, permissions } = req.user || {};

    if (isSuperAdmin(role) || isUserAdmin(role)) {
      return next();
    }

    if (isEmployee(role)) {
      if (permissions?.[permissionKey] === true) {
        return next();
      }
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền thực hiện hành động này',
        code: 'PERMISSION_DENIED',
      });
    }

    return res.status(403).json({ success: false, message: 'Không xác định được quyền hạn' });
  };
}

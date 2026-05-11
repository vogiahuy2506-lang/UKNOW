import { isSuperAdmin, isUserAdmin, isEmployeeContext } from '../utils/roleScope.util.js';

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
 * @param {...string} roles - vd: requireRole('admin', 'user')
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
 * Middleware đảm bảo user hoặc owner của ngữ cảnh hiện tại đã có gói dịch vụ active.
 * - superadmin      : bypass (không cần plan).
 * - employee context: kiểm tra plan của owner (contextPlanId từ auth middleware).
 * - self context    : kiểm tra plan của chính user.
 */
export function requireActivePlan(req, res, next) {
  const { role, activeContext } = req.user || {};

  if (isSuperAdmin(role)) {
    return next();
  }

  const planId = activeContext?.contextPlanId ?? null;

  if (!planId) {
    return res.status(403).json({
      success: false,
      message: isEmployeeContext(activeContext)
        ? 'Chủ tài khoản chưa đăng ký gói dịch vụ'
        : 'Bạn cần đăng ký gói dịch vụ để sử dụng tính năng này',
      code: 'NO_ACTIVE_PLAN',
    });
  }

  return next();
}

/**
 * Middleware kiểm tra permission cụ thể.
 * - superadmin và user_admin (self context): luôn được phép.
 * - employee context: kiểm tra key tương ứng trong activeContext.permissions.
 *
 * @param {string} permissionKey - key trong JSONB permissions, vd: 'campaigns_run'
 */
export function requirePermission(permissionKey) {
  return (req, res, next) => {
    const { role, activeContext } = req.user || {};

    if (isSuperAdmin(role)) {
      return next();
    }

    if (isEmployeeContext(activeContext)) {
      if (activeContext.permissions?.[permissionKey] === true) {
        return next();
      }
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền thực hiện hành động này',
        code: 'PERMISSION_DENIED',
      });
    }

    // Self context (user_admin): luôn được phép
    if (isUserAdmin(role)) {
      return next();
    }

    return res.status(403).json({ success: false, message: 'Không xác định được quyền hạn' });
  };
}

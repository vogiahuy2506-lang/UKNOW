import { isSuperAdmin, isUserAdmin, isEmployeeContext } from '../utils/roleScope.util.js';

/**
 * Middleware yêu cầu user đổi mật khẩu trước khi truy cập.
 * Chỉ áp dụng cho user thường, bypass cho superadmin.
 */
export function requirePasswordChange(req, res, next) {
  if (isSuperAdmin(req.user?.role)) {
    return next();
  }

  if (req.user?.must_change_password === true) {
    return res.status(403).json({
      success: false,
      message: 'Bạn cần đổi mật khẩu trước khi sử dụng hệ thống',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }

  return next();
}

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
    const userRole = String(req.user?.role || '').trim().toLowerCase();
    const normalizedRoles = roles.map(r => String(r || '').trim().toLowerCase());

    if (!normalizedRoles.includes(userRole)) {
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
 * - Hết hạn: chặn khi đã qua subscription_expires_at + grace_period_days.
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

  const expiryRaw = activeContext?.contextPlanExpiry ?? null;
  if (expiryRaw) {
    const expiresAt = new Date(expiryRaw);
    if (!Number.isNaN(expiresAt.getTime())) {
      const graceDays = Number(activeContext?.contextGraceDays) || 0;
      const graceUntil = new Date(expiresAt);
      graceUntil.setUTCDate(graceUntil.getUTCDate() + graceDays);
      if (Date.now() > graceUntil.getTime()) {
        return res.status(403).json({
          success: false,
          message: isEmployeeContext(activeContext)
            ? 'Gói dịch vụ của chủ tài khoản đã hết hạn'
            : 'Gói dịch vụ của bạn đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng',
          code: 'PLAN_EXPIRED',
        });
      }
    }
  }

  return next();
}

/**
 * Chỉ cho phép self context (chủ tài khoản) — chặn employee context.
 * Dùng cho billing/topup: nhân viên không được mua ghi vào ví của chủ.
 */
export function requireSelfContext(req, res, next) {
  if (isEmployeeContext(req.user?.activeContext)) {
    return res.status(403).json({
      success: false,
      message: 'Chỉ chủ tài khoản mới có thể thực hiện thao tác này',
      code: 'OWNER_ONLY',
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

import { isAdminRole } from '../utils/roleScope.util.js';

/**
 * Middleware kiểm tra quyền admin cho các API quản trị.
 *
 * Luồng hoạt động:
 * 1. Đọc role từ `req.user` đã được auth middleware gắn trước đó.
 * 2. Nếu không phải admin, trả về 403.
 * 3. Nếu là admin, cho phép đi tiếp.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireAdmin(req, res, next) {
  if (!isAdminRole(req.user?.role_code)) {
    return res.status(403).json({
      success: false,
      message: 'Bạn không có quyền truy cập chức năng quản trị',
    });
  }

  return next();
}

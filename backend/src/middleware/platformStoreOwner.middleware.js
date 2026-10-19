import { getWorkspaceContext } from '../utils/workspaceContext.util.js';
import { assertPlatformStoreOwner } from '../services/founderai/platformStoreAccess.service.js';

/**
 * Chặn route đọc/đồng bộ khách + đơn của cửa hàng nền tảng (founderai.biz) với mọi workspace không phải của super admin.
 * Xét role CHỦ workspace nên nhân viên của workspace super admin vẫn qua. Đặt SAU `authMiddleware` và `requirePermission`.
 */
export async function requirePlatformStoreOwner(req, res, next) {
  try {
    const { workspaceOwnerId } = getWorkspaceContext(req.user);
    await assertPlatformStoreOwner(workspaceOwnerId);
    return next();
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        ...(error.code ? { code: error.code } : {}),
      });
    }
    console.error('[PlatformStoreOwner] kiểm tra quyền thất bại:', error.message);
    return res.status(500).json({ success: false, message: 'Không thể kiểm tra quyền truy cập' });
  }
}

export default requirePlatformStoreOwner;

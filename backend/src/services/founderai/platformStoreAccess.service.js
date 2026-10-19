import platformStoreAccessRepository from '../../repositories/founderai/platformStoreAccess.repository.js';
import { isSuperAdmin } from '../../utils/roleScope.util.js';

export const PLATFORM_STORE_ADMIN_ONLY = 'PLATFORM_STORE_ADMIN_ONLY';

/**
 * Cổng "cửa hàng của NỀN TẢNG" (founderai.biz).
 *
 * Khoá WooCommerce `UKNOW_CONSUMER_KEY` là của nền tảng, trả họ tên/email/SĐT người mua founderai.biz. Chỉ workspace
 * của super admin mới được đọc/đồng bộ. Xét role của CHỦ workspace (không phải người gọi) — nhân viên của workspace
 * super admin vẫn dùng được, còn chủ tài khoản thường (kể cả có quyền `customers`) thì bị chặn.
 *
 * @param {number|string} workspaceOwnerId id chủ workspace (`getWorkspaceContext(...).workspaceOwnerId`).
 * @returns {Promise<void>} ném lỗi `statusCode=403`, `code=PLATFORM_STORE_ADMIN_ONLY` nếu không phải super admin.
 */
export async function assertPlatformStoreOwner(workspaceOwnerId) {
  const role = await platformStoreAccessRepository.findRoleByUserId(workspaceOwnerId);
  if (!isSuperAdmin(role)) {
    const error = new Error('Chức năng này chỉ dành cho quản trị viên hệ thống');
    error.statusCode = 403;
    error.code = PLATFORM_STORE_ADMIN_ONLY;
    throw error;
  }
}

export default { assertPlatformStoreOwner };

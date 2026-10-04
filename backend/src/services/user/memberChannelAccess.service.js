import {
  findAssignedZaloAccountIds,
  listOwnerZaloAccountsWithAssignment,
  replaceZaloAccountAssignments,
} from '../../repositories/user/memberChannelAccount.repository.js';

/**
 * Một nguồn duy nhất cho câu hỏi "người thao tác này dùng được tài khoản kênh nào?" (PLAN_GIAO_TAI_KHOAN_
 * ZALO_CHO_NHAN_VIEN_2026-10-04). Hiện chỉ Zalo cá nhân.
 *
 * Quy tắc:
 *  - Chủ (contextType 'self') và super admin thấy TẤT CẢ → trả `null` (= không lọc).
 *  - Nhân viên (contextType 'employee') chỉ thấy tài khoản được giao → trả mảng id (có thể rỗng).
 *  - HỎNG THÌ CHẶN: ngữ cảnh thiếu / đọc bảng giao lỗi → mảng rỗng, KHÔNG BAO GIỜ `null`. Đây là phân quyền;
 *    khác khuôn `topupLockGate` (khuôn đó cố ý cho qua khi lỗi, dùng cho khoá tài nguyên, không phải quyền).
 *
 * `ctx` lấy từ `getWorkspaceContext(req.user)` (utils/workspaceContext.util.js).
 */

export const ZALO_ACCOUNT_NOT_ASSIGNED_CODE = 'ZALO_ACCOUNT_NOT_ASSIGNED';
export const ZALO_ACCOUNT_NOT_ASSIGNED_MESSAGE = 'Tài khoản Zalo này chưa được giao cho bạn.';
export const OWNER_ONLY_CODE = 'WORKSPACE_OWNER_ONLY';

/**
 * Người thao tác có bị lọc theo việc giao không (nhân viên, không phải super admin).
 *
 * @param {{ contextType?: string, isSuperAdmin?: boolean }} ctx
 * @returns {boolean}
 */
export function isAssignmentScopedContext(ctx) {
  if (!ctx) return true; // thiếu ngữ cảnh → coi như bị lọc (hỏng thì chặn)
  if (ctx.isSuperAdmin === true) return false;
  return ctx.contextType === 'employee';
}

/**
 * @param {{ actorUserId?: number, workspaceOwnerId?: number, contextType?: string, isSuperAdmin?: boolean }} ctx
 * @returns {Promise<number[]|null>} `null` = thấy tất cả (chủ / super admin); mảng = chỉ các id này (lỗi → `[]`)
 */
export async function getAccessibleZaloAccountIds(ctx) {
  if (!isAssignmentScopedContext(ctx)) return null;
  try {
    const ownerId = Number(ctx?.workspaceOwnerId);
    const employeeId = Number(ctx?.actorUserId);
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0 || !Number.isSafeInteger(employeeId) || employeeId <= 0) {
      return [];
    }
    return await findAssignedZaloAccountIds(ownerId, employeeId);
  } catch (error) {
    console.error('[memberChannelAccess] Không đọc được việc giao tài khoản Zalo — chặn:', error?.message || error);
    return [];
  }
}

/**
 * @param {number|string} accountId
 * @param {number[]|null} accessibleIds kết quả `getAccessibleZaloAccountIds`
 * @returns {boolean}
 */
export function isZaloAccountAccessible(accountId, accessibleIds) {
  if (accessibleIds === null) return true;
  if (!Array.isArray(accessibleIds)) return false;
  const id = Number(accountId);
  return Number.isSafeInteger(id) && accessibleIds.includes(id);
}

/**
 * Bản ĐỒNG BỘ của `assertZaloAccountAccess` cho chỗ đã có sẵn `accessibleIds` (kết quả `getAccessibleZaloAccountIds`):
 * ném 403 `ZALO_ACCOUNT_NOT_ASSIGNED` nếu tài khoản không nằm trong phạm vi. `null` (chủ / super admin) luôn qua; mọi giá trị
 * khác mảng (kể cả `undefined` — chỗ gọi quên truyền) bị chặn.
 *
 * @param {number|string|null|undefined} accountId
 * @param {number[]|null|undefined} accessibleIds
 * @returns {void}
 */
export function assertZaloAccountInScope(accountId, accessibleIds) {
  if (isZaloAccountAccessible(accountId, accessibleIds)) return;
  const error = new Error(ZALO_ACCOUNT_NOT_ASSIGNED_MESSAGE);
  error.status = 403;
  error.statusCode = 403;
  error.code = ZALO_ACCOUNT_NOT_ASSIGNED_CODE;
  throw error;
}

/**
 * Ném 403 `ZALO_ACCOUNT_NOT_ASSIGNED` nếu nhân viên không được giao tài khoản này.
 * Chủ / super admin luôn qua.
 *
 * @param {object} ctx
 * @param {number|string} accountId
 * @returns {Promise<void>}
 */
export async function assertZaloAccountAccess(ctx, accountId) {
  assertZaloAccountInScope(accountId, await getAccessibleZaloAccountIds(ctx));
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isZaloAccountNotAssignedError(error) {
  return error?.code === ZALO_ACCOUNT_NOT_ASSIGNED_CODE;
}

/**
 * Danh sách tài khoản Zalo của chủ + cờ đã giao cho nhân viên (màn Quản lý nhân viên).
 *
 * @param {number} ownerId
 * @param {number} employeeId
 * @returns {Promise<Array<{ id: number, displayName: string, zaloName: string, zaloPhone: string, status: string, isActive: boolean, isDefault: boolean, assigned: boolean, source: string|null }>>}
 */
export async function listZaloAssignmentsForOwner(ownerId, employeeId) {
  const rows = await listOwnerZaloAccountsWithAssignment(ownerId, employeeId);
  return rows.map((row) => ({
    id: Number(row.id),
    displayName: row.display_name || '',
    zaloName: row.zalo_name || '',
    zaloPhone: row.zalo_phone || '',
    status: row.status,
    isActive: Boolean(row.is_active),
    isDefault: Boolean(row.is_default),
    assigned: row.assignment_source != null,
    source: row.assignment_source || null,
  }));
}

/**
 * Thay toàn bộ việc giao Zalo cá nhân cho nhân viên. Id không thuộc chủ bị loại.
 *
 * @param {{ ownerId: number, employeeId: number, accountIds: Array<number|string>, actorUserId: number }} input
 * @returns {Promise<{ before: number[], after: number[] }>}
 */
export async function setZaloAssignmentsForEmployee({ ownerId, employeeId, accountIds, actorUserId }) {
  return replaceZaloAccountAssignments({ ownerId, employeeId, accountIds, actorUserId });
}

import { isSuperAdmin } from './roleScope.util.js';

function toPositiveInteger(value) {
  const normalized = Number.parseInt(value, 10);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function createContextError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/**
 * Chuẩn hóa actor/workspace context từ user đã được authMiddleware xác minh.
 * Không nhận owner id từ body/query để tránh caller vô tình mở cross-tenant scope.
 *
 * @param {object} authUser
 * @returns {{
 *   actorUserId: number,
 *   workspaceOwnerId: number,
 *   membershipId: number|null,
 *   contextType: 'self'|'employee',
 *   permissions: object,
 *   roleCode: string|null,
 *   isSuperAdmin: boolean,
 * }}
 */
export function getWorkspaceContext(authUser) {
  const actorUserId = toPositiveInteger(authUser?.id);
  if (!actorUserId) {
    throw createContextError('Thiếu thông tin người dùng', 401, 'INVALID_ACTOR');
  }

  const contextType = authUser?.activeContext?.type === 'employee' ? 'employee' : 'self';
  const workspaceOwnerId = contextType === 'employee'
    ? toPositiveInteger(authUser?.activeContext?.ownerId)
    : actorUserId;

  if (!workspaceOwnerId) {
    throw createContextError('Ngữ cảnh workspace không hợp lệ', 403, 'INVALID_CONTEXT');
  }

  return {
    actorUserId,
    workspaceOwnerId,
    membershipId: contextType === 'employee'
      ? toPositiveInteger(authUser?.activeContext?.membershipId)
      : null,
    contextType,
    permissions: authUser?.activeContext?.permissions || {},
    roleCode: authUser?.role || null,
    isSuperAdmin: isSuperAdmin(authUser?.role),
  };
}

/**
 * Shape dùng chung cho repository tenant-scoped.
 *
 * @param {object} authUser
 */
export function getWorkspaceScope(authUser) {
  const context = getWorkspaceContext(authUser);
  return {
    userId: context.actorUserId,
    workspaceOwnerId: context.workspaceOwnerId,
    membershipId: context.membershipId,
    contextType: context.contextType,
    roleCode: context.roleCode,
    isSuperAdmin: context.isSuperAdmin,
  };
}

/**
 * Trả về ID của workspace owner (nếu là nhân viên thì lấy ownerId, ngược lại lấy user.id).
 *
 * @param {object} user
 * @returns {number}
 */
export function resolveWorkspaceOwnerId(user) {
  if (user?.activeContext?.type === 'employee' && user?.activeContext?.ownerId) {
    return user.activeContext.ownerId;
  }
  return user?.workspaceOwnerId || user?.id;
}

export default getWorkspaceContext;

/**
 * Kiểm tra role có phải superadmin không (quyền cao nhất, xem toàn bộ hệ thống).
 * @param {string | null | undefined} role
 * @returns {boolean}
 */
export function isSuperAdmin(role) {
  return String(role || '').trim().toLowerCase() === 'admin';
}

/**
 * Kiểm tra role có phải user_admin không.
 * @param {string | null | undefined} role
 * @returns {boolean}
 */
export function isUserAdmin(role) {
  return String(role || '').trim().toLowerCase() === 'user';
}

/**
 * Kiểm tra activeContext có phải ngữ cảnh employee không.
 * Thay thế isEmployee(role) — "employee" giờ là context, không phải role.
 * @param {{ type: string } | null | undefined} activeContext
 * @returns {boolean}
 */
export function isEmployeeContext(activeContext) {
  return activeContext?.type === 'employee';
}

/**
 * @deprecated Dùng isEmployeeContext(activeContext) thay thế.
 * Giữ lại để không làm vỡ các callers chưa được refactor.
 */
export function isEmployee(role) {
  return String(role || '').trim().toLowerCase() === 'employee';
}

/**
 * Kiểm tra role có quyền quản trị hệ thống không (superadmin).
 * @param {string | null | undefined} role
 * @returns {boolean}
 */
export function isAdminRole(role) {
  return isSuperAdmin(role);
}

/**
 * Build điều kiện SQL theo phạm vi quyền của user.
 *
 * - superadmin      : không giới hạn, xem toàn bộ data.
 * - employee context: xem data của owner (id_user = ownerId).
 * - user_admin      : chỉ xem data của chính mình (id_user = userId).
 *
 * @param {object} input
 * @param {string} input.tableAlias     alias bảng chứa cột id_user
 * @param {number|string} input.userId  id user hiện tại
 * @param {string | null | undefined} input.role  role hiện tại
 * @param {{ type: string, ownerId?: number } | null} [input.activeContext]
 * @param {number|string} [input.ownerId]  owner_id (legacy, dùng khi không có activeContext)
 * @param {Array<any>} [input.params]  mảng params hiện có
 * @returns {{ clause: string, params: any[], nextParamIndex: number }}
 */
export function buildUserScopeClause({
  tableAlias,
  userId,
  role,
  activeContext,
  ownerId,
  params = [],
}) {
  const scopedParams = [...params];
  let clause = '';

  if (isSuperAdmin(role)) {
    // Không lọc gì cả
  } else if (isEmployeeContext(activeContext)) {
    // Employee context: thấy data của owner
    const effectiveOwnerId = activeContext.ownerId ?? ownerId;
    scopedParams.push(effectiveOwnerId);
    clause = `${tableAlias}.id_user = $${scopedParams.length}`;
  } else if (isEmployee(role) && ownerId) {
    // Legacy fallback khi activeContext chưa có
    scopedParams.push(ownerId);
    clause = `${tableAlias}.id_user = $${scopedParams.length}`;
  } else {
    // user_admin: xem data của chính mình
    scopedParams.push(userId);
    clause = `${tableAlias}.id_user = $${scopedParams.length}`;
  }

  return {
    clause,
    params: scopedParams,
    nextParamIndex: scopedParams.length + 1,
  };
}

/**
 * Kiểm tra role có phải superadmin không (quyền cao nhất, xem toàn bộ hệ thống).
 * @param {string | null | undefined} role
 * @returns {boolean}
 */
export function isSuperAdmin(role) {
  return String(role || '').trim().toLowerCase() === 'super_admin';
}

/**
 * Kiểm tra role có phải user_admin không (thành viên đã mua gói).
 * @param {string | null | undefined} role
 * @returns {boolean}
 */
export function isUserAdmin(role) {
  return String(role || '').trim().toLowerCase() === 'user_admin';
}

/**
 * Kiểm tra role có phải employee không (nhân viên do user_admin tạo).
 * @param {string | null | undefined} role
 * @returns {boolean}
 */
export function isEmployee(role) {
  return String(role || '').trim().toLowerCase() === 'employee';
}

/**
 * Kiểm tra role có quyền quản trị hệ thống không (superadmin).
 * Giữ tên isAdminRole để tương thích với code cũ đang dùng hàm này.
 * @param {string | null | undefined} role
 * @returns {boolean}
 */
export function isAdminRole(role) {
  return isSuperAdmin(role);
}

/**
 * Build điều kiện SQL theo phạm vi quyền của user.
 *
 * - superadmin : không giới hạn, xem toàn bộ data.
 * - user_admin : chỉ xem data của chính mình (id_user = userId).
 * - employee   : xem data của owner (id_user = ownerId).
 *
 * @param {object} input
 * @param {string} input.tableAlias   alias bảng chứa cột id_user
 * @param {number|string} input.userId  id user hiện tại
 * @param {string | null | undefined} input.role  role hiện tại
 * @param {number|string} [input.ownerId]  owner_id (chỉ cần khi role = employee)
 * @param {Array<any>} [input.params]  mảng params hiện có
 * @returns {{ clause: string, params: any[], nextParamIndex: number }}
 */
export function buildUserScopeClause({
  tableAlias,
  userId,
  role,
  ownerId,
  params = [],
}) {
  const scopedParams = [...params];
  let clause = '';

  if (isSuperAdmin(role)) {
    // Không lọc gì cả
  } else if (isEmployee(role) && ownerId) {
    // Employee thấy data của owner mình
    scopedParams.push(ownerId);
    clause = `${tableAlias}.id_user = $${scopedParams.length}`;
  } else {
    // user_admin thấy data của chính mình
    scopedParams.push(userId);
    clause = `${tableAlias}.id_user = $${scopedParams.length}`;
  }

  return {
    clause,
    params: scopedParams,
    nextParamIndex: scopedParams.length + 1,
  };
}

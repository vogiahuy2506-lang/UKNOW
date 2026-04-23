/**
 * Kiểm tra người dùng hiện tại có phải admin hay không.
 *
 * Luồng hoạt động:
 * 1. Chuẩn hóa `roleCode` về chữ thường.
 * 2. Trả về `true` nếu role là `admin`, ngược lại trả về `false`.
 *
 * @param {string | null | undefined} roleCode mã role của user hiện tại
 * @returns {boolean} true nếu là admin
 */
export function isAdminRole(roleCode) {
  return String(roleCode || '').trim().toLowerCase() === 'admin';
}

/**
 * Build điều kiện SQL theo phạm vi quyền của user.
 *
 * Luồng hoạt động:
 * 1. Nếu user là admin: không thêm điều kiện owner để xem toàn bộ dữ liệu.
 * 2. Nếu user là employee: thêm điều kiện `${tableAlias}.id_user = $n`.
 * 3. Trả về clause + params + vị trí tham số mới để query phía trên tái sử dụng.
 *
 * @param {object} input dữ liệu đầu vào
 * @param {string} input.tableAlias alias bảng chứa cột id_user
 * @param {number|string} input.userId id user hiện tại
 * @param {string | null | undefined} input.roleCode role hiện tại
 * @param {Array<any>} [input.params] mảng params hiện có
 * @returns {{ clause: string, params: any[], nextParamIndex: number }}
 */
export function buildUserScopeClause({
  tableAlias,
  userId,
  roleCode,
  params = [],
}) {
  const scopedParams = [...params];
  let clause = '';

  if (!isAdminRole(roleCode)) {
    scopedParams.push(userId);
    clause = `${tableAlias}.id_user = $${scopedParams.length}`;
  }

  return {
    clause,
    params: scopedParams,
    nextParamIndex: scopedParams.length + 1,
  };
}

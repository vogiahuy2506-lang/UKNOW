import * as adminMembersService from '../../services/admin/adminMembers.service.js';
import { logSystem, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../services/audit.service.js';
import { getSystemAuditContext } from '../../utils/auditContext.util.js';

function handleError(res, err) {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  console.error('Admin members error:', err);
  return res.status(500).json({ success: false, message: 'Lỗi server' });
}

/** GET /api/admin/members?search=&planId=&status=&role= */
export async function list(req, res) {
  try {
    const { search, planId, status, expiry, role } = req.query;
    const members = await adminMembersService.listMembers({ search, planId, status, expiry, role });
    return res.json({ success: true, data: members });
  } catch (err) { return handleError(res, err); }
}

/** PATCH /api/admin/members/:id/status — toggle active/inactive */
export async function toggleStatus(req, res) {
  try {
    const result = await adminMembersService.toggleMemberStatus(Number(req.params.id));
    return res.json({ success: true, message: 'Cập nhật trạng thái thành công', data: result });
  } catch (err) { return handleError(res, err); }
}

/** PATCH /api/admin/members/:id/promote — nâng lên super_admin */
export async function promote(req, res) {
  try {
    const result = await adminMembersService.promoteToSuperAdmin(Number(req.params.id));
    logSystem(
      getSystemAuditContext(req),
      AUDIT_ACTIONS.USER_ROLE_CHANGED,
      AUDIT_ENTITY_TYPES.USER,
      result.id,
      { from: 'user', to: 'admin', email: result.email }
    );
    return res.json({ success: true, message: `Đã nâng ${result.email} lên super_admin`, data: result });
  } catch (err) { return handleError(res, err); }
}

/** PATCH /api/admin/members/:id/demote — hạ super_admin xuống user */
export async function demote(req, res) {
  try {
    const result = await adminMembersService.demoteFromSuperAdmin(Number(req.params.id), req.user.id);
    logSystem(
      getSystemAuditContext(req),
      AUDIT_ACTIONS.USER_ROLE_CHANGED,
      AUDIT_ENTITY_TYPES.USER,
      result.id,
      { from: 'admin', to: 'user', email: result.email }
    );
    return res.json({ success: true, message: `Đã hạ ${result.email} xuống người dùng thường`, data: result });
  } catch (err) { return handleError(res, err); }
}

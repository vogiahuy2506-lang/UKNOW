import * as adminMembersService from '../../services/admin/adminMembers.service.js';

function handleError(res, err) {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  console.error('Admin members error:', err);
  return res.status(500).json({ success: false, message: 'Lỗi server' });
}

/** GET /api/admin/members?search=&planId=&status= */
export async function list(req, res) {
  try {
    const { search, planId, status } = req.query;
    const members = await adminMembersService.listMembers({ search, planId, status });
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
    return res.json({ success: true, message: `Đã nâng ${result.email} lên super_admin`, data: result });
  } catch (err) { return handleError(res, err); }
}

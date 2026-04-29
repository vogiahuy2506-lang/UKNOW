import {
  findAllMembers,
  findMemberById,
  setMemberStatus,
  promoteMemberToSuperAdmin,
} from '../../repositories/admin/adminMembers.repository.js';

export async function listMembers(filters) {
  return findAllMembers(filters);
}

export async function toggleMemberStatus(id) {
  const member = await findMemberById(id);
  if (!member) throw { status: 404, message: 'Không tìm thấy thành viên' };
  const newStatus = member.status === 'active' ? 'inactive' : 'active';
  return setMemberStatus(id, newStatus);
}

export async function promoteToSuperAdmin(id) {
  const member = await findMemberById(id);
  if (!member) throw { status: 404, message: 'Không tìm thấy thành viên' };
  if (member.role !== 'user_admin') throw { status: 400, message: 'Tài khoản này không phải user_admin' };
  const result = await promoteMemberToSuperAdmin(id);
  if (!result) throw { status: 500, message: 'Không thể nâng cấp tài khoản' };
  return result;
}

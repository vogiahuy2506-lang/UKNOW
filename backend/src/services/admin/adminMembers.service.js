import {
  findAllMembers,
  findMemberById,
  setMemberStatus,
  promoteMemberToSuperAdmin,
  demoteMemberFromSuperAdmin,
  countAdmins,
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
  if (member.role !== 'user') throw { status: 400, message: 'Tài khoản này không phải người dùng thông thường' };
  const result = await promoteMemberToSuperAdmin(id);
  if (!result) throw { status: 500, message: 'Không thể nâng cấp tài khoản' };
  return result;
}

export async function demoteFromSuperAdmin(id, actorId) {
  const member = await findMemberById(id);
  if (!member) throw { status: 404, message: 'Không tìm thấy thành viên' };
  if (member.role !== 'admin') throw { status: 400, message: 'Tài khoản này không phải super admin' };
  if (Number(id) === Number(actorId)) throw { status: 400, message: 'Không thể tự hạ quyền chính mình' };
  const adminCount = await countAdmins();
  if (adminCount <= 1) throw { status: 400, message: 'Không thể hạ quyền admin cuối cùng' };
  const result = await demoteMemberFromSuperAdmin(id);
  if (!result) throw { status: 500, message: 'Không thể hạ quyền tài khoản' };
  return result;
}

import {
  findAllMembers,
  findMemberById,
  setMemberStatus,
  promoteMemberToSuperAdmin,
  demoteMemberFromSuperAdmin,
  countAdmins,
  setMemberRole,
  detachMemberEmail as detachMemberEmailRow,
  findPurgeBlockers,
  purgeMember as purgeMemberRow,
} from '../../repositories/admin/adminMembers.repository.js';
import { revokeAllRefreshTokensForUser } from '../../repositories/user/user.repository.js';

export async function listMembers(filters) {
  return findAllMembers(filters);
}

export async function toggleMemberStatus(id) {
  const member = await findMemberById(id);
  if (!member) throw { status: 404, message: 'Không tìm thấy thành viên' };
  const newStatus = member.status === 'active' ? 'inactive' : 'active';
  return setMemberStatus(id, newStatus);
}

export async function updateMemberRole(id, role) {
  const member = await findMemberById(id);
  if (!member) throw { status: 404, message: 'Không tìm thấy thành viên' };
  if (!['user', 'admin'].includes(role)) throw { status: 400, message: 'Role không hợp lệ' };
  if (member.role === 'super_admin') throw { status: 400, message: 'Không thể thay đổi role của super_admin' };
  return setMemberRole(id, role); // gọi repo
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

/**
 * Guard dùng chung cho cả detach-email và purge — cùng 4 điều kiện chặn.
 * confirmEmail: xác nhận lại email hiện tại (khớp modal "gõ lại email" ở frontend)
 * — chặn cả trường hợp trang admin đang mở cũ (đã đổi email/id lại từ trước).
 */
function assertCanTargetForRemoval(member, id, actorId, confirmEmail) {
  if (!member) throw { status: 404, message: 'Không tìm thấy thành viên' };
  if (Number(id) === Number(actorId)) throw { status: 400, message: 'Không thể tự thao tác lên chính tài khoản của mình' };
  if (member.role === 'admin') throw { status: 400, message: 'Không thể thao tác lên tài khoản Super Admin khác' };
  if (String(confirmEmail || '').trim().toLowerCase() !== String(member.email || '').trim().toLowerCase()) {
    throw { status: 400, message: 'Email xác nhận không khớp với email hiện tại của tài khoản' };
  }
}

/**
 * Mức 1 — gỡ email khỏi tài khoản. Giải phóng email/username, giữ nguyên dữ liệu
 * (đơn hàng, hoá đơn...), thu hồi mọi refresh token đang sống, và trả về email
 * gốc để controller ghi audit log (không truy vết được nữa sau bước này).
 * Nếu releaseTrialHistory = true: ẩn danh user_email trên các đơn trial/free sang freed+<id>@deleted.local
 */
export async function detachMemberEmail(id, actorId, confirmEmail, releaseTrialHistory = false) {
  const member = await findMemberById(id);
  assertCanTargetForRemoval(member, id, actorId, confirmEmail);
  if (member.status === 'deleted') throw { status: 400, message: 'Tài khoản này đã được gỡ email trước đó' };

  const originalEmail = member.email;
  const result = await detachMemberEmailRow(id, {
    originalEmail,
    releaseTrialHistory: Boolean(releaseTrialHistory),
  });
  if (!result) throw { status: 500, message: 'Không thể gỡ email tài khoản' };
  await revokeAllRefreshTokensForUser(id, 'admin_detach_email');
  return { ...result, originalEmail };
}

/**
 * Mức 2 — xoá cứng, chỉ cho tài khoản "sạch" (không đơn hàng thành công, không
 * dữ liệu marketplace). Dữ liệu pháp lý/lịch sử thật phải dùng Mức 1.
 */
export async function purgeMember(id, actorId, confirmEmail) {
  const member = await findMemberById(id);
  assertCanTargetForRemoval(member, id, actorId, confirmEmail);

  const blockers = await findPurgeBlockers(id);
  if (blockers.length > 0) {
    throw {
      status: 409,
      message: `Không thể xoá cứng: tài khoản còn ${blockers.join(', ')}. Dùng "Gỡ email" (Mức 1) thay thế — dữ liệu vẫn giữ nguyên, email được giải phóng để đăng ký lại.`,
    };
  }

  const originalEmail = member.email;
  let result;
  try {
    result = await purgeMemberRow(id);
  } catch (err) {
    // Lưới an toàn cho các bảng khác cũng REFERENCES users(id) mà không khai báo
    // ON DELETE (vd notifications.created_by) — findPurgeBlockers không quét hết
    // mọi bảng trong hệ thống, chỉ 2 trường hợp phổ biến nhất.
    if (err?.code === '23503') {
      throw {
        status: 409,
        message: 'Không thể xoá cứng: tài khoản còn dữ liệu liên quan ở bảng khác. Dùng "Gỡ email" (Mức 1) thay thế.',
      };
    }
    throw err;
  }
  if (!result) throw { status: 500, message: 'Không thể xoá tài khoản' };
  return { ...result, originalEmail };
}

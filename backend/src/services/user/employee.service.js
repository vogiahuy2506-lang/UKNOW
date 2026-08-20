import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  findEmployeesByOwner,
  findEmployeeByIdAndOwner,
  findTeamOverview,
  findOwnerIdForEmployee,
  countActiveEmployees,
  findOwnerPlanLimit,
  findUserByEmail,
  findOwnerInfo,
  createEmployeeWithLink,
  linkExistingUserAsEmployee,
  updateEmployeeInfo,
  updateEmployeePermissions,
  updateEmployeeStatus,
  updateEmployeeSendLimits,
  removeEmployee,
  resetEmployeePassword as resetPasswordInDb,
} from '../../repositories/user/employee.repository.js';
import verificationService from '../verification.service.js';
import { sumActiveTopupGrants } from '../../repositories/payment/topup.repository.js';
import {
  VALID_PERMISSION_KEYS,
  normalizePermissions,
} from '../../config/employeePermissionCatalog.js';

export { VALID_PERMISSION_KEYS };

async function assertCanAddEmployee(ownerId) {
  const maxEmployees = await findOwnerPlanLimit(ownerId);

  if (maxEmployees === null) {
    throw { status: 403, message: 'Bạn cần đăng ký gói dịch vụ để thêm nhân viên', code: 'NO_ACTIVE_PLAN' };
  }

  if (maxEmployees !== -1) {
    const topupSlots = await sumActiveTopupGrants(ownerId, 'employees');
    const effectiveMax = maxEmployees + Math.max(0, Number(topupSlots) || 0);
    const current = await countActiveEmployees(ownerId);
    if (current >= effectiveMax) {
      throw {
        status: 403,
        message: `Gói của bạn chỉ cho phép tối đa ${effectiveMax} nhân viên. Vui lòng nâng cấp gói để thêm nhân viên.`,
        code: 'EMPLOYEE_LIMIT_REACHED',
      };
    }
  }
}

// Bỏ ký tự dễ đọc nhầm khi chủ shop đọc mật khẩu cho nhân viên: 0/O, 1/l/I.
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const TEMP_PASSWORD_LENGTH = 10;

/**
 * Mật khẩu tạm dùng một lần khi chủ shop reset cho nhân viên.
 * Ngẫu nhiên theo từng lần — không dùng hằng số dùng chung.
 * Lấy mẫu có loại bỏ (rejection sampling) để không lệch phân phối do phép chia dư.
 */
export function generateTempPassword() {
  const limit = 256 - (256 % TEMP_PASSWORD_ALPHABET.length);
  let out = '';
  while (out.length < TEMP_PASSWORD_LENGTH) {
    for (const byte of crypto.randomBytes(TEMP_PASSWORD_LENGTH)) {
      if (byte >= limit) continue;
      out += TEMP_PASSWORD_ALPHABET[byte % TEMP_PASSWORD_ALPHABET.length];
      if (out.length === TEMP_PASSWORD_LENGTH) break;
    }
  }
  return out;
}

export async function listEmployees(ownerId) {
  return findEmployeesByOwner(ownerId);
}

export async function getEmployee(ownerId, employeeId) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }
  return employee;
}

export async function createEmployee(ownerId, { username, email, fullName }) {
  await assertCanAddEmployee(ownerId);

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw { status: 400, message: 'Email này đã được sử dụng bởi một tài khoản khác' };
  }

  // Tạo password hash ngẫu nhiên — tài khoản chưa thể đăng nhập cho đến khi kích hoạt
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  const employee = await createEmployeeWithLink({ ownerId, username, email, passwordHash, fullName });

  const owner = await findOwnerInfo(ownerId);
  // Không throw khi gửi thư hỏng — tài khoản đã tạo rồi, huỷ nửa chừng còn tệ hơn.
  // NHƯNG phải báo lên trên: trước đây lỗi bị nuốt im lặng nên chủ shop tưởng đã
  // gửi, còn nhân viên thì mắc kẹt (mật khẩu ngẫu nhiên, không có link kích hoạt).
  let invitationSent = true;
  let invitationError = null;
  try {
    await verificationService.sendEmployeeInvitation(email, owner?.full_name || owner?.username || 'Team');
  } catch (emailErr) {
    invitationSent = false;
    invitationError = emailErr?.message || 'Không gửi được email mời';
    console.error('Failed to send invitation email:', emailErr);
  }

  return { ...employee, invitationSent, invitationError };
}

export async function resendInvitation(ownerId, employeeId) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }
  if (employee.status !== 'pending_activation') {
    throw { status: 400, message: 'Tài khoản đã được kích hoạt', code: 'ALREADY_ACTIVATED' };
  }

  const owner = await findOwnerInfo(ownerId);
  await verificationService.sendEmployeeInvitation(employee.email, owner?.full_name || owner?.username || 'Team');
}

export async function linkUserAsEmployee(ownerId, email) {
  await assertCanAddEmployee(ownerId);

  const user = await findUserByEmail(email?.trim().toLowerCase());
  if (!user) {
    throw { status: 404, message: 'Không tìm thấy tài khoản với email này' };
  }
  if (user.id === ownerId) {
    throw { status: 400, message: 'Không thể tự thêm mình làm nhân viên' };
  }

  return linkExistingUserAsEmployee(ownerId, user.id);
}

export async function setEmployeeInfo(ownerId, employeeId, { fullName, email }) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }

  // Kiểm tra email mới không trùng với user khác
  if (email && email !== employee.email) {
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== employeeId) {
      throw { status: 400, message: 'Email này đã được sử dụng bởi tài khoản khác' };
    }
  }

  return updateEmployeeInfo(employeeId, ownerId, { fullName, email: email || employee.email });
}

export async function setEmployeePermissions(ownerId, employeeId, permissions) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }

  const sanitized = normalizePermissions(permissions);

  return updateEmployeePermissions(employeeId, ownerId, sanitized);
}

export async function setEmployeeStatus(ownerId, employeeId, status) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }
  return updateEmployeeStatus(employeeId, ownerId, status);
}

/**
 * Cập nhật giới hạn lượt gửi.
 * Giá trị null = không giới hạn, số >= 0 = giới hạn cụ thể.
 */
export async function setEmployeeSendLimits(ownerId, employeeId, limits) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }

  const parse = (val) => {
    if (val === null || val === undefined) return null;
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 0) throw { status: 400, message: 'Giá trị giới hạn không hợp lệ' };
    return n;
  };

  return updateEmployeeSendLimits(employeeId, ownerId, {
    dailyEmailLimit:   parse(limits.dailyEmailLimit),
    monthlyEmailLimit: parse(limits.monthlyEmailLimit),
    dailyZaloLimit:    parse(limits.dailyZaloLimit),
    monthlyZaloLimit:  parse(limits.monthlyZaloLimit),
  });
}

export async function deleteEmployee(ownerId, employeeId) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }
  return removeEmployee(employeeId, ownerId);
}

/**
 * Chủ shop reset mật khẩu cho nhân viên — việc nội bộ trong workspace, không gửi email.
 * Trả mật khẩu tạm về cho chủ đọc lại cho nhân viên; nhân viên bị buộc đổi ngay lần
 * đăng nhập kế tiếp (must_change_password).
 *
 * @returns {Promise<{ tempPassword: string }>}
 */
export async function resetEmployeePassword(ownerId, employeeId) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const updated = await resetPasswordInDb(employeeId, ownerId, passwordHash);
  if (!updated) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }

  return { tempPassword };
}


export async function getTeamOverview(ownerId, options = {}) {
  return findTeamOverview(ownerId, options);
}

/**
 * Employee self contribution — owner_id ALWAYS from membership/token, never client.
 */
export async function getMyContribution({ userId, activeContext }) {
  const employeeId = Number(userId);
  let ownerId = null;

  if (activeContext?.type === 'employee' && activeContext.ownerId) {
    ownerId = Number(activeContext.ownerId);
  } else {
    ownerId = await findOwnerIdForEmployee(employeeId);
  }

  if (!ownerId) return null;

  const rows = await findTeamOverview(ownerId, { employeeId });
  return rows[0] || null;
}

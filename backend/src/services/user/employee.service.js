import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  findEmployeesByOwner,
  findEmployeeByIdAndOwner,
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

export const DEFAULT_EMPLOYEE_PASSWORD = 'digiso@2026';

const VALID_PERMISSION_KEYS = [
  'email_settings',
  'email_templates',
  'zalo_settings',
  'zalo_templates',
  'courses',
  'landing_pages',
  'campaigns_view',
  'campaigns_create',
  'campaigns_run',
  'customers',
  'leads',
];

async function assertCanAddEmployee(ownerId) {
  const maxEmployees = await findOwnerPlanLimit(ownerId);

  if (maxEmployees === null) {
    throw { status: 403, message: 'Bạn cần đăng ký gói dịch vụ để thêm nhân viên', code: 'NO_ACTIVE_PLAN' };
  }

  if (maxEmployees !== -1) {
    const current = await countActiveEmployees(ownerId);
    if (current >= maxEmployees) {
      throw {
        status: 403,
        message: `Gói của bạn chỉ cho phép tối đa ${maxEmployees} nhân viên. Vui lòng nâng cấp gói để thêm nhân viên.`,
        code: 'EMPLOYEE_LIMIT_REACHED',
      };
    }
  }
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
  try {
    await verificationService.sendEmployeeInvitation(email, owner?.full_name || owner?.username || 'Team');
  } catch (emailErr) {
    console.error('Failed to send invitation email:', emailErr);
    // Không throw — tài khoản đã tạo, owner có thể gửi lại lời mời thủ công
  }

  return employee;
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

  const user = await findUserByEmail(email);
  if (!user) {
    throw { status: 404, message: 'Không tìm thấy tài khoản với email này' };
  }
  if (user.id === ownerId) {
    throw { status: 400, message: 'Không thể tự thêm mình làm nhân viên' };
  }
  if (user.role !== 'user_admin') {
    throw { status: 400, message: 'Tài khoản này đã là nhân viên của một chủ sở hữu khác' };
  }
  if (user.activePlanId !== null) {
    throw { status: 400, message: 'Tài khoản này đã có gói dịch vụ riêng và không thể chuyển thành nhân viên' };
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

  const sanitized = {};
  for (const key of VALID_PERMISSION_KEYS) {
    sanitized[key] = permissions[key] === true;
  }

  // campaigns_view luôn = true nếu campaigns_create hoặc campaigns_run được bật
  if (sanitized.campaigns_create || sanitized.campaigns_run) {
    sanitized.campaigns_view = true;
  }

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

export async function resetEmployeePassword(ownerId, employeeId) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }
  const passwordHash = await bcrypt.hash(DEFAULT_EMPLOYEE_PASSWORD, 10);
  const result = await resetPasswordInDb(employeeId, ownerId, passwordHash);
  if (!result) {
    throw { status: 500, message: 'Không thể reset mật khẩu' };
  }
}

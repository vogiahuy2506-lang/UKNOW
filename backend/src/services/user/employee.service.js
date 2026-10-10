import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  findEmployeesByOwner,
  findEmployeeByIdAndOwner,
  countActiveEmployees,
  findOwnerPlanLimit,
  findUserByEmail,
  findUserByUsername,
  findOwnerInfo,
  createEmployeeWithLink,
  linkExistingUserAsEmployee,
  acceptMembership as acceptMembershipInDb,
  declineMembership as declineMembershipInDb,
  updateEmployeeInfo,
  updateEmployeePermissions,
  updateEmployeeStatus,
  updateEmployeeSendLimits,
  removeEmployee,
  resetEmployeePassword as resetPasswordInDb,
  findCampaignApprovalThreshold,
  updateCampaignApprovalThreshold as updateCampaignApprovalThresholdInDb,
} from '../../repositories/user/employee.repository.js';
import {
  listTelegramAssignmentsForOwner,
  listWhatsAppAssignmentsForOwner,
  listZaloAssignmentsForOwner,
  setChannelAssignmentsForEmployee,
} from './memberChannelAccess.service.js';
import verificationService from '../verification.service.js';
import sseService from '../sse.service.js';
import { sumActiveTopupGrants, findTopupPricingByKey } from '../../repositories/payment/topup.repository.js';
import { countValidLocks } from '../../repositories/payment/topupLock.repository.js';
import {
  VALID_PERMISSION_KEYS,
  normalizePermissions,
} from '../../config/employeePermissionCatalog.js';
import { generateUsernameFromEmail } from '../../utils/usernameFromEmail.util.js';

export { VALID_PERMISSION_KEYS };

/**
 * Công thức DUY NHẤT tính hạn mức nhân viên hiệu dụng — dùng chung cho cả cổng chặn thêm nhân viên
 * (assertCanAddEmployee) LẪN khối "meta" trả về trong GET /employees, để tránh viết hai công thức
 * lệch nhau (một chỗ đọc plans.max_employees, chỗ kia lỡ đọc users.max_employees chẳng hạn).
 *
 * @param {number} ownerId
 * @returns {Promise<{hasActivePlan: boolean, maxEmployees: number|null, topupSlots: number, effectiveMax: number, current: number}>}
 *   effectiveMax = -1 nghĩa là KHÔNG giới hạn (gói Tùy chọn, max_employees=-1).
 */
export async function computeEmployeeLimitInfo(ownerId) {
  const maxEmployees = await findOwnerPlanLimit(ownerId);
  const current = await countActiveEmployees(ownerId);

  if (maxEmployees === null) {
    return { hasActivePlan: false, maxEmployees: null, topupSlots: 0, effectiveMax: 0, current };
  }
  if (maxEmployees === -1) {
    return { hasActivePlan: true, maxEmployees: -1, topupSlots: 0, effectiveMax: -1, current };
  }

  const topupSlots = await sumActiveTopupGrants(ownerId, 'employees');
  const effectiveMax = maxEmployees + Math.max(0, Number(topupSlots) || 0);
  return { hasActivePlan: true, maxEmployees, topupSlots, effectiveMax, current };
}

async function assertCanAddEmployee(ownerId) {
  const info = await computeEmployeeLimitInfo(ownerId);

  if (!info.hasActivePlan) {
    throw { status: 403, message: 'Bạn cần đăng ký gói dịch vụ để thêm nhân viên', code: 'NO_ACTIVE_PLAN' };
  }

  if (info.maxEmployees !== -1 && info.current >= info.effectiveMax) {
    // Chỉ gợi ý "mua thêm slot" khi mặt hàng đang thật sự được bán (topup_pricing.is_active) —
    // giá đọc từ DB, không ghi cứng, để tắt/đổi giá bán không cần sửa câu chữ ở đây.
    const pricing = await findTopupPricingByKey('employees');
    const canBuySlot = Boolean(pricing?.isActive);
    const message = canBuySlot
      ? `Bạn đã dùng hết ${info.effectiveMax} chỗ nhân viên. Mua thêm slot nhân viên (${Number(pricing.unitPrice).toLocaleString('vi-VN')}đ/tháng) hoặc nâng cấp gói để thêm người.`
      : `Gói của bạn chỉ cho phép tối đa ${info.effectiveMax} nhân viên. Vui lòng nâng cấp gói để thêm nhân viên.`;
    throw { status: 403, message, code: 'EMPLOYEE_LIMIT_REACHED', canBuySlot };
  }
}

/**
 * Khối "giới hạn" hiển thị ở trang Nhân viên — cùng công thức với assertCanAddEmployee
 * (computeEmployeeLimitInfo), cộng thêm lockedCount (đang bị khoá do slot hết hạn/hạ gói) và
 * canBuySlot (mặt hàng 'employees' có đang bán không) để FE hiện đúng nút "Mua thêm slot".
 *
 * @param {number} ownerId
 * @returns {Promise<{used: number, max: number|null, topupSlots: number, lockedCount: number, canBuySlot: boolean}>}
 *   max = null nghĩa là KHÔNG giới hạn.
 */
export async function getEmployeeLimitMeta(ownerId) {
  const info = await computeEmployeeLimitInfo(ownerId);
  const [lockedCount, pricing] = await Promise.all([
    countValidLocks(ownerId, 'employees'),
    findTopupPricingByKey('employees'),
  ]);
  const max = !info.hasActivePlan ? 0 : (info.maxEmployees === -1 ? null : info.effectiveMax);
  // Gói không giới hạn (max=null) hoặc chưa có gói hoạt động: mua thêm slot không có ý nghĩa,
  // đừng gợi ý nút "Mua thêm slot" dù mặt hàng đang được bán cho các gói có trần.
  const canBuySlot = info.hasActivePlan && info.maxEmployees !== -1 && Boolean(pricing?.isActive);
  return {
    used: info.current,
    max,
    topupSlots: info.topupSlots,
    lockedCount,
    canBuySlot,
  };
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

// Hai lỗi "add không được" hay gặp nhất — mã lỗi để frontend chỉ đúng lối ra (tab Link / ô tên
// đăng nhập) thay vì một toast đỏ. Câu chữ nói luôn việc cần làm tiếp.
export const EMAIL_ALREADY_REGISTERED_CODE = 'EMAIL_ALREADY_REGISTERED';
export const USERNAME_TAKEN_CODE = 'USERNAME_TAKEN';

const EMAIL_ALREADY_REGISTERED_MESSAGE =
  'Email này đã có tài khoản Founder AI. Hãy dùng tab "Link tài khoản có sẵn" để thêm người này vào nhóm.';
const USERNAME_TAKEN_MESSAGE =
  'Tên đăng nhập này đã có người dùng. Hãy chọn tên khác (ví dụ thêm tên công ty phía sau).';

const emailAlreadyRegisteredError = () => ({
  status: 400,
  message: EMAIL_ALREADY_REGISTERED_MESSAGE,
  code: EMAIL_ALREADY_REGISTERED_CODE,
});

const usernameTakenError = () => ({
  status: 400,
  message: USERNAME_TAKEN_MESSAGE,
  code: USERNAME_TAKEN_CODE,
});

/**
 * Hai request tạo nhân viên cùng lúc vượt qua bước kiểm tra trước INSERT → DB chặn bằng
 * unique và ném 23505. Ánh xạ về đúng hai mã ở trên để người dùng không thấy "Lỗi server".
 * Nhận diện theo tên constraint HOẶC cột trong `detail` ("Key (username)=(x) already exists"),
 * vì tên constraint trên production chưa được đối chiếu.
 */
function mapEmployeeUniqueViolation(err) {
  if (err?.code !== '23505') return null;
  const constraint = String(err.constraint || '');
  const detail = String(err.detail || '');
  if (constraint === 'users_username_key' || /\(username\)/i.test(detail)) return usernameTakenError();
  if (constraint === 'users_email_key' || /\(email\)/i.test(detail)) return emailAlreadyRegisteredError();
  return null;
}

export async function createEmployee(ownerId, { username, email, fullName }) {
  await assertCanAddEmployee(ownerId);

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw emailAlreadyRegisteredError();
  }

  // `users.username` unique toàn hệ thống: không kiểm trước thì INSERT ném 23505 → 500.
  const existingUsername = await findUserByUsername(username);
  if (existingUsername) {
    throw usernameTakenError();
  }

  // Tạo password hash ngẫu nhiên — tài khoản chưa thể đăng nhập cho đến khi kích hoạt
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  let employee;
  try {
    employee = await createEmployeeWithLink({ ownerId, username, email, passwordHash, fullName });
  } catch (err) {
    throw mapEmployeeUniqueViolation(err) || err;
  }

  const owner = await findOwnerInfo(ownerId);
  // Không throw khi gửi thư hỏng — tài khoản đã tạo rồi, huỷ nửa chừng còn tệ hơn.
  // NHƯNG phải báo lên trên: trước đây lỗi bị nuốt im lặng nên chủ shop tưởng đã
  // gửi, còn nhân viên thì mắc kẹt (mật khẩu ngẫu nhiên, không có link kích hoạt).
  let invitationSent = true;
  let invitationError = null;
  try {
    await verificationService.sendEmployeeInvitation(email, owner?.fullName || owner?.username || 'Team');
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
  await verificationService.sendEmployeeInvitation(employee.email, owner?.fullName || owner?.username || 'Team');
}

/**
 * Liên kết tài khoản có sẵn ghi dòng `accepted_at = NULL` (linkExistingUserAsEmployee) — người đó
 * chưa đồng ý gì, nên phải báo cho họ biết mình vừa bị thêm vào nhóm của ai. Không throw khi gửi
 * thư hỏng — dòng user_members đã ghi rồi, huỷ nửa chừng còn tệ hơn (giống invitationSent ở trên).
 */
async function notifyLinkedEmployee(email, ownerId) {
  const owner = await findOwnerInfo(ownerId);
  try {
    await verificationService.sendEmployeeLinkNotice(email, owner?.fullName || owner?.username || 'Team');
    return { invitationSent: true, invitationError: null };
  } catch (emailErr) {
    console.error('Failed to send employee link notice email:', emailErr);
    return { invitationSent: false, invitationError: emailErr?.message || 'Không gửi được email báo' };
  }
}

export async function linkUserAsEmployee(ownerId, email) {
  await assertCanAddEmployee(ownerId);

  const user = await findUserByEmail(email?.trim().toLowerCase());
  // Tài khoản đã xoá (status = 'deleted') coi như không tồn tại — không link được, không lộ là "đã từng có".
  if (!user || user.status === 'deleted') {
    throw { status: 404, message: 'Không tìm thấy tài khoản với email này' };
  }
  if (user.id === ownerId) {
    throw { status: 400, message: 'Không thể tự thêm mình làm nhân viên' };
  }

  const member = await linkExistingUserAsEmployee(ownerId, user.id);
  const { invitationSent, invitationError } = await notifyLinkedEmployee(user.email, ownerId);
  return { ...member, method: 'invited_link', invitationSent, invitationError };
}

/**
 * Mời nhân viên chỉ bằng email (tự link nếu đã có tài khoản, tự tạo + gửi thư nếu chưa).
 * Body: { email, fullName? }
 */
export async function inviteEmployeeByEmail(ownerId, { email, fullName }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  await assertCanAddEmployee(ownerId);

  const existingUser = await findUserByEmail(normalizedEmail);
  if (existingUser && existingUser.status !== 'deleted') {
    if (existingUser.id === ownerId) {
      throw { status: 400, message: 'Không thể tự thêm mình làm nhân viên' };
    }
    const member = await linkExistingUserAsEmployee(ownerId, existingUser.id);
    const { invitationSent, invitationError } = await notifyLinkedEmployee(existingUser.email, ownerId);
    return { ...member, method: 'invited_link', invitationSent, invitationError };
  }

  // Chưa có tài khoản (hoặc tài khoản cũ đã deleted) -> tạo mới với username tự sinh
  const username = await generateUsernameFromEmail(normalizedEmail, async (candidate) => {
    const found = await findUserByUsername(candidate);
    return Boolean(found);
  });

  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  let employee;
  try {
    employee = await createEmployeeWithLink({
      ownerId,
      username,
      email: normalizedEmail,
      passwordHash,
      fullName: fullName || null,
    });
  } catch (err) {
    throw mapEmployeeUniqueViolation(err) || err;
  }

  const owner = await findOwnerInfo(ownerId);
  let invitationSent = true;
  let invitationError = null;
  try {
    await verificationService.sendEmployeeInvitation(normalizedEmail, owner?.fullName || owner?.username || 'Team');
  } catch (emailErr) {
    invitationSent = false;
    invitationError = emailErr?.message || 'Không gửi được email mời';
    console.error('Failed to send invitation email:', emailErr);
  }

  return { ...employee, method: 'invited', invitationSent, invitationError };
}

export const EMPLOYEE_ACCOUNT_NOT_OWNED_CODE = 'EMPLOYEE_ACCOUNT_NOT_OWNED';

/**
 * Chủ chỉ được can thiệp vào TÀI KHOẢN (mật khẩu, email đăng nhập, xoá dòng users) của nhân viên do chính
 * mình tạo ra (user_members.origin = 'created'). Tài khoản có sẵn bị liên kết qua /employees/invite là tài
 * khoản của người khác: reset được là chủ nhóm đăng nhập vào tài khoản người ta
 * (RA_SOAT_NHAN_VIEN_PHAN_QUYEN_2026-09-28 mục 1). Quyền/hạn mức/khoá trong KHÔNG GIAN của chủ thì vẫn chỉnh được.
 */
function assertOwnerCreatedAccount(employee) {
  if (employee.origin === 'created') return;
  throw {
    status: 403,
    code: EMPLOYEE_ACCOUNT_NOT_OWNED_CODE,
    message: 'Tài khoản này do người dùng tự đăng ký, không phải do bạn tạo — bạn chỉ chỉnh được quyền và hạn mức. '
      + 'Mật khẩu và email đăng nhập họ tự đổi trong Hồ sơ, hoặc dùng "Quên mật khẩu".',
  };
}

export async function setEmployeeInfo(ownerId, employeeId, { fullName, email }) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }
  assertOwnerCreatedAccount(employee);

  // Kiểm tra email mới không trùng với user khác
  if (email && email !== employee.email) {
    const existing = await findUserByEmail(email);
    if (existing && existing.id !== employeeId) {
      throw { status: 400, message: 'Email này đã được sử dụng bởi tài khoản khác' };
    }
  }

  const before = { fullName: employee.fullName, email: employee.email };
  const after = await updateEmployeeInfo(employeeId, ownerId, { fullName, email: email || employee.email });
  return { before, after };
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
  // Người chưa chấp nhận lời mời chưa thật sự vào nhóm — khoá/mở khoá một membership còn đang chờ
  // không có ý nghĩa (RA_SOAT_NHAN_VIEN_PHAN_QUYEN_2026-09-28 mục 1 phần còn lại).
  if (!employee.acceptedAt) {
    throw { status: 400, message: 'Người này chưa chấp nhận lời mời' };
  }
  // Mở khoá = chiếm lại một suất: phải qua đúng cổng trần như lúc thêm. Không có dòng này thì khoá A → thêm B
  // → mở khoá A cho ra 2/1 (RA_SOAT_NHAN_VIEN_PHAN_QUYEN_2026-09-28 mục 3). countActiveEmployees không đếm
  // người đang inactive nên gọi thẳng assertCanAddEmployee là đúng số.
  if (status === 'active' && employee.memberStatus !== 'active') {
    await assertCanAddEmployee(ownerId);
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
    dailyEmailLimit:     parse(limits.dailyEmailLimit),
    monthlyEmailLimit:   parse(limits.monthlyEmailLimit),
    dailyZaloLimit:      parse(limits.dailyZaloLimit),
    monthlyZaloLimit:    parse(limits.monthlyZaloLimit),
    dailyAiCreditLimit:  parse(limits.dailyAiCreditLimit),
    periodAiCreditLimit: parse(limits.periodAiCreditLimit),
  });
}

/**
 * Danh sách tài khoản Zalo cá nhân + Telegram + WhatsApp (Baileys) của chủ, kèm cờ đã giao cho nhân viên này
 * (tab "Tài khoản kênh").
 */
export async function getEmployeeChannelAccounts(ownerId, employeeId) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }
  const [zaloAccounts, telegramAccounts, whatsappAccounts] = await Promise.all([
    listZaloAssignmentsForOwner(ownerId, employeeId),
    listTelegramAssignmentsForOwner(ownerId, employeeId),
    listWhatsAppAssignmentsForOwner(ownerId, employeeId),
  ]);
  return { zaloAccounts, telegramAccounts, whatsappAccounts };
}

const sameList = (a, b) => a.length === b.length && a.every((value, index) => String(value) === String(b[index]));

/**
 * Thay việc giao theo kênh cho nhân viên (một giao dịch). Khoá `undefined` trong `channels` = GIỮ NGUYÊN kênh đó
 * (bản FE cũ chỉ gửi Zalo không được làm mất việc giao Telegram / WhatsApp). Id / khoá không thuộc chủ bị loại.
 *
 * @param {number} ownerId
 * @param {number} employeeId
 * @param {{ zaloAccountIds?: Array<number|string>, telegramAccountIds?: Array<number|string>, whatsappSessionKeys?: string[] }} channels
 * @param {number} actorUserId
 * @returns {Promise<{ zaloAccounts: object[], telegramAccounts: object[], whatsappAccounts: object[], changes: { zalo: object|null, telegram: object|null, whatsapp: object|null } }>}
 */
export async function setEmployeeChannelAccounts(ownerId, employeeId, channels, actorUserId) {
  const employee = await findEmployeeByIdAndOwner(employeeId, ownerId);
  if (!employee) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }
  const { zaloAccountIds, telegramAccountIds, whatsappSessionKeys } = channels || {};
  const changes = await setChannelAssignmentsForEmployee({
    ownerId,
    employeeId,
    actorUserId,
    zaloAccountIds,
    telegramAccountIds,
    whatsappSessionKeys,
  });
  // Luồng SSE Hộp thư tính danh sách tài khoản được giao LÚC NỐI. Việc giao vừa đổi (gỡ HOẶC thêm) thì đóng các kết nối
  // đang mở của nhân viên này để họ nối lại với danh sách mới. Lỗi ở đây không được làm hỏng việc giao đã lưu.
  const changed = Object.values(changes).some((entry) => entry && !sameList(entry.before, entry.after));
  if (changed) {
    try {
      sseService.disconnectActor(ownerId, employeeId);
    } catch (error) {
      console.warn('[employee] Không đóng được luồng SSE sau khi đổi việc giao tài khoản kênh:', error?.message || error);
    }
  }
  const [zaloAccounts, telegramAccounts, whatsappAccounts] = await Promise.all([
    listZaloAssignmentsForOwner(ownerId, employeeId),
    listTelegramAssignmentsForOwner(ownerId, employeeId),
    listWhatsAppAssignmentsForOwner(ownerId, employeeId),
  ]);
  return { zaloAccounts, telegramAccounts, whatsappAccounts, changes };
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
  assertOwnerCreatedAccount(employee);

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const updated = await resetPasswordInDb(employeeId, ownerId, passwordHash);
  if (!updated) {
    throw { status: 404, message: 'Không tìm thấy nhân viên' };
  }

  return { tempPassword };
}


/**
 * Người bị liên kết (origin='linked', accepted_at NULL) tự chấp nhận lời mời của một chủ cụ thể.
 * `userId` luôn lấy từ token (self context, requireSelfContext) — không bao giờ nhận ownerId ngoài
 * URL param.
 */
export async function acceptMembershipInvite(userId, ownerId) {
  const result = await acceptMembershipInDb(Number(userId), Number(ownerId));
  if (!result) {
    throw { status: 404, message: 'Không tìm thấy lời mời đang chờ chấp nhận' };
  }
  return result;
}

/**
 * Từ chối lời mời — xoá hẳn dòng user_members đang chờ.
 */
export async function declineMembershipInvite(userId, ownerId) {
  const result = await declineMembershipInDb(Number(userId), Number(ownerId));
  if (!result) {
    throw { status: 404, message: 'Không tìm thấy lời mời đang chờ chấp nhận' };
  }
  return result;
}

export async function getCampaignApprovalThreshold(ownerId) {
  return findCampaignApprovalThreshold(ownerId);
}

export async function setCampaignApprovalThreshold(ownerId, threshold) {
  let normalizedThreshold = null;
  if (threshold !== null && threshold !== undefined && threshold !== '' && threshold !== 0 && threshold !== '0') {
    const num = Number(threshold);
    if (!Number.isInteger(num) || num < 0) {
      throw { status: 400, message: 'Ngưỡng số lượng người nhận phải là số nguyên dương hoặc để trống / 0 để tắt' };
    }
    normalizedThreshold = num === 0 ? null : num;
  }
  const before = await findCampaignApprovalThreshold(ownerId);
  const after = await updateCampaignApprovalThresholdInDb(ownerId, normalizedThreshold);
  return { before, after };
}

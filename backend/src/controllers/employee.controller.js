import * as employeeService from '../services/user/employee.service.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';
import { PERMISSION_CATALOG } from '../config/employeePermissionCatalog.js';

/**
 * Lấy owner_id đúng ngữ cảnh:
 * - user_admin tự quản lý nhân viên của mình.
 * - super_admin có thể truyền ownerId qua query param để xem của bất kỳ owner nào.
 */
function resolveOwnerId(req) {
  if (req.user.role === 'admin') {
    return req.query.ownerId ? Number(req.query.ownerId) : null;
  }
  return req.user.id;
}

function handleServiceError(res, err) {
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message, code: err.code });
  }
  console.error('Employee controller error:', err);
  return res.status(500).json({ success: false, message: 'Lỗi server' });
}

/**
 * GET /api/employees/permissions/catalog
 * Catalog được backend quản lý để client không tự suy diễn key/dependency.
 */
export function getPermissionCatalog(_req, res) {
  return res.json({ success: true, data: Object.values(PERMISSION_CATALOG) });
}

/**
 * GET /api/employees
 * Lấy danh sách nhân viên của owner.
 */
export async function getEmployees(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return res.status(400).json({ success: false, message: 'Thiếu ownerId' });
    }
    const employees = await employeeService.listEmployees(ownerId);
    return res.json({ success: true, data: employees });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * GET /api/employees/:id
 * Lấy chi tiết một nhân viên.
 */
export async function getEmployee(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return res.status(400).json({ success: false, message: 'Thiếu ownerId' });
    }
    const employee = await employeeService.getEmployee(ownerId, Number(req.params.id));
    return res.json({ success: true, data: employee });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * POST /api/employees
 * Tạo tài khoản employee mới và gửi email mời kích hoạt.
 * Body: { username, email, fullName }
 */
export async function createEmployee(req, res) {
  try {
    const ownerId = req.user.id;
    const { username, email, fullName } = req.body;
    const employee = await employeeService.createEmployee(ownerId, { username, email, fullName });
    await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.EMPLOYEE_ADDED, AUDIT_ENTITY_TYPES.EMPLOYEE, employee.id, { username, email, fullName, invitationSent: employee.invitationSent });
    // Nói thật khi thư mời gửi hỏng — nếu không, nhân viên không có đường nào vào
    // hệ thống mà chủ shop lại tưởng mọi thứ ổn.
    return res.status(201).json({
      success: true,
      message: employee.invitationSent
        ? 'Đã gửi lời mời đến email nhân viên'
        : 'Đã tạo tài khoản NHƯNG gửi email mời thất bại. Nhân viên chưa vào được — hãy bấm "Gửi lại lời mời" sau khi kiểm tra cấu hình email.',
      data: employee,
    });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * POST /api/employees/:id/resend-invite
 * Gửi lại email mời kích hoạt cho nhân viên chưa kích hoạt.
 */
export async function resendInvite(req, res) {
  try {
    const ownerId = req.user.id;
    await employeeService.resendInvitation(ownerId, Number(req.params.id));
    return res.json({ success: true, message: 'Đã gửi lại lời mời kích hoạt' });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * POST /api/employees/link
 * Link tài khoản người dùng có sẵn thành nhân viên theo email.
 * Người dùng có thể đang thuộc nhiều tổ chức khác — thao tác này không ảnh hưởng đến các mối quan hệ đó.
 * Body: { email }
 */
export async function linkEmployee(req, res) {
  try {
    const ownerId = req.user.id;
    const { email } = req.body;
    const member = await employeeService.linkUserAsEmployee(ownerId, email);
    await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.EMPLOYEE_ADDED, AUDIT_ENTITY_TYPES.EMPLOYEE, member.employee_id, { email, method: 'link' });
    return res.status(201).json({ success: true, message: 'Liên kết nhân viên thành công', data: member });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * PATCH /api/employees/:id
 * Cập nhật thông tin cơ bản (họ tên, email) của employee.
 * Body: { fullName, email }
 */
export async function updateInfo(req, res) {
  try {
    const ownerId = req.user.id;
    const { fullName, email } = req.body;
    const updated = await employeeService.setEmployeeInfo(ownerId, Number(req.params.id), { fullName, email });
    return res.json({ success: true, message: 'Cập nhật thông tin thành công', data: updated });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * PATCH /api/employees/:id/limits
 * Cập nhật giới hạn lượt gửi email/zalo theo ngày và tháng.
 * Body: { dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit }
 * null = không giới hạn, số >= 0 = giới hạn cụ thể.
 */
export async function updateLimits(req, res) {
  try {
    const ownerId = req.user.id;
    const {
      dailyEmailLimit,
      monthlyEmailLimit,
      dailyZaloLimit,
      monthlyZaloLimit,
      dailyAiCreditLimit,
      periodAiCreditLimit,
    } = req.body;
    const updated = await employeeService.setEmployeeSendLimits(ownerId, Number(req.params.id), {
      dailyEmailLimit,
      monthlyEmailLimit,
      dailyZaloLimit,
      monthlyZaloLimit,
      dailyAiCreditLimit,
      periodAiCreditLimit,
    });
    await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.EMPLOYEE_LIMITS_UPDATED, AUDIT_ENTITY_TYPES.EMPLOYEE, Number(req.params.id), {
      dailyEmailLimit,
      monthlyEmailLimit,
      dailyZaloLimit,
      monthlyZaloLimit,
      dailyAiCreditLimit,
      periodAiCreditLimit,
    });
    return res.json({ success: true, message: 'Cập nhật giới hạn lượt gửi thành công', data: updated });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * PATCH /api/employees/:id/permissions
 * Cập nhật permissions của employee.
 * Body: { permissions: { key: boolean, ... } }
 */
export async function updatePermissions(req, res) {
  try {
    const ownerId = req.user.id;
    const { permissions } = req.body;
    const updated = await employeeService.setEmployeePermissions(ownerId, Number(req.params.id), permissions);
    await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.EMPLOYEE_PERMISSIONS_UPDATED, AUDIT_ENTITY_TYPES.EMPLOYEE, Number(req.params.id), { permissions });
    return res.json({ success: true, message: 'Cập nhật quyền hạn thành công', data: updated });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * PATCH /api/employees/:id/status
 * Kích hoạt hoặc tạm khóa nhân viên.
 * Body: { status: 'active' | 'inactive' }
 */
export async function updateStatus(req, res) {
  try {
    const ownerId = req.user.id;
    const { status } = req.body;
    const updated = await employeeService.setEmployeeStatus(ownerId, Number(req.params.id), status);
    await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.EMPLOYEE_STATUS_UPDATED, AUDIT_ENTITY_TYPES.EMPLOYEE, Number(req.params.id), { status });
    return res.json({ success: true, message: 'Cập nhật trạng thái thành công', data: updated });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * DELETE /api/employees/:id
 * Xóa nhân viên khỏi team (đổi role về user_admin, xóa user_members).
 */
export async function deleteEmployee(req, res) {
  try {
    const ownerId = req.user.id;
    await employeeService.deleteEmployee(ownerId, Number(req.params.id));
    await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.EMPLOYEE_REMOVED, AUDIT_ENTITY_TYPES.EMPLOYEE, Number(req.params.id), {});
    return res.json({ success: true, message: 'Đã xóa nhân viên khỏi team' });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * PATCH /api/employees/:id/reset-password
 * Reset mật khẩu nhân viên về mặc định.
 */
export async function resetEmployeePassword(req, res) {
  try {
    const ownerId = req.user.id;
    const { tempPassword } = await employeeService.resetEmployeePassword(ownerId, Number(req.params.id));
    // KHÔNG ghi mật khẩu tạm vào nhật ký — chỉ trả về cho chủ đọc lại cho nhân viên.
    await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.EMPLOYEE_PASSWORD_RESET, AUDIT_ENTITY_TYPES.EMPLOYEE, Number(req.params.id), {});
    return res.json({
      success: true,
      message: 'Đã đặt lại mật khẩu. Gửi mật khẩu tạm này cho nhân viên — họ sẽ phải đổi ngay khi đăng nhập.',
      data: { tempPassword },
    });
  } catch (err) {
    return handleServiceError(res, err);
  }
}
/**
 * GET /api/employees/team-overview
 * Tổng quan hoạt động của toàn team (read-only, chỉ employer xem được).
 */
export async function teamOverview(req, res) {
  try {
    // owner_id from token only — never from query/body
    if (req.user.activeContext?.type === 'employee') {
      return res.status(403).json({ success: false, message: 'Chỉ chủ workspace xem được tổng quan team' });
    }
    const ownerId = req.user.id;
    const data = await employeeService.getTeamOverview(ownerId);
    return res.json({ success: true, data });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * GET /api/employees/contribution
 * Đóng góp nhân viên — chủ workspace xem toàn team.
 * Ranh giới quyền (PLAN_DO_LUONG_KPI): ownerId LUÔN từ token, tuyệt đối không đọc query/body.
 */
export async function teamContribution(req, res) {
  try {
    if (req.user.activeContext?.type === 'employee') {
      return res.status(403).json({
        success: false,
        message: 'Chỉ chủ workspace xem được đóng góp team',
      });
    }
    // Ignore client-supplied ownerId (query/body) — intentional security boundary.
    void req.query?.ownerId;
    void req.body?.ownerId;
    const ownerId = req.user.id;
    const data = await employeeService.getTeamOverview(ownerId);
    return res.json({ success: true, data });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * GET /api/employees/contribution/me
 * Nhân viên xem số của chính mình (D4).
 */
export async function myContribution(req, res) {
  try {
    const data = await employeeService.getMyContribution({
      userId: req.user.id,
      activeContext: req.user.activeContext,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * GET /api/employees/campaign-approval-threshold
 * Lấy ngưỡng số người nhận cần duyệt chiến dịch của workspace.
 */
export async function getCampaignApprovalThreshold(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return res.status(400).json({ success: false, message: 'Thiếu ownerId' });
    }
    const threshold = await employeeService.getCampaignApprovalThreshold(ownerId);
    return res.json({ success: true, data: { threshold } });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

/**
 * PATCH /api/employees/campaign-approval-threshold
 * Cập nhật ngưỡng số người nhận cần duyệt chiến dịch của workspace.
 */
export async function updateCampaignApprovalThreshold(req, res) {
  try {
    const ownerId = resolveOwnerId(req);
    if (!ownerId) {
      return res.status(400).json({ success: false, message: 'Thiếu ownerId' });
    }
    const { threshold } = req.body;
    const { before, after } = await employeeService.setCampaignApprovalThreshold(ownerId, threshold);
    await logWorkspace(
      getWorkspaceAuditContext(req),
      AUDIT_ACTIONS.CAMPAIGN_APPROVAL_THRESHOLD_UPDATED,
      AUDIT_ENTITY_TYPES.WORKSPACE,
      ownerId,
      { before, after }
    );
    return res.json({
      success: true,
      data: { threshold: after },
      message: 'Cập nhật ngưỡng duyệt chiến dịch thành công',
    });
  } catch (err) {
    return handleServiceError(res, err);
  }
}

import bcrypt from 'bcryptjs';
import {
  createLegacyEmployee,
  findLegacyEmployees,
  findPasswordHashByUserId,
  findProfileBase,
  findProfileBaseFallback,
  findProfilePlan,
  findProfilePlanFallback,
  findProfileUsageCounts,
  findRoleAndLimits,
  findRoleAndLimitsFallback,
  findSuccessfulOrdersForUser,
  findUserByEmailExceptId,
  resetLegacyEmployeePassword,
  updateLegacyEmployeeLimits,
  updateLegacyEmployeeStatus,
  updatePasswordHash,
  updateProfile as updateProfileInDb,
} from '../repositories/user/user.repository.js';
import usageTrackingService from '../services/payment/usageTracking.service.js';

const DEFAULT_EMPLOYEE_PASSWORD = 'digiso@2026';
const EMPLOYEE_LIMIT_KEYS = {
  maxCampaigns: 'max_campaigns',
  maxZaloAccounts: 'max_zalo_accounts',
  maxEmailAccounts: 'max_email_accounts',
  maxEmailTemplates: 'max_email_templates',
  maxZaloTemplates: 'max_zalo_templates',
  maxLandingPages: 'max_landing_pages',
};
/**
 * Chuẩn hóa giá trị giới hạn từ request body.
 *
 * Luồng hoạt động:
 * 1. Nếu giá trị là null/undefined thì giữ nguyên ý nghĩa "không giới hạn".
 * 2. Nếu là chuỗi rỗng thì coi như null để thuận tiện cho form submit.
 * 3. Nếu có dữ liệu thì ép về số nguyên để lưu DB nhất quán.
 *
 * @param {unknown} rawValue giá trị thô từ request body
 * @returns {number|null|undefined} số nguyên, null hoặc undefined khi không truyền
 */
const normalizeLimitValue = (rawValue) => {
  if (rawValue === undefined) return undefined;
  if (rawValue === null) return null;
  if (typeof rawValue === 'string' && rawValue.trim() === '') return null;

  return Number.parseInt(rawValue, 10);
};

/**
 * Kiểm tra lỗi PostgreSQL do thiếu cột giới hạn (chưa chạy migration).
 *
 * @param {unknown} error lỗi phát sinh từ truy vấn DB
 * @returns {boolean} true nếu lỗi do thiếu cột
 */
const isMissingLimitColumnError = (error) => error?.code === '42703';

/**
 * Chuẩn hóa dữ liệu profile trả về cho frontend.
 *
 * Luồng hoạt động:
 * 1. Map toàn bộ cột snake_case từ DB sang camelCase.
 * 2. Bổ sung fallback role mặc định để tương thích ngược.
 * 3. Luôn trả đủ 5 trường giới hạn để frontend render ổn định.
 *
 * @param {Record<string, any>} userRow dòng dữ liệu user từ DB
 * @returns {Record<string, any>} profile đã chuẩn hóa
 */
const mapProfileResponse = (userRow) => ({
  id: userRow.id,
  username: userRow.username,
  email: userRow.email,
  fullName: userRow.full_name,
  avatarUrl: userRow.avatar_url,
  phone: userRow.phone,
  status: userRow.status,
  role: userRow.role || userRow.role_code || 'user',
  roleCode: userRow.role || userRow.role_code || 'user',
  roleName: userRow.role_name || 'Người dùng',
  maxCampaigns: userRow.max_campaigns ?? null,
  maxZaloAccounts: userRow.max_zalo_accounts ?? null,
  maxEmailAccounts: userRow.max_email_accounts ?? null,
  maxEmailTemplates: userRow.max_email_templates ?? null,
  maxZaloTemplates: userRow.max_zalo_templates ?? null,
  maxLandingPages: userRow.max_landing_pages ?? null,
  createdAt: userRow.created_at,
  lastLoginAt: userRow.last_login_at,
  subscriptionExpiresAt: userRow.subscription_expires_at ?? null,
  // Plan info (user_admin only)
  activePlanId: userRow.plan_id ?? userRow.active_plan_id ?? null,
  activePlanName: userRow.plan_name ?? null,
  activePlanCode: userRow.plan_code ?? null,
  activePlanPrice: userRow.plan_price ?? null,
  activePlanFeatures: userRow.plan_features ?? null,
  planMaxEmployees: userRow.plan_max_employees ?? null,
  dailyEmailLimit: userRow.daily_email_limit ?? null,
  monthlyEmailLimit: userRow.monthly_email_limit ?? null,
  dailyZaloLimit: userRow.daily_zalo_limit ?? null,
  monthlyZaloLimit: userRow.monthly_zalo_limit ?? null,
  aiTokensPerPeriod: userRow.ai_tokens_per_period ?? null,
  aiTokensUsed: Number(userRow.ai_tokens_used ?? 0),
  planGracePeriodDays: userRow.grace_period_days ?? 0,
  // Send usage counts (today and this month)
  emailSentToday: Number(userRow.email_sent_today ?? 0),
  emailSentMonth: Number(userRow.email_sent_month ?? 0),
  zaloSentToday: Number(userRow.zalo_sent_today ?? 0),
  zaloSentMonth: Number(userRow.zalo_sent_month ?? 0),
});

class UserController {
  /**
   * Lấy thông tin profile của user đang đăng nhập.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getProfile(req, res) {
    try {
      const userId = req.user.id;

      // 1. User base info — separate try/catch only for missing limit columns
      let userRow;
      try {
        userRow = await findProfileBase(userId);
      } catch {
        // Fallback khi migration chưa chạy đủ (thiếu cột limit hoặc subscription_expires_at)
        userRow = await findProfileBaseFallback(userId);
      }

      if (!userRow) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      }

      // 2. Resolve plan — active_plan_id first, then latest order by user_id OR user_email
      let planRow = null;
      try {
        planRow = await findProfilePlan({ activePlanId: userRow.active_plan_id, userId, email: userRow.email });
      } catch (err) {
        console.error('[Profile] findProfilePlan failed', { userId, message: err.message });
        try {
          planRow = await findProfilePlanFallback({ activePlanId: userRow.active_plan_id, userId, email: userRow.email });
        } catch (fallbackErr) {
          console.error('[Profile] findProfilePlanFallback failed', { userId, message: fallbackErr.message });
        }
      }

      // 3. Usage counts (best-effort)
      let usageCounts = { email_sent_today: 0, email_sent_month: 0, zalo_sent_today: 0, zalo_sent_month: 0 };
      try {
        usageCounts = await findProfileUsageCounts(userId) || usageCounts;
      } catch (err) {
        console.error('[Profile] findProfileUsageCounts failed', { userId, message: err.message });
      }

      let aiTokenUsage = { used: 0 };
      try {
        aiTokenUsage = await usageTrackingService.getResourceUsage(userId, 'ai_token');
      } catch (err) {
        console.error('[Profile] getResourceUsage(ai_token) failed', { userId, message: err.message });
      }

      res.json({
        success: true,
        data: mapProfileResponse({
          ...userRow,
          ...(planRow || {}),
          ...usageCounts,
          ai_tokens_used: aiTokenUsage.used,
        }),
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * Cập nhật thông tin profile (họ tên, email, số điện thoại, avatar).
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { fullName, email, phone, avatarUrl } = req.body;

      if (email !== undefined) {
        const existingEmail = await findUserByEmailExceptId(email, userId);
        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: 'Email đã được sử dụng',
          });
        }
      }

      const user = await updateProfileInDb(userId, { fullName, email, phone, avatarUrl });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy người dùng',
        });
      }

      let roleAndLimits = null;
      try {
        roleAndLimits = await findRoleAndLimits(userId);
      } catch {
        // Fallback không dùng JOIN để tránh lỗi khi id_role hoặc các cột limit chưa tồn tại
        try {
          roleAndLimits = await findRoleAndLimitsFallback(userId);
        } catch {
          roleAndLimits = null;
        }
      }

      const userProfileRow = {
        ...user,
        ...(roleAndLimits || {}),
      };

      res.json({
        success: true,
        message: 'Cập nhật thông tin thành công',
        data: mapProfileResponse(userProfileRow)
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Đổi mật khẩu: xác thực mật khẩu hiện tại trước khi cập nhật.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async changePassword(req, res) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      // Lấy mật khẩu hiện tại
      const user = await findPasswordHashByUserId(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy người dùng'
        });
      }

      // Kiểm tra mật khẩu hiện tại
      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Mật khẩu hiện tại không đúng'
        });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Cập nhật mật khẩu
      await updatePasswordHash(userId, newPasswordHash);

      res.json({
        success: true,
        message: 'Đổi mật khẩu thành công'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Lấy danh sách nhân viên (chỉ dành cho admin).
   *
   * Luồng hoạt động:
   * 1. Join users với roles để lấy tên vai trò rõ ràng.
   * 2. Chỉ trả về tài khoản role employee để admin quản lý nhân viên.
   * 3. Sắp xếp theo thời gian tạo mới nhất.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getEmployees(req, res) {
    try {
      let employees;
      try {
        employees = await findLegacyEmployees({ includeLimits: true });
      } catch (queryError) {
        if (!isMissingLimitColumnError(queryError)) throw queryError;

        // Fallback tương thích ngược khi DB chưa chạy migration cột giới hạn.
        employees = await findLegacyEmployees({ includeLimits: false });
      }

      return res.json({
        success: true,
        data: employees.map((row) => ({
          id: row.id,
          username: row.username,
          email: row.email,
          fullName: row.full_name,
          phone: row.phone,
          status: row.status,
          roleCode: row.role_code,
          roleName: row.role_name,
          maxCampaigns: row.max_campaigns,
          maxZaloAccounts: row.max_zalo_accounts,
          maxEmailAccounts: row.max_email_accounts,
          maxEmailTemplates: row.max_email_templates,
          maxZaloTemplates: row.max_zalo_templates,
          maxLandingPages: row.max_landing_pages,
          createdAt: row.created_at,
          lastLoginAt: row.last_login_at,
        })),
      });
    } catch (error) {
      console.error('Get employees error:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  /**
   * Tạo tài khoản nhân viên (chỉ dành cho admin).
   *
   * Luồng hoạt động:
   * 1. Kiểm tra trùng username/email.
   * 2. Lấy role employee từ bảng roles.
   * 3. Dùng mật khẩu mặc định của hệ thống để hash và tạo user mới.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async createEmployee(req, res) {
    try {
      const { username, email, fullName, phone } = req.body;

      const passwordHash = await bcrypt.hash(DEFAULT_EMPLOYEE_PASSWORD, 10);
      const createResult = await createLegacyEmployee({
        username,
        email,
        passwordHash,
        fullName,
        phone,
      });

      if (createResult.status === 'duplicate') {
        return res.status(400).json({
          success: false,
          message: 'Username hoặc email đã tồn tại',
        });
      }

      if (createResult.status === 'missing_role') {
        return res.status(400).json({
          success: false,
          message: 'Hệ thống chưa cấu hình role nhân viên. Vui lòng chạy migration role trước.',
        });
      }

      const employee = createResult.employee;
      return res.status(201).json({
        success: true,
        message: `Tạo tài khoản nhân viên thành công. Mật khẩu mặc định: ${DEFAULT_EMPLOYEE_PASSWORD}`,
        data: {
          id: employee.id,
          username: employee.username,
          email: employee.email,
          fullName: employee.full_name,
          phone: employee.phone,
          status: employee.status,
          roleCode: 'employee',
          roleName: 'Nhân viên',
          maxCampaigns: null,
          maxZaloAccounts: null,
          maxEmailAccounts: null,
          maxEmailTemplates: null,
          maxZaloTemplates: null,
          maxLandingPages: null,
          createdAt: employee.created_at,
        },
      });
    } catch (error) {
      console.error('Create employee error:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  /**
   * Cập nhật trạng thái tài khoản nhân viên (active/inactive).
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async updateEmployeeStatus(req, res) {
    try {
      const employeeId = Number.parseInt(req.params.id, 10);
      const { status } = req.body;

      if (!Number.isFinite(employeeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID nhân viên không hợp lệ',
        });
      }

      const employee = await updateLegacyEmployeeStatus(employeeId, status);

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy nhân viên',
        });
      }

      return res.json({
        success: true,
        message: 'Cập nhật trạng thái nhân viên thành công',
        data: {
          id: employee.id,
          status: employee.status,
        },
      });
    } catch (error) {
      console.error('Update employee status error:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  /**
   * Reset mật khẩu tài khoản nhân viên về mật khẩu mặc định.
   *
   * Luồng hoạt động:
   * 1. Xác thực id nhân viên hợp lệ.
   * 2. Hash lại mật khẩu mặc định của hệ thống.
   * 3. Chỉ cập nhật user có role employee để tránh ảnh hưởng tài khoản admin.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async resetEmployeePassword(req, res) {
    try {
      const employeeId = Number.parseInt(req.params.id, 10);

      if (!Number.isFinite(employeeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID nhân viên không hợp lệ',
        });
      }

      const passwordHash = await bcrypt.hash(DEFAULT_EMPLOYEE_PASSWORD, 10);
      const employee = await resetLegacyEmployeePassword(employeeId, passwordHash);

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy nhân viên',
        });
      }

      return res.json({
        success: true,
        message: `Reset mật khẩu thành công. Mật khẩu mặc định: ${DEFAULT_EMPLOYEE_PASSWORD}`,
        data: {
          id: employee.id,
        },
      });
    } catch (error) {
      console.error('Reset employee password error:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  /**
   * Cập nhật bộ giới hạn tài nguyên cho tài khoản nhân viên.
   *
   * Luồng hoạt động:
   * 1. Xác thực id nhân viên hợp lệ và xác định các trường cần cập nhật.
   * 2. Chuẩn hóa giá trị limit (null = không giới hạn, số >= 0 = giới hạn cụ thể).
   * 3. Chỉ cho phép cập nhật user có role employee để tránh sửa nhầm tài khoản admin.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async updateEmployeeLimits(req, res) {
    try {
      const employeeId = Number.parseInt(req.params.id, 10);

      if (!Number.isFinite(employeeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID nhân viên không hợp lệ',
        });
      }

      const entries = Object.entries(EMPLOYEE_LIMIT_KEYS)
        .map(([requestKey, dbColumn]) => ({
          requestKey,
          dbColumn,
          value: normalizeLimitValue(req.body[requestKey]),
        }))
        .filter((item) => item.value !== undefined);

      if (entries.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng truyền ít nhất 1 trường giới hạn cần cập nhật',
        });
      }

      let employee;
      try {
        employee = await updateLegacyEmployeeLimits(employeeId, entries);
      } catch (queryError) {
        if (isMissingLimitColumnError(queryError)) {
          return res.status(400).json({
            success: false,
            message: 'Hệ thống chưa có cột giới hạn tài khoản. Vui lòng chạy migration mới nhất.',
          });
        }
        throw queryError;
      }

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy nhân viên',
        });
      }

      return res.json({
        success: true,
        message: 'Cập nhật giới hạn tài khoản nhân viên thành công',
        data: {
          id: employee.id,
          maxCampaigns: employee.max_campaigns,
          maxZaloAccounts: employee.max_zalo_accounts,
          maxEmailAccounts: employee.max_email_accounts,
          maxEmailTemplates: employee.max_email_templates,
          maxZaloTemplates: employee.max_zalo_templates,
          maxLandingPages: employee.max_landing_pages,
        },
      });
    } catch (error) {
      console.error('Update employee limits error:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  /**
   * Lấy lịch sử mua gói dịch vụ của user đang đăng nhập.
   * Tìm theo user_id hoặc user_email để bắt cả đơn cũ tạo trước khi có cột user_id.
   */
  async getMyOrders(req, res) {
    try {
      const userId = req.user.id;
      const userEmail = req.user.email;

      const orders = await findSuccessfulOrdersForUser({ userId, userEmail });

      res.json({
        success: true,
        data: orders.map((row) => ({
          id: row.id,
          orderCode: String(row.order_code),
          amount: Number(row.amount),
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          plan: row.plan_id ? {
            id: row.plan_id,
            name: row.plan_name,
            code: row.plan_code,
            dailyEmailLimit: row.daily_email_limit,
            monthlyEmailLimit: row.monthly_email_limit,
            dailyZaloLimit: row.daily_zalo_limit,
            monthlyZaloLimit: row.monthly_zalo_limit,
          } : null,
        })),
      });
    } catch (error) {
      console.error('Get my orders error:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }
}

export default new UserController();

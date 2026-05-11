import db from '../config/database.js';
import bcrypt from 'bcryptjs';

const DEFAULT_EMPLOYEE_PASSWORD = 'digiso@2026';
const EMPLOYEE_LIMIT_KEYS = {
  maxCampaigns: 'max_campaigns',
  maxZaloAccounts: 'max_zalo_accounts',
  maxEmailAccounts: 'max_email_accounts',
  maxEmailTemplates: 'max_email_templates',
  maxZaloTemplates: 'max_zalo_templates',
  maxLandingPages: 'max_landing_pages',
};
const PROFILE_LIMIT_COLUMNS = `
  u.max_campaigns,
  u.max_zalo_accounts,
  u.max_email_accounts,
  u.max_email_templates,
  u.max_zalo_templates,
  u.max_landing_pages
`;

const PLAN_COLUMNS = `
  p.id          AS plan_id,
  p.name        AS plan_name,
  p.code        AS plan_code,
  p.price       AS plan_price,
  p.features    AS plan_features,
  p.max_employees AS plan_max_employees,
  p.daily_email_limit,
  p.monthly_email_limit,
  p.daily_zalo_limit,
  p.monthly_zalo_limit
`;

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
  activePlanId: userRow.plan_id ?? null,
  activePlanName: userRow.plan_name ?? null,
  activePlanCode: userRow.plan_code ?? null,
  activePlanPrice: userRow.plan_price ?? null,
  activePlanFeatures: userRow.plan_features ?? null,
  planMaxEmployees: userRow.plan_max_employees ?? null,
  dailyEmailLimit: userRow.daily_email_limit ?? null,
  monthlyEmailLimit: userRow.monthly_email_limit ?? null,
  dailyZaloLimit: userRow.daily_zalo_limit ?? null,
  monthlyZaloLimit: userRow.monthly_zalo_limit ?? null,
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
      let result;
      try {
        result = await db.query(
          `SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.phone, u.status,
                  u.role, u.active_plan_id, u.subscription_expires_at,
                  ${PROFILE_LIMIT_COLUMNS},
                  u.created_at, u.last_login_at, r.role_code, r.role_name
           FROM users u
           LEFT JOIN roles r ON u.id_role = r.id
           WHERE u.id = $1`,
          [userId]
        );
      } catch {
        // Fallback khi migration chưa chạy đủ (thiếu cột limit hoặc subscription_expires_at)
        result = await db.query(
          `SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.phone, u.status,
                  u.role, u.active_plan_id,
                  NULL AS subscription_expires_at,
                  NULL::int AS max_campaigns, NULL::int AS max_zalo_accounts,
                  NULL::int AS max_email_accounts, NULL::int AS max_email_templates,
                  NULL::int AS max_zalo_templates, NULL::int AS max_landing_pages,
                  u.created_at, u.last_login_at, NULL AS role_code, NULL AS role_name
           FROM users u WHERE u.id = $1`,
          [userId]
        );
      }

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
      }

      const userRow = result.rows[0];

      // 2. Resolve plan — active_plan_id first, then latest order by user_id OR user_email
      let planRow = null;
      try {
        const planResult = await db.query(
          `SELECT ${PLAN_COLUMNS}
           FROM plans p
           WHERE p.id = COALESCE(
             $1::int,
             (SELECT o.plan_id FROM orders o
              WHERE o.user_id = $2 OR o.user_email = $3
              ORDER BY o.created_at DESC LIMIT 1)
           )`,
          [userRow.active_plan_id || null, userId, userRow.email]
        );
        if (planResult.rows.length > 0) planRow = planResult.rows[0];
      } catch {
        // plan info is optional
      }

      // 3. Usage counts (best-effort)
      let usageCounts = { email_sent_today: 0, email_sent_month: 0, zalo_sent_today: 0, zalo_sent_month: 0 };
      try {
        const usageResult = await db.query(
          `SELECT
             COUNT(*) FILTER (WHERE cj.event_type = 'email_sent'
               AND cj.created_at >= CURRENT_DATE) AS email_sent_today,
             COUNT(*) FILTER (WHERE cj.event_type = 'email_sent'
               AND cj.created_at >= date_trunc('month', CURRENT_DATE)) AS email_sent_month,
             COUNT(*) FILTER (WHERE cj.event_type = 'zalo_sent'
               AND cj.created_at >= CURRENT_DATE) AS zalo_sent_today,
             COUNT(*) FILTER (WHERE cj.event_type = 'zalo_sent'
               AND cj.created_at >= date_trunc('month', CURRENT_DATE)) AS zalo_sent_month
           FROM customer_journey cj
           JOIN campaigns c ON cj.campaign_id = c.id
           WHERE c.id_user = $1`,
          [userId]
        );
        if (usageResult.rows.length > 0) usageCounts = usageResult.rows[0];
      } catch {
        // ignore
      }

      res.json({
        success: true,
        data: mapProfileResponse({ ...userRow, ...(planRow || {}), ...usageCounts }),
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
        const existingEmailResult = await db.query(
          `SELECT id
           FROM users
           WHERE email = $1 AND id <> $2
           LIMIT 1`,
          [email, userId]
        );
        if (existingEmailResult.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Email đã được sử dụng',
          });
        }
      }

      const result = await db.query(
        `UPDATE users SET 
          full_name = COALESCE($1, full_name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          avatar_url = COALESCE($4, avatar_url),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING id, username, email, full_name, avatar_url, phone`,
        [fullName, email, phone, avatarUrl, userId]
      );

      const user = result.rows[0];
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy người dùng',
        });
      }

      let roleAndLimitResult;
      try {
        roleAndLimitResult = await db.query(
          `SELECT r.role_code, r.role_name, ${PROFILE_LIMIT_COLUMNS},
                  u.status, u.created_at, u.last_login_at
           FROM users u
           LEFT JOIN roles r ON u.id_role = r.id
           WHERE u.id = $1
           LIMIT 1`,
          [userId]
        );
      } catch {
        // Fallback không dùng JOIN để tránh lỗi khi id_role hoặc các cột limit chưa tồn tại
        try {
          roleAndLimitResult = await db.query(
            `SELECT u.role AS role_code, u.role AS role_name,
                    NULL::int AS max_campaigns,
                    NULL::int AS max_zalo_accounts,
                    NULL::int AS max_email_accounts,
                    NULL::int AS max_email_templates,
                    NULL::int AS max_zalo_templates,
                    NULL::int AS max_landing_pages,
                    u.status, u.created_at, u.last_login_at
             FROM users u
             WHERE u.id = $1
             LIMIT 1`,
            [userId]
          );
        } catch {
          roleAndLimitResult = { rows: [] };
        }
      }

      const userProfileRow = {
        ...user,
        ...(roleAndLimitResult.rows[0] || {}),
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
      const userResult = await db.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy người dùng'
        });
      }

      // Kiểm tra mật khẩu hiện tại
      const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
      
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Mật khẩu hiện tại không đúng'
        });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Cập nhật mật khẩu
      await db.query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPasswordHash, userId]
      );

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
      let result;
      try {
        result = await db.query(
          `SELECT u.id, u.username, u.email, u.full_name, u.phone, u.status,
                  u.max_campaigns, u.max_zalo_accounts, u.max_email_accounts, u.max_email_templates, u.max_zalo_templates, u.max_landing_pages,
                  u.created_at, u.last_login_at, r.role_code, r.role_name
           FROM users u
           JOIN roles r ON u.id_role = r.id
           WHERE r.role_code = 'employee'
           ORDER BY u.created_at DESC, u.id DESC`
        );
      } catch (queryError) {
        if (!isMissingLimitColumnError(queryError)) throw queryError;

        // Fallback tương thích ngược khi DB chưa chạy migration cột giới hạn.
        result = await db.query(
          `SELECT u.id, u.username, u.email, u.full_name, u.phone, u.status,
                  u.created_at, u.last_login_at, r.role_code, r.role_name
           FROM users u
           JOIN roles r ON u.id_role = r.id
           WHERE r.role_code = 'employee'
           ORDER BY u.created_at DESC, u.id DESC`
        );
      }

      return res.json({
        success: true,
        data: result.rows.map((row) => ({
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
    const client = await db.getClient();
    try {
      const { username, email, fullName, phone } = req.body;

      await client.query('BEGIN');

      const existingUserResult = await client.query(
        `SELECT id
         FROM users
         WHERE username = $1 OR email = $2
         LIMIT 1`,
        [username, email]
      );
      if (existingUserResult.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Username hoặc email đã tồn tại',
        });
      }

      const employeeRoleResult = await client.query(
        `SELECT id
         FROM roles
         WHERE role_code = 'employee'
         LIMIT 1`
      );
      if (employeeRoleResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Hệ thống chưa cấu hình role nhân viên. Vui lòng chạy migration role trước.',
        });
      }

      const passwordHash = await bcrypt.hash(DEFAULT_EMPLOYEE_PASSWORD, 10);
      const createResult = await client.query(
        `INSERT INTO users (
          username, email, password_hash, full_name, phone, status, id_role, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'active', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, username, email, full_name, phone, status, created_at`,
        [
          username,
          email,
          passwordHash,
          fullName || null,
          phone || null,
          employeeRoleResult.rows[0].id,
        ]
      );

      await client.query('COMMIT');
      const employee = createResult.rows[0];
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
      await client.query('ROLLBACK');
      console.error('Create employee error:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    } finally {
      client.release();
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

      const result = await db.query(
        `UPDATE users u
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         FROM roles r
         WHERE u.id = $2
           AND u.id_role = r.id
           AND r.role_code = 'employee'
         RETURNING u.id, u.status`,
        [status, employeeId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy nhân viên',
        });
      }

      return res.json({
        success: true,
        message: 'Cập nhật trạng thái nhân viên thành công',
        data: {
          id: result.rows[0].id,
          status: result.rows[0].status,
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
      const result = await db.query(
        `UPDATE users u
         SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
         FROM roles r
         WHERE u.id = $2
           AND u.id_role = r.id
           AND r.role_code = 'employee'
         RETURNING u.id`,
        [passwordHash, employeeId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy nhân viên',
        });
      }

      return res.json({
        success: true,
        message: `Reset mật khẩu thành công. Mật khẩu mặc định: ${DEFAULT_EMPLOYEE_PASSWORD}`,
        data: {
          id: result.rows[0].id,
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

      const setClauses = entries.map((item, index) => `${item.dbColumn} = $${index + 1}`);
      const values = entries.map((item) => item.value);
      values.push(employeeId);

      const updateQuery = `
        UPDATE users u
        SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
        FROM roles r
        WHERE u.id = $${values.length}
          AND u.id_role = r.id
          AND r.role_code = 'employee'
        RETURNING
          u.id,
          u.max_campaigns,
          u.max_zalo_accounts,
          u.max_email_accounts,
          u.max_email_templates,
          u.max_zalo_templates,
          u.max_landing_pages
      `;

      let result;
      try {
        result = await db.query(updateQuery, values);
      } catch (queryError) {
        if (isMissingLimitColumnError(queryError)) {
          return res.status(400).json({
            success: false,
            message: 'Hệ thống chưa có cột giới hạn tài khoản. Vui lòng chạy migration mới nhất.',
          });
        }
        throw queryError;
      }

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy nhân viên',
        });
      }

      const employee = result.rows[0];
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

      const result = await db.query(
        `SELECT o.id, o.order_code, o.amount, o.status, o.created_at, o.updated_at,
                p.id AS plan_id, p.name AS plan_name, p.code AS plan_code,
                p.daily_email_limit, p.monthly_email_limit,
                p.daily_zalo_limit, p.monthly_zalo_limit
         FROM orders o
         LEFT JOIN plans p ON o.plan_id = p.id
         WHERE (o.user_id = $1 OR o.user_email = $2) AND o.status = 'success'
         ORDER BY o.created_at DESC
         LIMIT 20`,
        [userId, userEmail]
      );

      res.json({
        success: true,
        data: result.rows.map((row) => ({
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

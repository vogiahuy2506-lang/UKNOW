import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../config/database.js';

class AuthController {
  /**
   * Đăng ký tài khoản mới.
   * Tất cả user tự đăng ký đều là user_admin, active_plan_id = NULL cho đến khi mua gói.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async register(req, res) {
    const client = await db.getClient();

    try {
      const { username, email, password, fullName, phone } = req.body;

      const existingEmail = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      if (existingEmail.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Email đã được sử dụng' });
      }

      const existingUsername = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );
      if (existingUsername.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Tên đăng nhập đã được sử dụng' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await client.query(
        `INSERT INTO users (username, email, password_hash, full_name, phone, status, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', 'user_admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, username, email, full_name, avatar_url, status, role`,
        [username, email, passwordHash, fullName || null, phone || null]
      );

      const user = result.rows[0];
      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user, req);

      return res.status(201).json({
        success: true,
        message: 'Đăng ký thành công',
        data: {
          user: this.formatUser(user),
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      console.error('Register error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    } finally {
      client.release();
    }
  }

  /**
   * Đăng nhập bằng username/password.
   * Kiểm tra khóa tài khoản, xác thực mật khẩu, ghi log, trả về tokens.
   * @param {import('express').Request} req - body: { username, password }
   * @param {import('express').Response} res
   */
  async login(req, res) {
    const client = await db.getClient();

    try {
      const { username, password } = req.body;
      const ipAddress = req.ip || req.socket?.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await client.query(
        `SELECT id, username, email, full_name, avatar_url, status, role,
                active_plan_id, password_hash, failed_login_attempts, locked_until
         FROM users
         WHERE username = $1`,
        [username]
      );

      if (result.rows.length === 0) {
        await this.logLoginAttempt(client, null, username, 'failed', 'Username không tồn tại', ipAddress, userAgent);
        return res.status(401).json({
          success: false,
          message: 'Tên đăng nhập hoặc mật khẩu không đúng',
        });
      }

      const user = result.rows[0];

      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(403).json({
          success: false,
          message: 'Tài khoản đã bị khóa tạm thời. Vui lòng thử lại sau.',
        });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ success: false, message: 'Tài khoản đã bị vô hiệu hóa' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        const failedAttempts = (user.failed_login_attempts || 0) + 1;
        const lockedUntil = failedAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null;

        await client.query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [failedAttempts, lockedUntil, user.id]
        );
        await this.logLoginAttempt(client, user.id, username, 'failed', 'Mật khẩu không đúng', ipAddress, userAgent);

        return res.status(401).json({
          success: false,
          message: 'Tên đăng nhập hoặc mật khẩu không đúng',
        });
      }

      await client.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL,
          last_login_at = CURRENT_TIMESTAMP, last_login_ip = $1
         WHERE id = $2`,
        [ipAddress, user.id]
      );
      await this.logLoginAttempt(client, user.id, username, 'success', null, ipAddress, userAgent);

      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user, req);

      const responseUser = this.formatUser(user);

      // Với employee: lấy thêm permissions và ownerId từ user_members
      if (user.role === 'employee') {
        const memberResult = await client.query(
          `SELECT owner_id, permissions FROM user_members WHERE employee_id = $1 AND status = 'active'`,
          [user.id]
        );
        if (memberResult.rows[0]) {
          responseUser.ownerId = memberResult.rows[0].owner_id;
          responseUser.permissions = memberResult.rows[0].permissions;
        }
      }

      return res.json({
        success: true,
        message: 'Đăng nhập thành công',
        data: {
          user: responseUser,
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    } finally {
      client.release();
    }
  }

  /**
   * Làm mới access token bằng refresh token hợp lệ.
   * Thu hồi refresh token cũ và cấp cặp token mới.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async refreshToken(req, res) {
    const client = await db.getClient();

    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ success: false, message: 'Refresh token không được cung cấp' });
      }

      try {
        jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      } catch {
        return res.status(401).json({
          success: false,
          message: 'Refresh token không hợp lệ hoặc đã hết hạn',
        });
      }

      const tokenResult = await client.query(
        `SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.status, u.role, u.active_plan_id
         FROM refresh_tokens rt
         JOIN users u ON rt.id_user = u.id
         WHERE rt.token_hash = $1 AND rt.is_revoked = FALSE AND rt.expires_at > NOW()`,
        [this.hashToken(refreshToken)]
      );

      if (tokenResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token không tồn tại hoặc đã bị thu hồi',
        });
      }

      const user = tokenResult.rows[0];

      await client.query(
        `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE token_hash = $1`,
        [this.hashToken(refreshToken)]
      );

      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = await this.generateRefreshToken(user, req);

      return res.json({
        success: true,
        data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    } finally {
      client.release();
    }
  }

  /**
   * Đăng xuất: thu hồi refresh token.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async logout(req, res) {
    const client = await db.getClient();

    try {
      const { refreshToken } = req.body;
      const userId = req.user.id;

      if (refreshToken) {
        await client.query(
          `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = 'logout'
           WHERE token_hash = $1 AND id_user = $2`,
          [this.hashToken(refreshToken), userId]
        );
      }

      return res.json({ success: true, message: 'Đăng xuất thành công' });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    } finally {
      client.release();
    }
  }

  /**
   * Lấy thông tin user đang đăng nhập từ req.user (set bởi authMiddleware).
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getMe(req, res) {
    try {
      const user = req.user;
      const data = { user: this.formatUser(user) };

      if (user.role === 'employee') {
        data.user.ownerId = user.owner_id;
        data.user.permissions = user.permissions;
      }

      return res.json({ success: true, data });
    } catch (error) {
      console.error('Get me error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Chuẩn hóa object user trả về client — dùng chung cho register/login/getMe.
   */
  formatUser(user) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      role: user.role || 'user_admin',
      active_plan_id: user.active_plan_id ?? null,
    };
  }

  generateAccessToken(user) {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role || 'user_admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '3h' }
    );
  }

  async generateRefreshToken(user, req) {
    const token = jwt.sign(
      { userId: user.id, tokenId: uuidv4() },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO refresh_tokens (id_user, token_hash, device_info, ip_address, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [
        user.id,
        this.hashToken(token),
        req.headers['user-agent'] || null,
        req.ip || req.socket?.remoteAddress,
        expiresAt,
      ]
    );

    return token;
  }

  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async logLoginAttempt(client, userId, email, status, failureReason, ipAddress, userAgent) {
    await client.query(
      `INSERT INTO login_history (id_user, email, login_status, failure_reason, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [userId, email, status, failureReason, ipAddress, userAgent]
    );
  }
}

export default new AuthController();

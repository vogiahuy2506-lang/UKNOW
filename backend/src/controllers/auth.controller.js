import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../config/database.js';

class AuthController {
  /**
   * Đăng ký tài khoản mới.
   * Kiểm tra email/username trùng, hash password, tạo user và trả về tokens.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async register(req, res) {
    const client = await db.getClient();
    
    try {
      const { username, email, password, fullName, phone } = req.body;

      // Kiểm tra email đã tồn tại
      const existingEmail = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      
      if (existingEmail.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email đã được sử dụng'
        });
      }

      // Kiểm tra username đã tồn tại
      const existingUsername = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );
      
      if (existingUsername.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Tên đăng nhập đã được sử dụng'
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      // Tạo user mới
      const result = await client.query(
        `INSERT INTO users (username, email, password_hash, full_name, phone, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, username, email, full_name, avatar_url, status, created_at`,
        [username, email, passwordHash, fullName || null, phone || null]
      );

      const createdUser = result.rows[0];
      const user = (await this.getUserWithRoleById(client, createdUser.id)) || createdUser;

      // Tạo token
      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user, req);

      res.status(201).json({
        success: true,
        message: 'Đăng ký thành công',
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            avatarUrl: user.avatar_url,
            roleCode: user.role_code || 'employee',
            roleName: user.role_name || 'Nhân viên',
          },
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
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

      // Tìm user theo username
      const result = await this.getUserWithRoleByUsername(client, username);

      if (result.rows.length === 0) {
        await this.logLoginAttempt(client, null, username, 'failed', 'Username không tồn tại', ipAddress, userAgent);
        
        return res.status(401).json({
          success: false,
          message: 'Tên đăng nhập hoặc mật khẩu không đúng'
        });
      }

      const user = result.rows[0];

      // Kiểm tra tài khoản bị khóa
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(403).json({
          success: false,
          message: 'Tài khoản đã bị khóa tạm thời. Vui lòng thử lại sau.'
        });
      }

      // Kiểm tra trạng thái tài khoản
      if (user.status !== 'active') {
        return res.status(403).json({
          success: false,
          message: 'Tài khoản đã bị vô hiệu hóa'
        });
      }

      // Kiểm tra password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        // Tăng số lần đăng nhập thất bại
        const failedAttempts = (user.failed_login_attempts || 0) + 1;
        let lockedUntil = null;
        
        if (failedAttempts >= 5) {
          lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Khóa 30 phút
        }
        
        await client.query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [failedAttempts, lockedUntil, user.id]
        );

        await this.logLoginAttempt(client, user.id, username, 'failed', 'Mật khẩu không đúng', ipAddress, userAgent);
        
        return res.status(401).json({
          success: false,
          message: 'Tên đăng nhập hoặc mật khẩu không đúng'
        });
      }

      // Reset số lần đăng nhập thất bại và cập nhật last login
      await client.query(
        `UPDATE users SET 
          failed_login_attempts = 0, 
          locked_until = NULL,
          last_login_at = CURRENT_TIMESTAMP,
          last_login_ip = $1
         WHERE id = $2`,
        [ipAddress, user.id]
      );

      // Log login success
      await this.logLoginAttempt(client, user.id, username, 'success', null, ipAddress, userAgent);

      // Tạo token
      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user, req);

      res.json({
        success: true,
        message: 'Đăng nhập thành công',
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            avatarUrl: user.avatar_url,
            roleCode: user.role_code || 'employee',
            roleName: user.role_name || 'Nhân viên',
          },
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
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
        return res.status(400).json({
          success: false,
          message: 'Refresh token không được cung cấp'
        });
      }

      // Verify refresh token
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      } catch (error) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token không hợp lệ hoặc đã hết hạn'
        });
      }

      // Kiểm tra token trong database
      let tokenResult;
      try {
        tokenResult = await client.query(
          `SELECT rt.*, u.*, r.role_code, r.role_name
           FROM refresh_tokens rt
           JOIN users u ON rt.id_user = u.id
           LEFT JOIN roles r ON u.id_role = r.id
           WHERE rt.token_hash = $1 AND rt.is_revoked = FALSE AND rt.expires_at > NOW()`,
          [this.hashToken(refreshToken)]
        );
      } catch {
        tokenResult = await client.query(
          `SELECT rt.*, u.*
           FROM refresh_tokens rt
           JOIN users u ON rt.id_user = u.id
           WHERE rt.token_hash = $1 AND rt.is_revoked = FALSE AND rt.expires_at > NOW()`,
          [this.hashToken(refreshToken)]
        );
      }

      if (tokenResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token không tồn tại hoặc đã bị thu hồi'
        });
      }

      const user = tokenResult.rows[0];

      // Revoke old refresh token
      await client.query(
        `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW() WHERE token_hash = $1`,
        [this.hashToken(refreshToken)]
      );

      // Generate new tokens
      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = await this.generateRefreshToken(user, req);

      res.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken
        }
      });
    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
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
        // Revoke refresh token
        await client.query(
          `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = 'logout'
           WHERE token_hash = $1 AND id_user = $2`,
          [this.hashToken(refreshToken), userId]
        );
      }

      res.json({
        success: true,
        message: 'Đăng xuất thành công'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
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
      res.json({
        success: true,
        data: {
          user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            fullName: req.user.full_name,
            avatarUrl: req.user.avatar_url,
            roleCode: req.user.role_code || 'employee',
            roleName: req.user.role_name || 'Nhân viên',
          }
        }
      });
    } catch (error) {
      console.error('Get me error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  // Helper methods
  generateAccessToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        roleCode: user.role_code || user.roleCode || 'employee',
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
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
        expiresAt
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

  async getUserWithRoleById(client, userId) {
    try {
      const result = await client.query(
        `SELECT u.*, r.role_code, r.role_name
         FROM users u
         LEFT JOIN roles r ON u.id_role = r.id
         WHERE u.id = $1
         LIMIT 1`,
        [userId]
      );
      return result.rows[0] || null;
    } catch {
      const result = await client.query(
        'SELECT * FROM users WHERE id = $1 LIMIT 1',
        [userId]
      );
      return result.rows[0] || null;
    }
  }

  async getUserWithRoleByUsername(client, username) {
    try {
      const result = await client.query(
        `SELECT u.*, r.role_code, r.role_name
         FROM users u
         LEFT JOIN roles r ON u.id_role = r.id
         WHERE u.username = $1`,
        [username]
      );
      return result;
    } catch {
      return client.query('SELECT * FROM users WHERE username = $1', [username]);
    }
  }
}

export default new AuthController();

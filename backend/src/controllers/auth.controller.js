import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../config/database.js';
import verificationService from '../services/verification.service.js';
import { sendSystemEmail, buildWelcomeEmail } from '../utils/systemEmail.util.js';
import {
  findActiveUserByEmail,
  updatePasswordByEmail,
  activateUserByEmail,
  findMembershipsByEmployeeId,
  insertRefreshToken,
  revokeAllRefreshTokensForUser,
  findActiveBillingPeriod,
} from '../repositories/user/user.repository.js';
import { OAuth2Client } from 'google-auth-library';
import { logSystem, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getSystemAuditContext } from '../utils/auditContext.util.js';
import { grantSignupTrial } from '../services/user/signupTrial.service.js';
import { grantSignupTrialInTx } from '../services/user/signupTrialTx.service.js';
import { normalizePhoneForZaloCampaign, isValidNormalizedPhoneLength } from '../utils/zaloPhoneCampaign.util.js';
import { pushMemberToSheet } from '../utils/memberSheetSync.util.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const REFRESH_TOKEN_COOKIE = 'refreshToken';
const REFRESH_TOKEN_PATH = '/api/auth';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';

/**
 * Cửa sổ bỏ qua khi token vừa bị thu hồi — hai tab dùng chung cookie sẽ cùng gửi
 * một token, tab chậm hơn không phải kẻ trộm.
 * Hằng số trải nghiệm, KHÔNG đọc từ env: nới rộng là mở đường cho kẻ trộm thật.
 * So sánh grace diễn ra trong SQL (`INTERVAL '1 second' * $2`) — một nguồn duy nhất.
 */
const REFRESH_REUSE_GRACE_SECONDS = 10;

class AuthController {
  setRefreshTokenCookie(res, token, rememberMe = true) {
    res.cookie(REFRESH_TOKEN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: REFRESH_TOKEN_PATH,
      ...(rememberMe ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
    });
  }

  clearRefreshTokenCookie(res) {
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_TOKEN_PATH });
  }
  /**
   * Đăng ký tài khoản mới.
   * Tất cả user tự đăng ký đều là user_admin, active_plan_id = NULL cho đến khi mua gói.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async register(req, res) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');
      const { username, email, password, fullName, phone, emailVerificationCode } = req.body;

      // Xác minh OTP email trước khi tạo tài khoản
      // Mọi kiểm tra dưới đây throw (thay vì return trực tiếp) để luôn đi qua catch
      // bên dưới — sau BEGIN, return thẳng sẽ bỏ qua COMMIT/ROLLBACK, để lại transaction
      // dang dở trên connection lúc release() về pool, làm hỏng connection cho lượt sau.
      if (!emailVerificationCode) {
        throw { status: 400, message: 'Vui lòng xác minh email trước khi đăng ký' };
      }
      const verification = await verificationService.verifyCode(email, emailVerificationCode);
      if (!verification) {
        throw { status: 400, message: 'Mã xác minh email không đúng hoặc đã hết hạn' };
      }

      const existingEmail = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
        [email]
      );
      if (existingEmail.rows.length > 0) {
        throw { status: 400, message: 'Email đã được sử dụng' };
      }

      const existingUsername = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );
      if (existingUsername.rows.length > 0) {
        throw { status: 400, message: 'Tên đăng nhập đã được sử dụng' };
      }

      // SĐT bắt buộc — một số chỉ được gắn với 1 tài khoản (idx_users_phone_unique, migration 179).
      const normalizedPhone = normalizePhoneForZaloCampaign(phone);
      if (!isValidNormalizedPhoneLength(normalizedPhone)) {
        throw { status: 400, message: 'Số điện thoại không hợp lệ' };
      }
      const existingPhone = await client.query(
        'SELECT id FROM users WHERE phone = $1',
        [normalizedPhone]
      );
      if (existingPhone.rows.length > 0) {
        throw {
          status: 409,
          code: 'PHONE_TAKEN',
          message: 'Số điện thoại này đã được dùng cho một tài khoản khác. Vui lòng dùng số khác.',
        };
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await client.query(
        `INSERT INTO users (username, email, password_hash, full_name, phone, status, is_verified, verified_at, role, auth_provider, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', true, CURRENT_TIMESTAMP, 'user', 'local', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, username, email, full_name, avatar_url, status, role, phone`,
        [username, email, passwordHash, fullName || null, normalizedPhone]
      );

      const user = result.rows[0];

      // Đánh dấu mã xác minh đã dùng
      await verificationService.markCodeAsUsed(verification.id);

      // Auto-grant trial trong cùng transaction. Lỗi cấu hình trial được cô lập
      // ở savepoint; lỗi hạ tầng hoặc không khôi phục được savepoint sẽ throw để
      // handler rollback toàn bộ đăng ký.
      const trial = await grantSignupTrialInTx(client, { userId: user.id, userEmail: user.email });
      if (trial) {
        user.active_plan_id = trial.activePlanId;
        user.subscription_expires_at = trial.expiresAt;
        await logSystem(getSystemAuditContext(req), AUDIT_ACTIONS.USER_PLAN_CHANGED, AUDIT_ENTITY_TYPES.USER, user.id, {
          source: 'signup_auto_trial',
          planCode: trial.planCode,
          expiresAt: trial.expiresAt,
        });
      }

      await client.query('COMMIT');

      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user, req);
      this.setRefreshTokenCookie(res, refreshToken);

      await logSystem(getSystemAuditContext(req), AUDIT_ACTIONS.USER_REGISTERED, AUDIT_ENTITY_TYPES.USER, user.id, { username: user.username, email: user.email });

      // Gửi Welcome Email (async, không block response)
      const { full_name, email: userEmail } = user;
      const welcome = buildWelcomeEmail({
        fullName: full_name,
        email: userEmail,
        loginUrl: `${FRONTEND_URL}/login`,
      });
      sendSystemEmail({
        to: userEmail,
        subject: welcome.subject,
        html: welcome.html,
      }).catch((err) => console.error('[WelcomeEmail] Failed to send:', err.message));

      // Đẩy sang Google Sheet thành viên (async, không block response — xem
      // memberSheetSync.util.js). User vừa tạo trong transaction này chắc chắn
      // chưa thể là nhân viên của ai (user_members chỉ gắn được SAU khi đã có id),
      // nên không cần kiểm isCurrentlyAnyonesEmployee ở đây như PUT /me/phone.
      pushMemberToSheet({
        email: userEmail,
        phone: user.phone,
        fullName: full_name,
        createdAt: new Date(),
      }).catch((err) => console.warn('[MemberSheet] Failed to push:', err.message));

      return res.status(201).json({
        success: true,
        message: 'Đăng ký thành công',
        data: {
          user: await this.formatUser(user),
          accessToken,
          trial,
        },
      });
    } catch (error) {
      console.error('Register error:', error);
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Register rollback failed:', rollbackErr?.message || rollbackErr);
      }

      // Xử lý lỗi unique constraint từ DB (nếu manual check bị lọt do race condition)
      if (error.code === '23505') {
        const detail = error.detail || '';
        if (detail.includes('email')) {
          return res.status(400).json({ success: false, message: 'Email đã được sử dụng' });
        }
        if (detail.includes('username')) {
          return res.status(400).json({ success: false, message: 'Tên đăng nhập đã được sử dụng' });
        }
        if (detail.includes('phone')) {
          return res.status(409).json({
            success: false,
            code: 'PHONE_TAKEN',
            message: 'Số điện thoại này đã được dùng cho một tài khoản khác. Vui lòng dùng số khác.',
          });
        }
      }

      // Lỗi đã gắn status (validation OTP/email/username/phone phía trên throw kiểu này,
      // hoặc lỗi từ trial grant như race unique order_code — status 409)
      if (error.status && typeof error.message === 'string') {
        return res.status(error.status).json({
          success: false,
          message: error.message,
          ...(error.code ? { code: error.code } : {}),
        });
      }

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
    let client;
    try {
      client = await db.getClient();
    } catch (connError) {
      console.error('Login - DB connection error:', connError.message);
      return res.status(503).json({
        success: false,
        message: 'Không thể kết nối database. Vui lòng thử lại.',
      });
    }

    try {
      const { username, password, rememberMe = true } = req.body;
      const ipAddress = req.ip || req.socket?.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await client.query(
        `SELECT id, username, email, full_name, avatar_url, status, role,
                active_plan_id, password_hash, failed_login_attempts, locked_until,
                must_change_password, phone
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
        await this.logLoginAttempt(client, user.id, user.email, 'failed', 'Mật khẩu không đúng', ipAddress, userAgent);

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
      await this.logLoginAttempt(client, user.id, user.email, 'success', null, ipAddress, userAgent);

      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user, req);
      this.setRefreshTokenCookie(res, refreshToken, rememberMe);

      const responseUser = await this.formatUser(user);

      // Lấy memberships để frontend hiện Context Switcher ngay sau login
      const membershipsResult = await client.query(
        `SELECT um.owner_id AS "ownerId", u.full_name AS "ownerName",
                u.username AS "ownerUsername", u.avatar_url AS "ownerAvatarUrl",
                um.permissions, um.status,
                um.daily_email_limit AS "dailyEmailLimit", um.monthly_email_limit AS "monthlyEmailLimit",
                um.daily_zalo_limit AS "dailyZaloLimit", um.monthly_zalo_limit AS "monthlyZaloLimit"
         FROM user_members um
         JOIN users u ON u.id = um.owner_id
         WHERE um.employee_id = $1 AND um.status = 'active'
         ORDER BY um.created_at ASC`,
        [user.id]
      );
      responseUser.memberships = membershipsResult.rows;

      return res.json({
        success: true,
        message: 'Đăng nhập thành công',
        data: {
          user: responseUser,
          accessToken,
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
   * Đăng nhập hoặc đăng ký bằng Google
   * @param {import('express').Request} req - body: { credential }
   * @param {import('express').Response} res
   */
  async googleLogin(req, res) {
    const client = await db.getClient();

    try {
      const { credential, access_token } = req.body;
      const ipAddress = req.ip || req.socket?.remoteAddress;
      const userAgent = req.headers['user-agent'];

      if (!credential && !access_token) {
        return res.status(400).json({ success: false, message: 'Thiếu Google credential' });
      }

      // 1. Verify Google token (ID token or access token)
      let email, name, picture;
      if (credential) {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        // Cùng luật với nhánh access_token bên dưới — email chưa xác thực thì bất kỳ
        // ai cũng khai được địa chỉ của người khác rồi chiếm tài khoản qua email đó.
        if (!payload.email_verified) {
          return res.status(401).json({ success: false, message: 'Email Google chưa được xác thực' });
        }
        email = payload.email;
        name = payload.name;
        picture = payload.picture;
      } else {
        const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (!resp.ok) {
          return res.status(401).json({ success: false, message: 'Google access token không hợp lệ' });
        }
        const info = await resp.json();
        if (!info.email_verified) {
          return res.status(401).json({ success: false, message: 'Email Google chưa được xác thực' });
        }
        email = info.email;
        name = info.name;
        picture = info.picture;
      }

      if (!email) {
        return res.status(400).json({ success: false, message: 'Không thể lấy email từ Google' });
      }

      // 2. Check if user exists
      let result = await client.query(
        `SELECT id, username, email, full_name, avatar_url, status, role,
                active_plan_id, password_hash, failed_login_attempts, locked_until, phone
         FROM users
         WHERE LOWER(email) = LOWER($1)`,
        [email]
      );

      let user;
      let trial = null;

      // 3. Nếu chưa tồn tại, tạo mới
      if (result.rows.length === 0) {
        // Tạo username từ email
        let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
        if (baseUsername.length < 3) baseUsername += 'user';
        
        // Đảm bảo username là unique
        let username = baseUsername;
        let suffix = 1;
        while (true) {
          const checkUser = await client.query('SELECT id FROM users WHERE username = $1', [username]);
          if (checkUser.rows.length === 0) break;
          username = `${baseUsername}${suffix}`;
          suffix++;
        }

        // Random password for Google users
        const randomPassword = crypto.randomBytes(16).toString('hex');
        const passwordHash = await bcrypt.hash(randomPassword, 10);

        const insertResult = await client.query(
          `INSERT INTO users (username, email, password_hash, full_name, avatar_url, is_verified, status, role, auth_provider, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, true, 'active', 'user', 'google', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING id, username, email, full_name, avatar_url, status, role`,
          [username, email, passwordHash, name || null, picture || null]
        );
        user = insertResult.rows[0];

        trial = await grantSignupTrial({ userId: user.id, userEmail: user.email, req });
        if (trial) {
          user.active_plan_id = trial.activePlanId;
          user.subscription_expires_at = trial.expiresAt;
          await logSystem(getSystemAuditContext(req), AUDIT_ACTIONS.USER_PLAN_CHANGED, AUDIT_ENTITY_TYPES.USER, user.id, {
            source: 'signup_auto_trial',
            planCode: trial.planCode,
            expiresAt: trial.expiresAt,
          });
        }

        // Gửi Welcome Email cho user mới đăng ký qua Google (async)
        const { full_name, email: userEmail } = user;
        const welcome = buildWelcomeEmail({
          fullName: full_name,
          email: userEmail,
          loginUrl: `${FRONTEND_URL}/login`,
        });
        sendSystemEmail({
          to: userEmail,
          subject: welcome.subject,
          html: welcome.html,
        }).catch((err) => console.error('[WelcomeEmail] Failed to send:', err.message));
      } else {
        user = result.rows[0];

        // Nếu status không active
        if (user.status !== 'active') {
          return res.status(403).json({ success: false, message: 'Tài khoản đã bị vô hiệu hóa' });
        }
        // TEMPORARILY DISABLED: login lockout check (Google OAuth)
        // if (user.locked_until && new Date(user.locked_until) > new Date()) {
        //   return res.status(403).json({
        //     success: false,
        //     message: 'Tài khoản đã bị khóa tạm thời. Vui lòng thử lại sau.',
        //   });
        // }
        // Cập nhật thông tin profile nếu có thay đổi từ Google
        if (user.full_name !== name || user.avatar_url !== picture || !user.is_verified) {
          await client.query(
            'UPDATE users SET full_name = COALESCE($1, full_name), avatar_url = COALESCE($2, avatar_url), is_verified = true, updated_at = NOW() WHERE id = $3',
            [name, picture, user.id]
          );
          user.full_name = name || user.full_name;
          user.avatar_url = picture || user.avatar_url;
        }
      }

      // 4. Update login status
      await client.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL,
          last_login_at = CURRENT_TIMESTAMP, last_login_ip = $1
         WHERE id = $2`,
        [ipAddress, user.id]
      );
      await this.logLoginAttempt(client, user.id, user.email, 'success', 'google', ipAddress, userAgent);

      // 5. Generate tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = await this.generateRefreshToken(user, req);
      this.setRefreshTokenCookie(res, refreshToken);

      const responseUser = await this.formatUser(user);

      const membershipsResult = await client.query(
        `SELECT um.owner_id AS "ownerId", u.full_name AS "ownerName",
                u.username AS "ownerUsername", u.avatar_url AS "ownerAvatarUrl",
                um.permissions, um.status,
                um.daily_email_limit AS "dailyEmailLimit", um.monthly_email_limit AS "monthlyEmailLimit",
                um.daily_zalo_limit AS "dailyZaloLimit", um.monthly_zalo_limit AS "monthlyZaloLimit"
         FROM user_members um
         JOIN users u ON u.id = um.owner_id
         WHERE um.employee_id = $1 AND um.status = 'active'
         ORDER BY um.created_at ASC`,
        [user.id]
      );
      responseUser.memberships = membershipsResult.rows;

      return res.json({
        success: true,
        message: 'Đăng nhập Google thành công',
        data: {
          user: responseUser,
          accessToken,
          trial,
        },
      });
    } catch (error) {
      console.error('Google Login error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi đăng nhập bằng Google' });
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
      const refreshToken = req.cookies?.refreshToken;

      if (!refreshToken) {
        return res.status(400).json({ success: false, message: 'Refresh token không được cung cấp' });
      }

      try {
        jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      } catch {
        this.clearRefreshTokenCookie(res);
        return res.status(401).json({
          success: false,
          message: 'Refresh token không hợp lệ hoặc đã hết hạn',
        });
      }

      const tokenResult = await client.query(
        `SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.status, u.role, u.active_plan_id
         FROM refresh_tokens rt
         JOIN users u ON rt.id_user = u.id
         -- u.status BẮT BUỘC có ở đây: thiếu nó thì khoá tài khoản không cắt được
         -- phiên, họ vẫn xoay token mới đều tới khi refresh token hết hạn (7 ngày).
         WHERE rt.token_hash = $1 AND rt.is_revoked = FALSE AND rt.expires_at > NOW()
           AND u.status = 'active'`,
        [this.hashToken(refreshToken)]
      );

      if (tokenResult.rows.length === 0) {
        const presentedHash = this.hashToken(refreshToken);
        // Chỉ coi là reuse khi token bị thu hồi do *xoay* (revoked_reason NULL).
        // logout / password_changed / reuse_detected không phải dấu hiệu trộm —
        // thiết bị cũ gửi lại token đó không được đá các phiên mới.
        // Token đã quá expires_at cũng bỏ qua: không còn mối đe doạ.
        const reuseLookup = await client.query(
          `SELECT id_user AS "userId",
                  revoked_at AS "revokedAt",
                  ip_address AS "ipAddress",
                  device_info AS "deviceInfo",
                  (
                    is_revoked = TRUE
                    AND revoked_reason IS NULL
                    AND expires_at > NOW()
                    AND revoked_at IS NOT NULL
                    AND revoked_at <= NOW() - make_interval(secs => $2)
                  ) AS "reuseSuspect"
           FROM refresh_tokens
           WHERE token_hash = $1
           LIMIT 1`,
          [presentedHash, REFRESH_REUSE_GRACE_SECONDS]
        );

        const hit = reuseLookup.rows[0];
        if (hit?.reuseSuspect === true) {
          console.warn('[Auth][ReuseDetected]', {
            userId: hit.userId,
            ipAddress: hit.ipAddress,
            deviceInfo: hit.deviceInfo,
            revokedAt: hit.revokedAt,
          });
          await revokeAllRefreshTokensForUser(hit.userId, 'reuse_detected');
        }

        this.clearRefreshTokenCookie(res);
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
      this.setRefreshTokenCookie(res, newRefreshToken);

      return res.json({
        success: true,
        data: { accessToken: newAccessToken },
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
      const refreshToken = req.cookies?.refreshToken;
      const userId = req.user.id;

      if (refreshToken) {
        await client.query(
          `UPDATE refresh_tokens SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = 'logout'
           WHERE token_hash = $1 AND id_user = $2`,
          [this.hashToken(refreshToken), userId]
        );
      }

      this.clearRefreshTokenCookie(res);
      return res.json({ success: true, message: 'Đăng xuất thành công' });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    } finally {
      client.release();
    }
  }

  /**
   * Gửi email đặt lại mật khẩu.
   * POST /auth/forgot-password — body: { email }
   * Luôn trả 200 để không lộ email có tồn tại hay không.
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const user = await findActiveUserByEmail(email);

      if (user) {
        await verificationService.sendPasswordReset(email);
      }

      return res.json({
        success: true,
        message: 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.',
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * Đặt lại mật khẩu bằng token từ email.
   * POST /auth/reset-password — body: { token, password }
   */
  async resetPassword(req, res) {
    try {
      const { token, password } = req.body;

      const record = await verificationService.findPasswordResetToken(token);
      if (!record) {
        return res.status(400).json({ success: false, message: 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const updated = await updatePasswordByEmail(passwordHash, record.email);

      if (!updated) {
        return res.status(400).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa' });
      }

      await revokeAllRefreshTokensForUser(updated.id, 'password_changed');
      await verificationService.markCodeAsUsed(record.id);

      return res.json({ success: true, message: 'Đặt lại mật khẩu thành công' });
    } catch (error) {
      console.error('Reset password error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * Kích hoạt tài khoản nhân viên — đặt mật khẩu do user tự chọn và chuyển status sang active.
   * POST /auth/activate — body: { token, password }
   */
  async activateAccount(req, res) {
    try {
      const { token, password } = req.body;

      const invitation = await verificationService.findInvitationByToken(token);
      if (!invitation) {
        return res.status(400).json({ success: false, message: 'Link kích hoạt không hợp lệ hoặc đã hết hạn' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const activated = await activateUserByEmail(passwordHash, invitation.email);

      if (!activated) {
        return res.status(400).json({ success: false, message: 'Tài khoản đã được kích hoạt trước đó', code: 'ALREADY_ACTIVATED' });
      }

      await verificationService.markCodeAsUsed(invitation.id);

      return res.json({
        success: true,
        message: 'Kích hoạt tài khoản thành công',
        data: { username: activated.username },
      });
    } catch (error) {
      console.error('Activate account error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * Đổi mật khẩu khi bị yêu cầu (must_change_password = TRUE).
   * POST /auth/change-password — body: { currentPassword, newPassword }
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      const isValid = await bcrypt.compare(currentPassword, req.user.password_hash);
      if (!isValid) {
        return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      const client = await db.getClient();
      try {
        await client.query(
          `UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2`,
          [passwordHash, userId]
        );
        await client.query(
          `UPDATE refresh_tokens
           SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = 'password_changed'
           WHERE id_user = $1 AND is_revoked = FALSE`,
          [userId]
        );
      } finally {
        client.release();
      }

      return res.json({ success: true, message: 'Đổi mật khẩu thành công' });
    } catch (error) {
      console.error('Change password error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * Lấy thông tin user đang đăng nhập từ req.user (set bởi authMiddleware).
   * Trả thêm memberships[] — danh sách các tài khoản owner mà user đang là employee.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getMe(req, res) {
    try {
      const user = req.user;
      const formatted = await this.formatUser(user);

      // Lấy danh sách tổ chức mà user đang là employee (để hiện Context Switcher)
      formatted.memberships = await findMembershipsByEmployeeId(user.id);

      return res.json({ success: true, data: { user: formatted } });
    } catch (error) {
      console.error('Get me error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Chuẩn hóa object user trả về client — dùng chung cho register/login/getMe.
   */
  async formatUser(user) {
    const expiresAt = user.subscription_expires_at ?? null;
    const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
    let activeBillingPeriod = user.active_billing_period || user.activeBillingPeriod;
    if (!activeBillingPeriod && user.id) {
      activeBillingPeriod = await findActiveBillingPeriod(user.id, user.email);
    }
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      role: user.role || 'user',
      active_plan_id: user.active_plan_id ?? null,
      activePlanId: user.active_plan_id ?? user.plan_id ?? null,
      activeBillingPeriod: activeBillingPeriod || 'monthly',
      subscriptionExpiresAt: expiresAt,
      subscriptionExpired: isExpired,
      isReturningCustomer: expiresAt !== null,
      // Frontend dựa vào cờ này để ép mở form đổi mật khẩu ngay sau đăng nhập.
      // Thiếu nó thì mọi request sau đó bị requirePasswordChange trả 403 mà
      // người dùng không hiểu vì sao.
      mustChangePassword: user.must_change_password === true,
      // Cùng lý do như trên nhưng cho requirePhone — thiếu field này thì frontend
      // không biết mở modal bổ sung SĐT.
      phone: user.phone ?? null,
    };
  }

  generateAccessToken(user) {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role || 'user' },
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

    await insertRefreshToken({
      userId: user.id,
      tokenHash: this.hashToken(token),
      deviceInfo: req.headers['user-agent'] || null,
      ipAddress: req.ip || req.socket?.remoteAddress,
      expiresAt,
    });

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

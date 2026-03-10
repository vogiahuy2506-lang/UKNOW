import db from '../config/database.js';
import bcrypt from 'bcryptjs';

class UserController {
  /**
   * Lấy thông tin profile của user đang đăng nhập.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getProfile(req, res) {
    try {
      const userId = req.user.id;
      
      const result = await db.query(
        `SELECT id, username, email, full_name, avatar_url, phone, status, created_at, last_login_at
         FROM users WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy người dùng'
        });
      }

      const user = result.rows[0];

      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          phone: user.phone,
          status: user.status,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Cập nhật thông tin profile (họ tên, số điện thoại, avatar).
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const { fullName, phone, avatarUrl } = req.body;

      const result = await db.query(
        `UPDATE users SET 
          full_name = COALESCE($1, full_name),
          phone = COALESCE($2, phone),
          avatar_url = COALESCE($3, avatar_url),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING id, username, email, full_name, avatar_url, phone`,
        [fullName, phone, avatarUrl, userId]
      );

      const user = result.rows[0];

      res.json({
        success: true,
        message: 'Cập nhật thông tin thành công',
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          phone: user.phone
        }
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
}

export default new UserController();

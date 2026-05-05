import dns from 'dns/promises';
import verificationService from '../services/verification.service.js';
import db from '../config/database.js';

class VerificationController {
  /**
   * Gửi mã xác minh qua email
   */
  async sendCode(req, res) {
    try {
      const { email, username } = req.body;

      // Kiểm tra domain email có MX record hợp lệ không
      const domain = email.split('@')[1];
      try {
        const records = await dns.resolveMx(domain);
        if (!records || records.length === 0) throw new Error('No MX');
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Địa chỉ email không hợp lệ hoặc domain không tồn tại',
        });
      }

      // Kiểm tra email đã tồn tại chưa
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Email đã được sử dụng' });
      }

      // Kiểm tra username đã tồn tại chưa (nếu có truyền lên)
      if (username) {
        const existingUsername = await db.query(
          'SELECT id FROM users WHERE username = $1',
          [username]
        );
        if (existingUsername.rows.length > 0) {
          return res.status(400).json({ success: false, message: 'Tên đăng nhập đã được sử dụng' });
        }
      }

      await verificationService.sendVerification(null, email);

      res.json({
        success: true,
        message: 'Mã xác minh đã được gửi đến email của bạn'
      });
    } catch (error) {
      console.error('Send verification code error:', error);
      res.status(500).json({
        success: false,
        message: 'Không thể gửi mã xác minh. Vui lòng thử lại sau.'
      });
    }
  }

  /**
   * Xác minh mã
   */
  async verifyCode(req, res) {
    try {
      const { email, code } = req.body;

      const verification = await verificationService.verifyCode(email, code);

      if (!verification) {
        return res.status(400).json({
          success: false,
          message: 'Mã xác minh không đúng hoặc đã hết hạn'
        });
      }

      // Đánh dấu mã đã sử dụng
      await verificationService.markCodeAsUsed(verification.id);

      res.json({
        success: true,
        message: 'Xác minh thành công',
        data: {
          email,
          verified: true
        }
      });
    } catch (error) {
      console.error('Verify code error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }
}

export default new VerificationController();

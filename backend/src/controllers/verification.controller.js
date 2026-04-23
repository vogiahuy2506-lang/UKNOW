import verificationService from '../services/verification.service.js';
import db from '../config/database.js';

class VerificationController {
  /**
   * Gửi mã xác minh qua email
   */
  async sendCode(req, res) {
    try {
      const { email } = req.body;

      // Kiểm tra email đã tồn tại chưa (nếu là đăng ký)
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email đã được sử dụng'
        });
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

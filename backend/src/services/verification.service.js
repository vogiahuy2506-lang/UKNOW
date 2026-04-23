import crypto from 'crypto';
import db from '../config/database.js';
import emailSettingsSmtpService from './email/emailSettingsSmtp.service.js';

class VerificationService {
  /**
   * Tạo mã xác minh 6 số
   */
  generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Lưu mã xác minh vào database
   */
  async saveVerificationCode(email, code, type = 'email_verification', expiresInMinutes = 10) {
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Đánh dấu các mã cũ của email này là đã sử dụng
    await db.query(
      'UPDATE verification_codes SET is_used = TRUE WHERE email = $1 AND type = $2 AND is_used = FALSE',
      [email, type]
    );

    // Tạo mã mới
    const result = await db.query(
      `INSERT INTO verification_codes (email, code, type, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email, code, type, expiresAt]
    );

    return result.rows[0];
  }

  /**
   * Xác minh mã
   */
  async verifyCode(email, code, type = 'email_verification') {
    const result = await db.query(
      `SELECT * FROM verification_codes
       WHERE email = $1 AND code = $2 AND type = $3 AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, code, type]
    );

    return result.rows[0] || null;
  }

  /**
   * Đánh dấu mã đã sử dụng
   */
  async markCodeAsUsed(id) {
    await db.query(
      'UPDATE verification_codes SET is_used = TRUE WHERE id = $1',
      [id]
    );
  }

  /**
   * Gửi email xác minh
   */
  async sendVerificationEmail(email, code) {
    const subject = 'Mã xác minh email - UKNOW';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3B82F6, #1D4ED8); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0;">UKNOW</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2 style="color: #1f2937; margin-top: 0;">Xác minh email của bạn</h2>
          <p style="color: #6b7280; font-size: 16px;">
            Cảm ơn bạn đã đăng ký UKNOW. Vui lòng sử dụng mã bên dưới để xác minh email của bạn:
          </p>
          <div style="background: white; border: 2px dashed #e5e7eb; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #3B82F6;">${code}</span>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            Mã này sẽ hết hạn sau <strong>10 phút</strong>.
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
            Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.
          </p>
        </div>
      </div>
    `;

    return emailSettingsSmtpService.sendEmail({
      to: email,
      subject,
      html,
    });
  }

  /**
   * Gửi mã xác minh cho user
   */
  async sendVerification(userId, email, type = 'email_verification') {
    const code = this.generateCode();
    await this.saveVerificationCode(email, code, type);
    await this.sendVerificationEmail(email, code);
    return true;
  }
}

export default new VerificationService();

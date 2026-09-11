import dns from 'dns/promises';
import db from '../config/database.js';
import verificationService from '../services/verification.service.js';
import verificationRepository from '../repositories/verification.repository.js';
import { isPhoneOtpEnabled } from '../services/sms/otpProvider.service.js';
import { normalizePhoneForZaloCampaign, isValidNormalizedPhoneLength } from '../utils/zaloPhoneCampaign.util.js';
import { isCurrentlyAnyonesEmployee } from '../repositories/user/user.repository.js';
import { pushMemberToSheet } from '../utils/memberSheetSync.util.js';
import { logSystem, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getSystemAuditContext } from '../utils/auditContext.util.js';

class VerificationController {
  /**
   * Gửi mã xác minh qua email
   */
  async sendCode(req, res) {
    try {
      const { email, username } = req.body;
      console.log(`[Verification] Sending code to: ${email}, username: ${username}`);

      // Kiểm tra domain email có MX record hợp lệ không
      const trimmedEmail = email.trim();
      const domain = trimmedEmail.split('@')[1];
      try {
        // Chỉ kiểm tra MX record nếu không phải là môi trường development hoặc domain là common email
        const isCommonDomain = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'].includes(domain.toLowerCase());
        
        if (!isCommonDomain && process.env.NODE_ENV !== 'development') {
          const records = await dns.resolveMx(domain);
          if (!records || records.length === 0) throw new Error('No MX');
        }
      } catch (dnsError) {
        console.warn(`[Verification] DNS check failed for ${domain}:`, dnsError.message);
        // Trong môi trường dev hoặc nếu là domain phổ biến mà DNS fail (có thể do network), ta vẫn cho qua
        if (process.env.NODE_ENV !== 'development' && !['localhost', 'test.com'].includes(domain)) {
          return res.status(400).json({
            success: false,
            message: 'Địa chỉ email không hợp lệ hoặc domain không tồn tại',
          });
        }
      }

      // Kiểm tra email đã tồn tại chưa
      const existingUser = await verificationRepository.userExistsByEmail(email);
      if (existingUser) {
        console.log(`[Verification] Email already used: ${email}`);
        return res.status(400).json({ success: false, message: 'Email đã được sử dụng' });
      }

      // Kiểm tra username đã tồn tại chưa (nếu có truyền lên)
      if (username) {
        const existingUsername = await verificationRepository.userExistsByUsername(username);
        if (existingUsername) {
          console.log(`[Verification] Username already used: ${username}`);
          return res.status(400).json({ success: false, message: 'Tên đăng nhập đã được sử dụng' });
        }
      }

      await verificationService.sendVerification(null, email);

      res.json({
        success: true,
        message: 'Mã xác minh đã được gửi đến email của bạn'
      });
    } catch (error) {
      if (error.status === 429 || error.code === 'VERIFICATION_COOLDOWN') {
        return res.status(429).json({
          success: false,
          message: error.message,
          code: 'VERIFICATION_COOLDOWN',
          retryAfterSec: error.retryAfterSec,
        });
      }
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

  // ─── OTP theo SĐT (PR-1, xác thực SĐT) ──────────────────────────────────────
  // Cả hai route yêu cầu đăng nhập (authMiddleware gắn req.user ở route). Mọi nhánh dưới
  // đây nằm sau kiểm isPhoneOtpEnabled() — Bẫy #6: PHONE_OTP_PROVIDER rỗng phải là nguyên
  // trạng, đường lùi nếu tắt tính năng.

  /**
   * POST /api/verification/phone/send-code
   */
  async sendPhoneCode(req, res) {
    if (!isPhoneOtpEnabled()) {
      return res.status(404).json({
        success: false,
        message: 'Tính năng xác thực số điện thoại chưa được bật',
        code: 'PHONE_OTP_DISABLED',
      });
    }
    try {
      const userId = req.user.id;
      const normalizedPhone = normalizePhoneForZaloCampaign(req.body?.phone);
      if (!isValidNormalizedPhoneLength(normalizedPhone)) {
        return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ' });
      }

      await verificationService.sendPhoneOtp({ userId, phone: normalizedPhone });

      return res.json({
        success: true,
        message: 'Mã xác thực đã được gửi đến số điện thoại của bạn',
      });
    } catch (error) {
      if (error.status === 429) {
        return res.status(429).json({
          success: false,
          message: error.message,
          code: error.code,
          retryAfterSec: error.retryAfterSec,
        });
      }
      console.error('Send phone code error:', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể gửi mã xác thực. Vui lòng thử lại sau.',
      });
    }
  }

  /**
   * POST /api/verification/phone/verify
   *
   * Đúng mã → MỘT transaction áp luật "số đã xác thực thắng số chưa xác thực" (plan mục 2):
   * nếu số đang được một tài khoản KHÁC giữ mà CHƯA xác thực, số đó chuyển sang user hiện
   * tại — tài khoản cũ mất số + ghi audit. Nếu số đó ĐÃ được xác thực bởi tài khoản khác
   * → 409 như luồng cập nhật số thường (PHONE_TAKEN).
   *
   * Gộp cả hai UPDATE (gỡ số khỏi chủ cũ, gán số cho user hiện tại) trong CÙNG một
   * transaction — Bẫy #9: tách hai UPDATE có lúc để hai tài khoản cùng giữ một số, vi phạm
   * unique index và rơi 500 giữa chừng.
   */
  async verifyPhoneCode(req, res) {
    if (!isPhoneOtpEnabled()) {
      return res.status(404).json({
        success: false,
        message: 'Tính năng xác thực số điện thoại chưa được bật',
        code: 'PHONE_OTP_DISABLED',
      });
    }

    const userId = req.user.id;
    const normalizedPhone = normalizePhoneForZaloCampaign(req.body?.phone);
    if (!isValidNormalizedPhoneLength(normalizedPhone)) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ' });
    }

    try {
      // Xác thực mã TRƯỚC — không cần transaction riêng, verifyPhoneOtp tự quản lý
      // (cooldown/attempts không liên quan tới bảng users nên không cần cùng tx với bước dưới).
      await verificationService.verifyPhoneOtp({
        userId,
        phone: normalizedPhone,
        code: req.body?.code,
      });

      const client = await db.getClient();
      let reclaimedFromUserId = null;
      let updatedUser = null;
      try {
        await client.query('BEGIN');

        // FOR UPDATE khoá dòng chủ cũ (nếu có) trong suốt transaction — chặn một lượt
        // verify khác của CÙNG số này xen vào giữa lúc ta đang chuyển chủ.
        const { rows: holderRows } = await client.query(
          `SELECT id, phone_verified_at FROM users WHERE phone = $1 AND id <> $2 FOR UPDATE`,
          [normalizedPhone, userId]
        );
        const holder = holderRows[0];

        if (holder) {
          if (holder.phone_verified_at) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              success: false,
              code: 'PHONE_TAKEN',
              message: 'Số điện thoại này đã được dùng và xác thực bởi một tài khoản khác.',
            });
          }
          // Y giữ chỗ số này nhưng CHƯA xác thực — số chuyển sang X (luật "đã xác thực thắng").
          await client.query(
            `UPDATE users SET phone = NULL, phone_verified_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [holder.id]
          );
          reclaimedFromUserId = holder.id;
        }

        const { rows: updatedRows } = await client.query(
          `UPDATE users
              SET phone = $1, phone_verified_at = NOW(), updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING id, email, full_name, phone, phone_verified_at`,
          [normalizedPhone, userId]
        );
        updatedUser = updatedRows[0];

        await client.query('COMMIT');
      } catch (txError) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Nuốt lỗi rollback — lỗi gốc mới là thứ cần báo, xem catch ngoài.
        }
        throw txError;
      } finally {
        client.release();
      }

      // Audit — sau khi transaction đã commit, không chặn response nếu chậm.
      if (reclaimedFromUserId) {
        await logSystem(
          getSystemAuditContext(req),
          AUDIT_ACTIONS.USER_PHONE_RECLAIMED,
          AUDIT_ENTITY_TYPES.USER,
          reclaimedFromUserId,
          { reclaimedByUserId: userId }
        );
      }
      await logSystem(
        getSystemAuditContext(req),
        AUDIT_ACTIONS.USER_PHONE_VERIFIED,
        AUDIT_ENTITY_TYPES.USER,
        userId,
        {}
      );

      // Đẩy Sheet — async, không chặn response (cùng khuôn user.controller.js:482-494).
      if (req.user.role === 'user') {
        isCurrentlyAnyonesEmployee(userId)
          .then((isEmployee) => {
            if (isEmployee) return;
            return pushMemberToSheet({
              email: updatedUser.email,
              phone: updatedUser.phone,
              fullName: updatedUser.full_name,
              createdAt: new Date(),
              phoneVerified: true,
            });
          })
          .catch((err) => console.warn('[MemberSheet] Failed to push:', err.message));
      }

      return res.json({
        success: true,
        message: 'Xác thực số điện thoại thành công',
        data: {
          phone: updatedUser.phone,
          phoneVerifiedAt: updatedUser.phone_verified_at,
        },
      });
    } catch (error) {
      if (error.code === '23505' && String(error.detail || '').includes('phone')) {
        return res.status(409).json({
          success: false,
          code: 'PHONE_TAKEN',
          message: 'Số điện thoại này đã được dùng cho một tài khoản khác. Vui lòng dùng số khác.',
        });
      }
      if (error.status) {
        return res.status(error.status).json({
          success: false,
          message: error.message,
          code: error.code,
        });
      }
      console.error('Verify phone code error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }
}

export default new VerificationController();

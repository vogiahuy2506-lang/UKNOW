/**
 * System Payment Account routes (PR cho vietqr-chat-hero-landing).
 *
 * Public routes để frontend chatbot dùng khi cần generate VietQR cho user thanh
 * toán. Không cần auth — đây là thông tin công khai (TK nhận tiền) + VietQR
 * string public-safe.
 *
 * CORS allow-all (giống hero consultation) — landing page chatbot có thể được
 * nhúng vào domain khác.
 */

import express from 'express';
import {
  getActivePaymentAccount,
  generatePaymentQr,
} from '../services/systemPaymentAccount.service.js';
import { allowAllCorsMiddleware } from '../middleware/dynamicCors.middleware.js';

const router = express.Router();

router.use(allowAllCorsMiddleware);

/**
 * GET /api/system/payment-account
 *
 * Trả thông tin TK đang active (KHÔNG lộ secret như password, chỉ là thông tin
 * công khai để user biết chuyển vào đâu). Frontend dùng để hiển thị card
 * "Thông tin thanh toán" trước khi generate QR.
 *
 * Response 200: { success, data: { account_name, account_number, bank_bin, bank_name } }
 * Response 503: chưa cấu hình TK (DB rỗng + env var rỗng)
 */
router.get('/payment-account', async (req, res) => {
  try {
    const account = await getActivePaymentAccount();
    if (!account) {
      return res.status(503).json({
        success: false,
        code: 'NO_PAYMENT_ACCOUNT',
        message:
          'Hiện tại chưa cấu hình tài khoản thanh toán. Vui lòng liên hệ admin.',
      });
    }
    return res.json({
      success: true,
      data: {
        account_name: account.account_name,
        account_number: account.account_number,
        bank_bin: account.bank_bin,
        bank_name: account.bank_name,
      },
    });
  } catch (err) {
    console.error('[systemPaymentAccount] GET error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Không lấy được thông tin tài khoản',
    });
  }
});

/**
 * POST /api/system/payment-account/qr
 *
 * Body: { amount: number, description?: string }
 * Response 200: { success, data: { vietqr_string, account, amount, description } }
 * Response 400: amount invalid
 * Response 503: chưa cấu hình TK
 */
router.post('/payment-account/qr', async (req, res) => {
  try {
    const { amount, description } = req.body || {};
    const result = await generatePaymentQr({ amount, description });
    return res.json({ success: true, data: result });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        code: err.code || 'BAD_REQUEST',
        message: err.message,
      });
    }
    console.error('[systemPaymentAccount] POST /qr error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Không sinh được mã QR',
    });
  }
});

export default router;

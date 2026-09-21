/**
 * System Payment Account service.
 *
 * Cấu hình tài khoản ngân hàng nhận thanh toán cho VietQR (PR cho
 * vietqr-chat-hero-landing). Cho phép admin cấu hình nhiều tài khoản trong DB
 * (bảng `system_payment_accounts`); nếu DB rỗng hoặc tất cả is_active=false thì
 * fallback về env var PAYMENT_BANK_* (xem PAYMENT_BANK_ENV_FIELDS) để dev không
 * cần migration vẫn chạy được.
 *
 * Generated VietQR strings phải pass CRC — dùng `buildVietQrString` từ
 * `utils/vietQr.util.js` để sinh, không tự build string.
 */

import db from '../config/database.js';
import { buildVietQrString } from '../utils/vietQr.util.js';

const ACCOUNT_NOT_FOUND_MESSAGE =
  'Chưa cấu hình tài khoản thanh toán (DB + env var đều rỗng). ' +
  'Liên hệ admin để thêm tài khoản nhận thanh toán.';

const PAYMENT_BANK_ENV_FIELDS = [
  'PAYMENT_BANK_BIN',
  'PAYMENT_BANK_NAME',
  'PAYMENT_BANK_ACCOUNT_NUMBER',
  'PAYMENT_BANK_ACCOUNT_NAME',
];

function readEnvAccount() {
  const envBin = String(process.env.PAYMENT_BANK_BIN || '').trim();
  const envAccountNumber = String(
    process.env.PAYMENT_BANK_ACCOUNT_NUMBER || ''
  ).trim();
  const envAccountName = String(
    process.env.PAYMENT_BANK_ACCOUNT_NAME || ''
  ).trim();
  const envBankName = String(process.env.PAYMENT_BANK_NAME || '').trim();

  if (!envBin || !envAccountNumber || !envAccountName || !envBankName) {
    return null;
  }

  return {
    id: null,
    account_name: envAccountName,
    account_number: envAccountNumber,
    bank_bin: envBin,
    bank_name: envBankName,
    is_default: true,
    source: 'env',
  };
}

/**
 * Lấy tài khoản đang active. Ưu tiên row có is_default=true, fallback row active
 * đầu tiên, cuối cùng fallback env var. Trả null nếu không có gì.
 *
 * @returns {Promise<{
 *   id: number|null,
 *   account_name: string,
 *   account_number: string,
 *   bank_bin: string,
 *   bank_name: string,
 *   is_default: boolean,
 *   source: 'db'|'env'
 * }|null>}
 */
export async function getActivePaymentAccount() {
  try {
    const { rows } = await db.query(
      `SELECT id, account_name, account_number, bank_bin, bank_name, is_default
       FROM system_payment_accounts
       WHERE is_active = true
       ORDER BY is_default DESC, id ASC
       LIMIT 1`
    );
    if (rows[0]) {
      return { ...rows[0], source: 'db' };
    }
  } catch (err) {
    // Bảng chưa migrate (dev env), im lặng rồi fallback env.
    // Skip log trong test mode (NODE_ENV='test') để tránh Jest teardown warning
    // "Cannot log after tests are done" — DB query trong CI đôi khi chậm >30s.
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      queueMicrotask(() => {
        console.warn(
          '[systemPaymentAccount] query failed, fallback env:',
          err.message
        );
      });
    }
  }
  return readEnvAccount();
}

/**
 * Sinh VietQR string từ tài khoản active. Trả object gồm:
 *   - vietqr_string: chuỗi EMVCo đầy đủ kèm CRC (đã verify)
 *   - account: thông tin TK dùng để sinh (để FE hiển thị)
 *   - amount: số tiền (integer VND)
 *   - description: nội dung CK
 *
 * Throw error nếu chưa cấu hình TK (DB rỗng + env var rỗng) hoặc amount invalid.
 *
 * @param {{ amount: number|string, description?: string }} input
 * @returns {Promise<{
 *   vietqr_string: string,
 *   account: object,
 *   amount: number,
 *   description: string|null
 * }>}
 */
export async function generatePaymentQr({ amount, description }) {
  const account = await getActivePaymentAccount();
  if (!account) {
    const err = new Error(ACCOUNT_NOT_FOUND_MESSAGE);
    err.statusCode = 503;
    err.code = 'NO_PAYMENT_ACCOUNT';
    throw err;
  }

  const amountNumber = Math.round(Number(amount));
  if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
    const err = new Error('Số tiền phải là số dương (VND)');
    err.statusCode = 400;
    err.code = 'INVALID_AMOUNT';
    throw err;
  }

  // description: cắt tối đa 50 ký tự (giới hạn field 08 trong EMVCo); chỉ
  // giữ ASCII printable + bỏ ký tự điều khiển để tránh QR scanner lỗi.
  const safeDescription = String(description || '')
    .replace(/[^A-Za-z0-9 \-_./]/g, '')
    .trim()
    .slice(0, 50) || null;

  const vietqr_string = buildVietQrString({
    bin: account.bank_bin,
    accountNumber: account.account_number,
    amount: amountNumber,
    memo: safeDescription || 'THANHTOAN',
  });

  // Trả về object public-safe (không lộ field nội bộ như source)
  const publicAccount = {
    account_name: account.account_name,
    account_number: account.account_number,
    bank_bin: account.bank_bin,
    bank_name: account.bank_name,
  };

  return {
    vietqr_string,
    account: publicAccount,
    amount: amountNumber,
    description: safeDescription,
  };
}

export { PAYMENT_BANK_ENV_FIELDS };

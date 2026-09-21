/**
 * Generate VietQR từ BE cho hero chatbot (vietqr-chat-hero-landing).
 *
 * FE gọi POST /api/system/payment-account/qr → nhận về chuỗi EMVCo + thông tin
 * TK + amount + description. Frontend render QR image bằng lib `qrcode` đã
 * có trong package.json (frontend/package.json:33).
 *
 * NOTE: dùng chung baseURL với các API khác trong landing/hero (relative path
 * `/api/system/...`) — Vite proxy tự forward về BE.
 */

/**
 * @typedef {object} PaymentQrData
 * @property {string} vietqr_string - Chuỗi EMVCo Merchant-Presented Mode (kèm CRC)
 * @property {object} account
 * @property {string} account.account_name
 * @property {string} account.account_number
 * @property {string} account.bank_bin
 * @property {string} account.bank_name
 * @property {number} amount - Số tiền integer VND
 * @property {string|null} description
 */

/**
 * Gọi BE generate VietQR.
 *
 * @param {{ amount: number, description?: string }} input
 * @returns {Promise<PaymentQrData>}
 */
export async function generatePaymentQr({ amount, description }) {
  const res = await fetch('/api/system/payment-account/qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, description }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.code = data.code;
    err.statusCode = res.status;
    throw err;
  }
  return data.data;
}

/**
 * Lấy thông tin TK đang active (không có QR). Dùng để hiển thị card "thông tin
 * thanh toán" trước khi generate QR.
 *
 * @returns {Promise<{ account_name: string, account_number: string, bank_bin: string, bank_name: string }>}
 */
export async function fetchActivePaymentAccount() {
  const res = await fetch('/api/system/payment-account');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.code = data.code;
    err.statusCode = res.status;
    throw err;
  }
  return data.data;
}

/**
 * Phân loại lỗi SMTP thành hard bounce hoặc soft bounce.
 *
 * - Hard bounce: lỗi vĩnh viễn — địa chỉ không tồn tại, domain không hợp lệ, bị reject hoàn toàn (SMTP 5xx)
 * - Soft bounce: lỗi tạm thời — mailbox đầy, server tạm lỗi, rate limit (SMTP 4xx)
 *
 * @param {Error} error - Lỗi trả về từ nodemailer sendMail
 * @returns {'hard' | 'soft'}
 */
export function classifyBounceType(error) {
  const code = error?.responseCode || error?.smtpCode || null;
  const msg = String(error?.message || error?.response || '').toLowerCase();

  if (code !== null && code >= 500 && code < 600) return 'hard';

  const hardPatterns = [
    'no such user',
    'user not found',
    'user unknown',
    'does not exist',
    'invalid address',
    'address rejected',
    'mailbox unavailable',
    'mailbox not found',
    'recipient address rejected',
    'bad destination mailbox address',
    'undeliverable',
    '550', '551', '553', '554',
  ];
  if (hardPatterns.some((p) => msg.includes(p))) return 'hard';

  if (code !== null && code >= 400 && code < 500) return 'soft';

  const softPatterns = [
    'mailbox full',
    'over quota',
    'quota exceeded',
    'storage limit',
    'try again',
    'temporarily',
    'service unavailable',
    'connection timed out',
    'too many connections',
    '421', '450', '451', '452',
  ];
  if (softPatterns.some((p) => msg.includes(p))) return 'soft';

  return 'soft';
}

/**
 * Kiểm tra lỗi SMTP có phải lỗi cấu hình/xác thực hay không.
 *
 * Luồng hoạt động:
 * 1. Đọc `responseCode`/`smtpCode` và thông điệp lỗi từ nodemailer.
 * 2. So khớp các mã xác thực (điển hình 535) hoặc cụm từ báo sai credential.
 * 3. Trả về true để luồng gửi email xử lý như lỗi cấu hình thay vì bounce.
 *
 * @param {Error} error - Lỗi trả về từ nodemailer sendMail
 * @returns {boolean} true nếu là lỗi cấu hình/xác thực SMTP
 */
export function isSmtpAuthConfigError(error) {
  const code = Number(error?.responseCode ?? error?.smtpCode ?? NaN);
  const msg = String(error?.message || error?.response || '').toLowerCase();

  if (Number.isFinite(code) && code === 535) return true;

  const authPatterns = [
    'authentication credentials invalid',
    'invalid login',
    'auth failed',
    'authentication failed',
    'username and password not accepted',
    'invalid credentials',
    'bad credentials',
    'login denied',
  ];

  return authPatterns.some((pattern) => msg.includes(pattern));
}

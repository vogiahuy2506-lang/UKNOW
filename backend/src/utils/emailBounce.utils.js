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
 * Nhận diện lỗi SMTP thuộc phía cấu hình/mail gửi (không liên quan email người nhận).
 *
 * @param {string} messageLower thông điệp lỗi đã lower-case
 * @returns {boolean}
 */
function hasSenderSideConfigPatterns(messageLower) {
  const senderSidePatterns = [
    'from address does not match a verified sender identity',
    'sender identity',
    'verified sender',
    'domain is not verified',
    'from address is not verified',
    'mail from address not verified',
    'unauthenticated sender',
  ];
  return senderSidePatterns.some((pattern) => messageLower.includes(pattern));
}

/**
 * Xác định lỗi SMTP có thật sự là "email người nhận không tồn tại" hay không.
 *
 * Luồng hoạt động:
 * 1. Ưu tiên nhận diện các mã SMTP hard bounce điển hình cho địa chỉ sai (550/551/553).
 * 2. So khớp thêm các pattern quen thuộc trong message của provider.
 * 3. Trả về false cho mọi lỗi khác (rate limit, mailbox full, tạm thời, ...).
 *
 * @param {Error} error - Lỗi trả về từ nodemailer sendMail
 * @returns {boolean} true nếu có thể kết luận địa chỉ email người nhận không tồn tại/hợp lệ
 */
export function isRecipientAddressNotFoundError(error) {
  const code = Number(error?.responseCode ?? error?.smtpCode ?? NaN);
  const msg = String(error?.message || error?.response || '').toLowerCase();

  // Ưu tiên loại trừ lỗi phía người gửi để tránh đánh nhầm bounced cho khách hàng.
  if (hasSenderSideConfigPatterns(msg)) {
    return false;
  }

  const recipientKeyPatterns = [
    'recipient',
    'user',
    'mailbox',
    'address',
    'destination',
  ];
  const hasRecipientContext = recipientKeyPatterns.some((pattern) => msg.includes(pattern));

  if (Number.isFinite(code) && [550, 551, 553].includes(code) && hasRecipientContext) {
    return true;
  }

  const recipientNotFoundPatterns = [
    'no such user',
    'user not found',
    'user unknown',
    'does not exist',
    'invalid address',
    'recipient address rejected',
    'mailbox not found',
    'bad destination mailbox address',
    '5.1.1',
    '5.1.0',
  ];

  return recipientNotFoundPatterns.some((pattern) => msg.includes(pattern));
}

/**
 * Kiểm tra lỗi SMTP có phải lỗi cấu hình phía người gửi hay không.
 *
 * Luồng hoạt động:
 * 1. Đọc `responseCode`/`smtpCode` và thông điệp lỗi từ nodemailer.
 * 2. So khớp các mã xác thực (điển hình 535) và lỗi Sender Identity/From address.
 * 3. Trả về true để luồng gửi email xử lý như lỗi cấu hình thay vì bounce.
 *
 * @param {Error} error - Lỗi trả về từ nodemailer sendMail
 * @returns {boolean} true nếu là lỗi cấu hình SMTP (auth hoặc sender identity)
 */
export function isSmtpAuthConfigError(error) {
  const code = Number(error?.responseCode ?? error?.smtpCode ?? NaN);
  const msg = String(error?.message || error?.response || '').toLowerCase();

  if (Number.isFinite(code) && code === 535) return true;
  if (hasSenderSideConfigPatterns(msg)) return true;

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

/**
 * Nhận diện lỗi bị giới hạn gửi của provider SMTP (đặc biệt SendGrid).
 *
 * Luồng hoạt động:
 * 1. So khớp các pattern lỗi quota/rate-limit thường gặp của SendGrid.
 * 2. So khớp mã trạng thái 429 hoặc thông điệp "too many requests".
 * 3. Trả về true để luồng gửi lên lịch retry trễ thay vì fail cứng ngay.
 *
 * @param {Error} error - Lỗi trả về từ nodemailer sendMail
 * @returns {boolean} true nếu là lỗi giới hạn gửi cần chờ hồi
 */
export function isSmtpProviderRateLimitError(error) {
  const code = Number(error?.responseCode ?? error?.smtpCode ?? NaN);
  const msg = String(error?.message || error?.response || '').toLowerCase();

  const rateLimitPatterns = [
    'maximum credits exceeded',
    'credits exceeded',
    'rate limit',
    'quota exceeded',
    'too many requests',
    'try again later',
    'temporarily deferred',
    'daily user sending quota exceeded',
    'exceeded sending limits',
    'messaging limits',
    "you've exceeded your messaging limits",
    'you have exceeded your messaging limits',
    'too many messages',
    'recipient rate limit',
    'sender rate limit'
  ];

  if (rateLimitPatterns.some((pattern) => msg.includes(pattern))) {
    return true;
  }

  // Một số provider trả 451 cho lỗi vượt ngưỡng gửi tạm thời.
  // Chỉ coi là rate-limit khi message có ngữ nghĩa giới hạn/quota để tránh bắt nhầm soft-bounce khác.
  if (Number.isFinite(code) && code === 451) {
    const limitHints = [
      'limit',
      'quota',
      'exceeded',
      'too many',
      'throttl',
      'rate',
      'temporarily deferred',
    ];
    if (limitHints.some((hint) => msg.includes(hint))) {
      return true;
    }
  }

  return Number.isFinite(code) && code === 429;
}

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

  // PR-6 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 1 — 454 là "Temporary authentication
  // failure" (tạm thời), KHÔNG phải lỗi cấu hình. nodemailer bọc message thành
  // "Invalid login: 454 4.7.0 …" nên authPatterns bên dưới ('invalid login') sẽ khớp nhầm nếu
  // không loại trừ SỚM ở đây — trước đây dừng cả run + gửi email "Lỗi xác thực" cho chủ oan.
  if (Number.isFinite(code) && code === 454) return false;

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

// PR-6 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 1 — lệnh SMTP chắc chắn xảy ra TRƯỚC DATA.
// Có mã phản hồi 4xx ở một trong các lệnh này thì chắc chắn email chưa được gửi.
const PRE_DATA_SMTP_COMMANDS = new Set(['CONN', 'EHLO', 'HELO', 'LHLO', 'STARTTLS', 'MAIL FROM', 'RCPT TO']);

/**
 * Nhận diện lỗi SMTP chắc chắn xảy ra TRƯỚC lệnh DATA (kết nối/EHLO/STARTTLS/AUTH/MAIL FROM/
 * RCPT TO) — nghĩa là email CHẮC CHẮN CHƯA được gửi, an toàn để thử lại thay vì bounce/fail cứng.
 *
 * Đo production 60 ngày (~137 lỗi loại này): chủ yếu "Invalid greeting…too many connections",
 * "Greeting never received", "Connection timeout", TLS handshake failure, 454 auth tạm thời,
 * "Reached maximum number of messages sent per connection" — trước đây xử lý như lỗi vĩnh viễn
 * (mất địa chỉ) hoặc lỗi cấu hình (dừng cả run).
 *
 * CỐ Ý KHÔNG bắt econnreset/connection closed/socket hang up/"Timeout" trần: đã kiểm
 * node_modules/nodemailer/lib/smtp-connection/index.js (8.0.1) — MỌI lỗi socket (kể cả đứt kết
 * nối giữa DATA, dòng ~966/968/991) đều bị gắn `command: 'CONN'`, nên không thể phân biệt tĩnh
 * "chưa gửi" với "gửi rồi mất phản hồi" chỉ từ command/message của nhóm này. Nhóm mơ hồ này giữ
 * nguyên đường `smtp_delivery` + uncertain như hiện tại (không đổi ở đây).
 *
 * `error.code === 'ETLS'` AN TOÀN để coi là trước-DATA dù dùng chung message "Connection closed
 * unexpectedly" với nhóm mơ hồ: nodemailer chỉ gắn ETLS cho lỗi này khi `this.upgrading` (đang
 * bắt tay STARTTLS, luôn xảy ra trước AUTH/MAIL FROM/DATA) — dòng ~964; đứt giữa DATA luôn được
 * gắn `ECONNECTION` (dòng ~966/968), không phải ETLS.
 *
 * @param {Error} error - Lỗi trả về từ nodemailer sendMail
 * @returns {boolean}
 */
export function isSmtpPreSendTransientError(error) {
  const code = Number(error?.responseCode ?? error?.smtpCode ?? NaN);
  const msg = String(error?.message || error?.response || '').toLowerCase();
  const command = String(error?.command || '').toUpperCase().trim();

  if (msg.includes('invalid greeting') || msg.includes('greeting never received')) return true;
  // "Connection timeout" (SMTPC:405) là timeout LÚC KẾT NỐI — khác "Timeout" trần (SMTPC:991,
  // socket idle, có thể xảy ra giữa DATA) nên KHÔNG được coi là trước-DATA.
  if (msg.includes('connection timeout')) return true;
  if (error?.code === 'ETLS' || error?.code === 'ECONNREFUSED') return true;
  if (/ssl routines.*handshake failure/i.test(msg)) return true;

  if (
    Number.isFinite(code)
    && [421, 450, 451, 452, 454].includes(code)
    && (PRE_DATA_SMTP_COMMANDS.has(command) || command.startsWith('AUTH'))
  ) {
    return true;
  }

  return false;
}

/**
 * Nhận diện lỗi bị giới hạn gửi của provider SMTP.
 *
 * Luồng hoạt động:
 * 1. So khớp các pattern lỗi quota/rate-limit thường gặp của SMTP provider.
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

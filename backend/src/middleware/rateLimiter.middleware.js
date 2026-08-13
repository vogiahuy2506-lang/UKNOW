import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';
const skipInTest = () => isTest;

const GLOBAL_USER_MAX = Number(process.env.RATE_LIMIT_GLOBAL_MAX) || 1000;
const GLOBAL_IP_MAX = Number(process.env.RATE_LIMIT_GLOBAL_IP_MAX) || 300;

function isInboxStreamPath(req) {
  const url = req.originalUrl || req.url || '';
  return /\/ai\/chatbot\/inbox\/stream(?:\?|$)/.test(url);
}

/** express-rate-limit v8: ipKeyGenerator(ip: string), NOT the request object. */
function clientIpKey(req) {
  const ip = req.ip || req.socket?.remoteAddress || '0.0.0.0';
  return ipKeyGenerator(ip);
}

/**
 * Key helper for unit tests and limiters that soft-attach req.rateLimitUserId.
 * @param {import('express').Request} req
 * @param {string} [prefix='']
 */
export function rateLimitKeyForRequest(req, prefix = '') {
  const userId = req.rateLimitUserId ?? req.user?.id;
  if (userId != null && userId !== '') {
    return `${prefix}user:${userId}`;
  }
  return `${prefix}ip:${clientIpKey(req)}`;
}

// Global rate limiter — per user when rateLimitUserId attached, else per IP (lower budget)
export const globalLimiter = rateLimit({
  skip: (req) => skipInTest() || isInboxStreamPath(req),
  windowMs: 15 * 60 * 1000,
  max: (req) => (req.rateLimitUserId != null ? GLOBAL_USER_MAX : GLOBAL_IP_MAX),
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyForRequest(req),
});

// Stricter limiter for auth endpoints - 10 requests per 15 minutes
export const authLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// API limiter - 200 requests per 15 minutes (mounted after auth on voucher routes)
export const apiLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu API. Vui lòng thử lại sau.',
    code: 'API_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyForRequest(req, 'api:'),
});

/** Dedicated limiter for voucher validate — user+IP key, no body logging. */
export const voucherValidateLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Quá nhiều lần kiểm tra mã. Vui lòng thử lại sau.',
    code: 'VOUCHER_VALIDATE_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userPart = req.user?.id != null ? `user:${req.user.id}` : 'anon';
    return `voucher-validate:${userPart}:ip:${clientIpKey(req)}`;
  },
});

// Upload limiter - 20 uploads per 15 minutes
export const uploadLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Quá nhiều file upload. Vui lòng thử lại sau.',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyForRequest(req, 'upload:'),
});

// Webhook limiter - 500 requests per 15 minutes
export const webhookLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: {
    success: false,
    message: 'Too many requests to webhook.',
    code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `webhook:${clientIpKey(req)}`,
});

// AI/Gemini limiter - 20 requests per minute per user (Gemini calls are expensive)
// Mounted AFTER authMiddleware on ai.routes — req.user.id is set.
export const aiLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu AI. Vui lòng thử lại sau 1 phút.',
    code: 'AI_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyForRequest(req, 'ai:'),
});

// Public chatbot limiter - 30 messages per minute per IP (no auth, visitor-facing)
export const publicChatLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Quá nhiều tin nhắn. Vui lòng thử lại sau 1 phút.',
    code: 'CHAT_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `pubchat:${clientIpKey(req)}`,
});

// Public chat attachment upload — 5 files / 10 minutes / IP
export const publicUploadLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Quá nhiều file tải lên. Vui lòng thử lại sau.',
    code: 'PUBLIC_UPLOAD_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `pubupload:${clientIpKey(req)}`,
});

// Campaign run limiter — số lần /run mỗi giờ (không phải concurrent; concurrent = MAX_CONCURRENT_CAMPAIGNS)
const CAMPAIGN_RUN_LIMIT_PER_HOUR = Math.max(
  1,
  Number.parseInt(process.env.CAMPAIGN_RUN_RATE_LIMIT_PER_HOUR || '30', 10) || 30
);

export const campaignRunLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 60 * 60 * 1000,
  max: CAMPAIGN_RUN_LIMIT_PER_HOUR,
  message: {
    success: false,
    message: 'Bạn chạy chiến dịch quá nhiều lần trong một giờ. Vui lòng thử lại sau.',
    code: 'CAMPAIGN_RUN_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyForRequest(req, 'campaign:'),
});

// Marketplace purchase limiter — chống spam mua hàng
export const marketplacePurchaseLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 60 * 1000, // 1 phút
  max: 5, // 5 lần mua mỗi phút
  message: {
    success: false,
    message: 'Bạn thực hiện quá nhiều lần mua. Vui lòng thử lại sau.',
    code: 'MARKETPLACE_PURCHASE_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyForRequest(req, 'marketplace:'),
});

// SSE connect attempts — separate from REST budget
export const sseLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Quá nhiều lần kết nối realtime. Vui lòng thử lại sau.',
    code: 'SSE_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => rateLimitKeyForRequest(req, 'sse:'),
});

// Public lead capture — chống flood/spam form (không auth)
export const publicLeadLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: {
    success: false,
    message: 'Quá nhiều lần gửi form. Vui lòng thử lại sau 15 phút.',
    code: 'PUBLIC_LEAD_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `public-lead:${clientIpKey(req)}`,
});

// Public landing analytics view — giới hạn nhẹ hơn lead nhưng vẫn chống flood
export const publicLandingAnalyticsLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu theo dõi. Vui lòng thử lại sau.',
    code: 'PUBLIC_ANALYTICS_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `public-analytics:${clientIpKey(req)}`,
});

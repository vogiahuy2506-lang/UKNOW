import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Global rate limiter - 100 requests per 15 minutes
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?.id) return `user:${req.user.id}`;
    return `ip:${ipKeyGenerator(req)}`;
  },
});

// Stricter limiter for auth endpoints - 10 requests per 15 minutes
export const authLimiter = rateLimit({
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

// API limiter - 200 requests per 15 minutes (less strict than global)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu API. Vui lòng thử lại sau.',
    code: 'API_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?.id) return `api:${req.user.id}`;
    return `api:${ipKeyGenerator(req)}`;
  },
});

// Chat/Message limiter - 60 messages per minute (higher for real-time)
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: {
    success: false,
    message: 'Quá nhiều tin nhắn. Vui lòng thử lại sau.',
    code: 'CHAT_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?.id) return `chat:${req.user.id}`;
    return `chat:${ipKeyGenerator(req)}`;
  },
});

// Upload limiter - 20 uploads per 15 minutes
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Quá nhiều file upload. Vui lòng thử lại sau.',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Webhook limiter - 500 requests per 15 minutes
export const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: {
    success: false,
    message: 'Too many requests to webhook.',
    code: 'WEBHOOK_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `webhook:${ipKeyGenerator(req)}`;
  },
});

// Campaign run limiter - 10 campaign executions per hour
export const campaignRunLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: 'Quá nhiều chiến dịch chạy cùng lúc. Vui lòng thử lại sau.',
    code: 'CAMPAIGN_RUN_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?.id) return `campaign:${req.user.id}`;
    return `campaign:${ipKeyGenerator(req)}`;
  },
});

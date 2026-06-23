import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';
const skipInTest = () => isTest;

// Global rate limiter - 100 requests per 15 minutes
export const globalLimiter = rateLimit({
  skip: skipInTest,
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

// API limiter - 200 requests per 15 minutes (less strict than global)
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
  keyGenerator: (req) => {
    if (req.user?.id) return `api:${req.user.id}`;
    return `api:${ipKeyGenerator(req)}`;
  },
});

// Chat/Message limiter - 60 messages per minute (higher for real-time)
export const chatLimiter = rateLimit({
  skip: skipInTest,
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
  keyGenerator: (req) => {
    return `webhook:${ipKeyGenerator(req)}`;
  },
});

// AI/Gemini limiter - 20 requests per minute per user (Gemini calls are expensive)
export const aiLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu AI. Vui lòng thử lại sau 1 phút.',
    code: 'AI_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?.id) return `ai:${req.user.id}`;
    return `ai:${ipKeyGenerator(req)}`;
  },
});

// Public chatbot limiter - 30 messages per minute per IP (no auth, visitor-facing)
export const publicChatLimiter = rateLimit({
  skip: skipInTest,
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    success: false,
    message: 'Quá nhiều tin nhắn. Vui lòng thử lại sau 1 phút.',
    code: 'CHAT_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `pubchat:${ipKeyGenerator(req)}`,
});

// Campaign run limiter - 10 campaign executions per hour
export const campaignRunLimiter = rateLimit({
  skip: skipInTest,
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
  keyGenerator: (req) => `public-lead:${ipKeyGenerator(req)}`,
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
  keyGenerator: (req) => `public-analytics:${ipKeyGenerator(req)}`,
});

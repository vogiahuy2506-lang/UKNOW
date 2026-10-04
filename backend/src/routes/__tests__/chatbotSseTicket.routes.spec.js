/**
 * H-04 — vé SSE: POST /inbox/stream-ticket cấp vé, GET /inbox/stream?ticket= đổi vé ĐÚNG MỘT lần.
 * resolveUserContext được mock ném 403 để handler trả JSON ngay (không mở stream SSE) — nhưng việc nó được
 * gọi với đúng (userId, ownerContextId) chứng minh vé đã được chấp nhận và ngữ cảnh nhân viên do SERVER giữ.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-sse-ticket';

import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockResolveUserContext = jest.fn();
let currentUser = null;

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => {
    if (!currentUser) return res.status(401).json({ success: false, message: 'Unauthorized' });
    req.user = currentUser;
    return next();
  },
  resolveUserContext: mockResolveUserContext,
  optionalAuthMiddleware: (req, res, next) => next(),
  attachUserIdForRateLimit: (req, res, next) => next(),
  attachSseUserIdForRateLimit: (req, res, next) => next(),
}));

jest.unstable_mockModule('../../middleware/authorization.middleware.js', () => ({
  default: (req, res, next) => next(),
  requireSelfContext: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireActivePlan: (req, res, next) => next(),
  requirePhone: (req, res, next) => next(),
  requirePasswordChange: (req, res, next) => next(),
  hasPermission: () => true,
}));

jest.unstable_mockModule('../../middleware/rateLimiter.middleware.js', () => ({
  aiLimiter: (req, res, next) => next(),
  uploadLimiter: (req, res, next) => next(),
  sseLimiter: (req, res, next) => next(),
  campaignRunLimiter: (req, res, next) => next(),
  quickSendTestLimiter: (req, res, next) => next(),
  marketplacePurchaseLimiter: (req, res, next) => next(),
  webhookLimiter: (req, res, next) => next(),
  publicLeadLimiter: (req, res, next) => next(),
}));

jest.unstable_mockModule('../../services/chatbot/inProcChannelGateway/index.js', () => ({
  __esModule: true,
  getState: jest.fn(() => ({})),
  isStubOnly: jest.fn(() => true),
  ensureGateway: jest.fn(async () => ({ ok: true })),
  getSecret: jest.fn(() => ''),
  getNodeJsCallbackUrl: jest.fn(() => ''),
  getChannelGateway: jest.fn(),
  configureChannel: jest.fn(),
  shutdownGateway: jest.fn(async () => {}),
  installLifecycleHooks: jest.fn(),
}));

let app;
let router;
let ticketService;

beforeAll(async () => {
  ticketService = await import('../../services/sseTicket.service.js');
  const { default: chatbotRoutes } = await import('../../routes/chatbot.routes.js');
  router = chatbotRoutes;
  app = express();
  app.use(express.json());
  app.use('/api/ai/chatbot', chatbotRoutes);
});

beforeEach(() => {
  ticketService._resetSseTicketsForTests();
  mockResolveUserContext.mockReset();
  const err = new Error('stop');
  err.status = 403;
  err.body = { success: false, code: 'TEST_STOP' };
  mockResolveUserContext.mockRejectedValue(err);
  currentUser = { id: 7, activeContext: { type: 'self', ownerId: 7 } };
});

afterEach(() => {
  jest.restoreAllMocks();
});

const mint = async () => {
  const res = await request(app).post('/api/ai/chatbot/inbox/stream-ticket');
  return res;
};

describe('POST /inbox/stream-ticket', () => {
  it('cần đăng nhập: không có user → 401, không cấp vé', async () => {
    currentUser = null;

    const res = await mint();

    expect(res.status).toBe(401);
    expect(ticketService._activeSseTicketCountForTests()).toBe(0);
  });

  it('cấp vé, không cho cache, trả hạn 60 giây', async () => {
    const res = await mint();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.ticket).toBe('string');
    expect(res.body.data.ticket.length).toBeGreaterThanOrEqual(40);
    expect(res.body.data.expiresInSeconds).toBe(60);
    expect(String(res.headers['cache-control'])).toMatch(/no-store/);
  });
});

describe('GET /inbox/stream?ticket=', () => {
  it('vé hợp lệ → được chấp nhận: nạp user theo userId trong vé, ngữ cảnh self', async () => {
    const { body } = await mint();

    const res = await request(app).get('/api/ai/chatbot/inbox/stream').query({ ticket: body.data.ticket });

    expect(mockResolveUserContext).toHaveBeenCalledWith(7, { ownerContextId: null });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TEST_STOP');
  });

  it('vé chỉ dùng được MỘT lần: lần hai → 401 SSE_TICKET_INVALID, không nạp user', async () => {
    const { body } = await mint();
    await request(app).get('/api/ai/chatbot/inbox/stream').query({ ticket: body.data.ticket });
    mockResolveUserContext.mockClear();

    const second = await request(app).get('/api/ai/chatbot/inbox/stream').query({ ticket: body.data.ticket });

    expect(second.status).toBe(401);
    expect(second.body.code).toBe('SSE_TICKET_INVALID');
    expect(mockResolveUserContext).not.toHaveBeenCalled();
  });

  it('vé hết hạn (sau 60 giây) → 401, không nạp user', async () => {
    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow);
    const { body } = await mint();
    nowSpy.mockReturnValue(realNow + 61_000);

    const res = await request(app).get('/api/ai/chatbot/inbox/stream').query({ ticket: body.data.ticket });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SSE_TICKET_INVALID');
    expect(mockResolveUserContext).not.toHaveBeenCalled();
  });

  it('vé bịa → 401', async () => {
    const res = await request(app).get('/api/ai/chatbot/inbox/stream').query({ ticket: 've-bia-khong-ton-tai' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SSE_TICKET_INVALID');
    expect(mockResolveUserContext).not.toHaveBeenCalled();
  });

  it('nhân viên: chủ không gian làm việc lấy từ VÉ (server ghi lúc xin), query ownerContext bị bỏ qua', async () => {
    currentUser = { id: 31, activeContext: { type: 'employee', ownerId: 42, membershipId: 5 } };
    const { body } = await mint();

    await request(app)
      .get('/api/ai/chatbot/inbox/stream')
      .query({ ticket: body.data.ticket, ownerContext: 999 });

    expect(mockResolveUserContext).toHaveBeenCalledWith(31, { ownerContextId: 42 });
  });

  it('không có vé và không có token → 401', async () => {
    const res = await request(app).get('/api/ai/chatbot/inbox/stream');

    expect(res.status).toBe(401);
    expect(mockResolveUserContext).not.toHaveBeenCalled();
  });
});

describe('GET /inbox/stream — nhịp sống (H-26)', () => {
  it('heartbeat 30 giây là sự kiện `ping` thật, không phải dòng chú thích `: heartbeat`', async () => {
    jest.useFakeTimers();
    try {
      mockResolveUserContext.mockResolvedValue({ id: 7, activeContext: { type: 'self', ownerId: 7 } });
      const { ticket } = ticketService.issueSseTicket({ userId: 7 });
      const layer = router.stack.find((l) => l.route?.path === '/inbox/stream');
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;

      const closeHandlers = [];
      const req = { query: { ticket }, on: (event, fn) => { if (event === 'close') closeHandlers.push(fn); } };
      const res = {
        headersSent: false,
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await handler(req, res);
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: connected'));
      res.write.mockClear();

      jest.advanceTimersByTime(30_000);

      expect(res.write).toHaveBeenCalledWith('event: ping\ndata: {}\n\n');
      expect(res.write).not.toHaveBeenCalledWith(expect.stringContaining(': heartbeat'));
      closeHandlers.forEach((fn) => fn());
    } finally {
      jest.useRealTimers();
    }
  });
});

import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * PLAN_TAO_CHIEN_DICH_TUNG_BUOC_2026-10-14 PR-1 — đấu dây route `/api/campaigns/simple[/preview]`.
 *
 * `channelEntitlementContext` BẮT BUỘC: compileCampaign/validateNodeConfig đọc quyền kênh theo gói từ ngữ cảnh middleware này đặt
 * (`isChannelBlockedByPlan`). `employeeRoutePolicy.spec.js` giả lập middleware thành no-op nên không bắt được việc nó biến mất khỏi
 * route — spec này giả lập nó thành một middleware CÓ DẤU VẾT để ghim đúng điều đó.
 */
const mockAuthMiddleware = (req, res, next) => {
  req.user = {
    id: 1,
    role: 'user',
    phone: '0900000001',
    activeContext: { type: 'self', contextPlanId: 1 },
  };
  next();
};

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: mockAuthMiddleware,
  resolveUserContext: jest.fn(),
  optionalAuthMiddleware: (req, res, next) => next(),
  attachUserIdForRateLimit: (req, res, next) => next(),
  attachSseUserIdForRateLimit: (req, res, next) => next(),
}));

jest.unstable_mockModule('../../middleware/rateLimiter.middleware.js', () => ({
  uploadLimiter: (req, res, next) => next(),
  campaignRunLimiter: (req, res, next) => next(),
  campaignShareLimiter: (req, res, next) => next(),
  quickSendTestLimiter: (req, res, next) => next(),
}));

jest.unstable_mockModule('../../middleware/storageCapacity.middleware.js', () => ({
  storageCapacityGuard: () => (req, res, next) => next(),
}));

jest.unstable_mockModule('../../middleware/channelEntitlement.middleware.js', () => {
  const channelEntitlementContext = (req, res, next) => {
    req.entitlementContextRan = true;
    next();
  };
  return { channelEntitlementContext, default: channelEntitlementContext };
});

const makeMockController = (name) => new Proxy({}, {
  get: (_target, prop) => (req, res) => res.json({ success: true, controller: name, method: String(prop) }),
});

jest.unstable_mockModule('../../controllers/campaign.controller.js', () => ({ default: makeMockController('campaign') }));
jest.unstable_mockModule('../../controllers/campaignShare.controller.js', () => ({ default: makeMockController('campaignShare') }));
jest.unstable_mockModule('../../controllers/channelAccountSendSettings.controller.js', () => ({ default: makeMockController('sendSettings') }));
jest.unstable_mockModule('../../controllers/founderai.controller.js', () => ({ default: makeMockController('founderai') }));
jest.unstable_mockModule('../../controllers/campaignSimple.controller.js', () => ({
  default: {
    preview: (req, res) => res.json({ success: true, method: 'preview', entitlementContextRan: req.entitlementContextRan === true }),
    create: (req, res) => res.json({ success: true, method: 'create', entitlementContextRan: req.entitlementContextRan === true }),
  },
}));

const { default: campaignRoutes } = await import('../campaign.routes.js');

const app = express();
app.use(express.json());
app.use('/api/campaigns', campaignRoutes);

describe('POST /api/campaigns/simple[/preview] — route wiring', () => {
  it('preview đi qua channelEntitlementContext rồi mới tới controller', async () => {
    const res = await request(app).post('/api/campaigns/simple/preview').send({});
    expect(res.status).toBe(200);
    expect(res.body.method).toBe('preview');
    expect(res.body.entitlementContextRan).toBe(true);
  });

  it('create đi qua channelEntitlementContext rồi mới tới controller', async () => {
    const res = await request(app).post('/api/campaigns/simple').send({});
    expect(res.status).toBe(200);
    expect(res.body.method).toBe('create');
    expect(res.body.entitlementContextRan).toBe(true);
  });
});

describe('đường hai đoạn của /:id', () => {
  it('GET|PUT /:id/simple đã gỡ (chế độ sửa của trình từng bước): không còn route, trả 404', async () => {
    expect((await request(app).get('/api/campaigns/42/simple')).status).toBe(404);
    expect((await request(app).put('/api/campaigns/42/simple').send({})).status).toBe(404);
  });

  it('các đường hai đoạn cũ không bị đổi: GET /:id/estimate vẫn tới controller estimate', async () => {
    const res = await request(app).get('/api/campaigns/42/estimate');
    expect(res.body.method).toBe('getEstimate');
  });
});

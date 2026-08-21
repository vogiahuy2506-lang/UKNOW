import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Mock authentication to inject arbitrary req.user / activeContext
let currentTestUser = null;

const mockAuthMiddleware = (req, res, next) => {
  if (!currentTestUser) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  req.user = currentTestUser;
  next();
};

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: mockAuthMiddleware,
  resolveUserContext: jest.fn(),
  optionalAuthMiddleware: (req, res, next) => next(),
  attachUserIdForRateLimit: (req, res, next) => next(),
  attachSseUserIdForRateLimit: (req, res, next) => next(),
}));

// Mock rate limiters to avoid delay
jest.unstable_mockModule('../../middleware/rateLimiter.middleware.js', () => ({
  aiLimiter: (req, res, next) => next(),
  uploadLimiter: (req, res, next) => next(),
  sseLimiter: (req, res, next) => next(),
  campaignRunLimiter: (req, res, next) => next(),
  quickSendTestLimiter: (req, res, next) => next(),
}));

// Mock AI credit check
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({
  assertAiCreditAvailable: () => (req, res, next) => next(),
}));

// Mock storageCapacityGuard
jest.unstable_mockModule('../../middleware/storageCapacity.middleware.js', () => ({
  storageCapacityGuard: () => (req, res, next) => next(),
}));

// Generic controller proxy mock
const makeMockController = (name) => new Proxy({}, {
  get: (_target, prop) => {
    const fn = (req, res) => res.json({ success: true, controller: name, method: String(prop) });
    return fn;
  },
});

// Mock controllers to return simple 200 OK
jest.unstable_mockModule('../../controllers/landingPageAdmin.controller.js', () => ({
  default: makeMockController('landingPageAdmin'),
}));

jest.unstable_mockModule('../../controllers/customer.controller.js', () => ({
  default: makeMockController('customer'),
}));

jest.unstable_mockModule('../../controllers/emailSettings.controller.js', () => ({
  default: makeMockController('emailSettings'),
}));

jest.unstable_mockModule('../../controllers/zaloSettings.controller.js', () => ({
  default: makeMockController('zaloSettings'),
}));

jest.unstable_mockModule('../../controllers/emailTemplate.controller.js', () => ({
  default: makeMockController('emailTemplate'),
}));

jest.unstable_mockModule('../../controllers/zaloTemplate.controller.js', () => ({
  default: makeMockController('zaloTemplate'),
}));

jest.unstable_mockModule('../../controllers/templateLabel.controller.js', () => ({
  default: makeMockController('templateLabel'),
}));

jest.unstable_mockModule('../../controllers/campaignSchedule.controller.js', () => ({
  default: class {
    constructor() {
      return makeMockController('campaignSchedule');
    }
  },
}));

jest.unstable_mockModule('../../controllers/ai.controller.js', () => ({
  default: makeMockController('ai'),
}));

jest.unstable_mockModule('../../controllers/googleSheets.controller.js', () => ({
  default: makeMockController('googleSheets'),
}));

jest.unstable_mockModule('../../controllers/founderai.controller.js', () => ({
  default: makeMockController('founderai'),
}));

jest.unstable_mockModule('../../controllers/chatbot.controller.js', () => ({
  default: makeMockController('chatbot'),
}));

jest.unstable_mockModule('../../controllers/unifiedInbox.controller.js', () => ({
  default: makeMockController('unifiedInbox'),
}));

jest.unstable_mockModule('../../controllers/chatbot/aiActivity.controller.js', () => ({
  default: makeMockController('aiActivity'),
}));

jest.unstable_mockModule('../../controllers/zaloPersonalSync.controller.js', () => ({
  default: makeMockController('zaloPersonalSync'),
}));

jest.unstable_mockModule('../../controllers/mediaLibrary.controller.js', () => {
  const controller = makeMockController('mediaLibrary');
  return {
    listMediaLibrary: controller.listMediaLibrary,
    listChannelMedia: controller.listChannelMedia,
    listStorageObjects: controller.listStorageObjects,
    deleteStorageObject: controller.deleteStorageObject,
  };
});

jest.unstable_mockModule('../../controllers/upload.controller.js', () => ({
  default: makeMockController('upload'),
}));

// Import routes after mocking
const { default: adminLandingPageRoutes } = await import('../adminLandingPage.routes.js');
const { default: customerRoutes } = await import('../customer.routes.js');
const { default: emailSettingsRoutes } = await import('../emailSettings.routes.js');
const { default: zaloSettingsRoutes } = await import('../zaloSettings.routes.js');
const { default: emailTemplateRoutes } = await import('../emailTemplate.routes.js');
const { default: zaloTemplateRoutes } = await import('../zaloTemplate.routes.js');
const { default: templateLabelRoutes } = await import('../templateLabel.routes.js');
const { default: campaignScheduleRoutes } = await import('../campaignSchedule.routes.js');
const { default: aiRoutes } = await import('../ai.routes.js');
const { default: googleSheetsRoutes } = await import('../googleSheets.routes.js');
const { default: founderaiRoutes } = await import('../founderai.routes.js');
const { default: chatbotRoutes } = await import('../chatbot.routes.js');
const { default: mediaLibraryRoutes } = await import('../mediaLibrary.routes.js');
const { default: uploadRoutes } = await import('../upload.routes.js');

const app = express();
app.use(express.json());
app.use('/api/admin/landing-pages', adminLandingPageRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/email-settings', emailSettingsRoutes);
app.use('/api/zalo', zaloSettingsRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/zalo-templates', zaloTemplateRoutes);
app.use('/api/template-labels', templateLabelRoutes);
app.use('/api/campaign-schedules', campaignScheduleRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/google-sheets', googleSheetsRoutes);
app.use('/api/founderai', founderaiRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/media-library', mediaLibraryRoutes);
app.use('/api/uploads', uploadRoutes);

describe('Employee Route Policy & RBAC Enforcement Matrix', () => {
  const selfUser = {
    id: 1,
    role: 'user',
    activeContext: { type: 'self', contextPlanId: 1 },
  };

  const createEmployee = (permissions = {}) => ({
    id: 2,
    role: 'user',
    activeContext: {
      type: 'employee',
      ownerId: 1,
      contextPlanId: 1,
      permissions,
    },
  });

  describe('1. Landing Pages (/api/admin/landing-pages)', () => {
    it('blocks employee without landing_pages permission (403)', async () => {
      currentTestUser = createEmployee({ landing_pages: false });
      const res = await request(app).get('/api/admin/landing-pages');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('allows employee with landing_pages permission (200)', async () => {
      currentTestUser = createEmployee({ landing_pages: true });
      const res = await request(app).get('/api/admin/landing-pages');
      expect(res.status).toBe(200);
      expect(res.body.method).toBe('list');
    });

    it('allows owner in self context (200)', async () => {
      currentTestUser = selfUser;
      const res = await request(app).get('/api/admin/landing-pages');
      expect(res.status).toBe(200);
    });
  });

  describe('2. Customer Routes (/api/customers)', () => {
    it('blocks customer read when customers permission is missing (403)', async () => {
      currentTestUser = createEmployee({ customers: false });
      const res = await request(app).get('/api/customers');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('allows customer read when customers permission is true (200)', async () => {
      currentTestUser = createEmployee({ customers: true });
      const res = await request(app).get('/api/customers');
      expect(res.status).toBe(200);
      expect(res.body.method).toBe('getAll');
    });
  });

  describe('3. Channel Settings (/api/email-settings & /api/zalo)', () => {
    it('blocks email settings read when email_settings is false', async () => {
      currentTestUser = createEmployee({ email_settings: false });
      const res = await request(app).get('/api/email-settings');
      expect(res.status).toBe(403);
    });

    it('allows email settings read when email_settings is true', async () => {
      currentTestUser = createEmployee({ email_settings: true });
      const res = await request(app).get('/api/email-settings');
      expect(res.status).toBe(200);
    });

    it('blocks zalo accounts read when zalo_settings is false', async () => {
      currentTestUser = createEmployee({ zalo_settings: false });
      const res = await request(app).get('/api/zalo/accounts');
      expect(res.status).toBe(403);
    });

    it('allows zalo accounts read when zalo_settings is true', async () => {
      currentTestUser = createEmployee({ zalo_settings: true });
      const res = await request(app).get('/api/zalo/accounts');
      expect(res.status).toBe(200);
    });
  });

  describe('4. Templates & Template Labels', () => {
    it('template labels allowed if user has email_templates OR zalo_templates', async () => {
      currentTestUser = createEmployee({ email_templates: true, zalo_templates: false });
      const res1 = await request(app).get('/api/template-labels');
      expect(res1.status).toBe(200);

      currentTestUser = createEmployee({ email_templates: false, zalo_templates: true });
      const res2 = await request(app).get('/api/template-labels');
      expect(res2.status).toBe(200);
    });

    it('template labels blocked if user has neither template permission', async () => {
      currentTestUser = createEmployee({ email_templates: false, zalo_templates: false });
      const res = await request(app).get('/api/template-labels');
      expect(res.status).toBe(403);
    });
  });

  describe('5. Campaign Schedules (/api/campaign-schedules)', () => {
    it('blocks schedule list without campaigns_view permission', async () => {
      currentTestUser = createEmployee({ campaigns_view: false });
      const res = await request(app).get('/api/campaign-schedules');
      expect(res.status).toBe(403);
    });

    it('allows schedule list with campaigns_view permission', async () => {
      currentTestUser = createEmployee({ campaigns_view: true });
      const res = await request(app).get('/api/campaign-schedules');
      expect(res.status).toBe(200);
    });
  });

  describe('6. AI Campaign & Landing Bypass Guards (/api/ai)', () => {
    it('blocks /generate-campaign without campaigns_create', async () => {
      currentTestUser = createEmployee({ campaigns_create: false, campaigns_view: true });
      const res = await request(app).post('/api/ai/generate-campaign').send({});
      expect(res.status).toBe(403);
    });

    it('blocks /create-from-draft without campaigns_create', async () => {
      currentTestUser = createEmployee({ campaigns_create: false, campaigns_view: true });
      const res = await request(app).post('/api/ai/create-from-draft').send({});
      expect(res.status).toBe(403);
    });

    it('blocks /create-and-run-campaign without campaigns_run', async () => {
      currentTestUser = createEmployee({ campaigns_create: true, campaigns_run: false });
      const res = await request(app).post('/api/ai/create-and-run-campaign').send({});
      expect(res.status).toBe(403);
    });

    it('blocks /create-and-run-campaign without campaigns_create', async () => {
      currentTestUser = createEmployee({ campaigns_create: false, campaigns_run: true });
      const res = await request(app).post('/api/ai/create-and-run-campaign').send({});
      expect(res.status).toBe(403);
    });

    it('blocks /generate-landing-html without landing_pages', async () => {
      currentTestUser = createEmployee({ landing_pages: false });
      const res = await request(app).post('/api/ai/generate-landing-html').send({});
      expect(res.status).toBe(403);
    });

    it('allows /create-and-run-campaign when employee has campaigns_run', async () => {
      currentTestUser = createEmployee({ campaigns_create: true, campaigns_run: true });
      const res = await request(app).post('/api/ai/create-and-run-campaign').send({});
      expect(res.status).toBe(200);
    });
  });

  describe('7. Workspace integrations', () => {
    it('guards Google Sheets preview with campaigns_view', async () => {
      currentTestUser = createEmployee({ campaigns_view: false });
      const blocked = await request(app).post('/api/google-sheets/preview').send({});
      expect(blocked.status).toBe(403);

      currentTestUser = createEmployee({ campaigns_view: true });
      const allowed = await request(app).post('/api/google-sheets/preview').send({});
      expect(allowed.status).toBe(200);
    });

    it('guards FounderAI customer and course sync by matching resource permission', async () => {
      currentTestUser = createEmployee({ customers: false, courses: true });
      const customerBlocked = await request(app).post('/api/founderai/sync/customers');
      expect(customerBlocked.status).toBe(403);
      const courseAllowed = await request(app).post('/api/founderai/sync/courses');
      expect(courseAllowed.status).toBe(200);

      currentTestUser = createEmployee({ customers: true, courses: false });
      const customerAllowed = await request(app).post('/api/founderai/sync/customers');
      expect(customerAllowed.status).toBe(200);
      const courseBlocked = await request(app).post('/api/founderai/sync/courses');
      expect(courseBlocked.status).toBe(403);
    });
  });

  describe('8. Chatbot, Inbox, and Media delegation', () => {
    it('guards Chatbot Studio and KB routes with chatbots_manage', async () => {
      currentTestUser = createEmployee({ chatbots_manage: false });
      const studioBlocked = await request(app).get('/api/ai/chatbot-studio/conversations');
      const kbBlocked = await request(app).get('/api/chatbot/kb');
      expect(studioBlocked.status).toBe(403);
      expect(kbBlocked.status).toBe(403);

      currentTestUser = createEmployee({ chatbots_manage: true });
      const studioAllowed = await request(app).get('/api/ai/chatbot-studio/conversations');
      const kbAllowed = await request(app).get('/api/chatbot/kb');
      expect(studioAllowed.status).toBe(200);
      expect(kbAllowed.status).toBe(200);
    });

    it('keeps share and AI-credit summary operations owner-only', async () => {
      currentTestUser = createEmployee({
        chatbots_manage: true,
        inbox_view: true,
        inbox_manage: true,
      });
      const share = await request(app).post('/api/chatbot/custom-chatbots/10/share');
      const summary = await request(app).post('/api/chatbot/inbox/ai-activity/summarize');
      expect(share.status).toBe(403);
      expect(share.body.code).toBe('OWNER_ONLY');
      expect(summary.status).toBe(403);
      expect(summary.body.code).toBe('OWNER_ONLY');
    });

    it('separates chatbot channel management from chatbot CRUD', async () => {
      currentTestUser = createEmployee({
        chatbots_manage: true,
        chatbot_channels_manage: false,
      });
      const blocked = await request(app).get('/api/chatbot/channels');
      expect(blocked.status).toBe(403);

      currentTestUser = createEmployee({ chatbot_channels_manage: true });
      const allowed = await request(app).get('/api/chatbot/channels');
      expect(allowed.status).toBe(200);
    });

    it('separates inbox view, reply, and destructive management', async () => {
      currentTestUser = createEmployee({
        inbox_view: true,
        inbox_reply: false,
        inbox_manage: false,
      });
      const list = await request(app).get('/api/chatbot/inbox/conversations');
      const replyBlocked = await request(app)
        .post('/api/chatbot/inbox/conversations/10/messages')
        .send({ content: 'hello' });
      const deleteBlocked = await request(app).delete('/api/chatbot/inbox/conversations/10');
      expect(list.status).toBe(200);
      expect(replyBlocked.status).toBe(403);
      expect(deleteBlocked.status).toBe(403);

      currentTestUser = createEmployee({
        inbox_view: true,
        inbox_reply: true,
        inbox_manage: true,
      });
      const replyAllowed = await request(app)
        .post('/api/chatbot/inbox/conversations/10/messages')
        .send({ content: 'hello' });
      const deleteAllowed = await request(app).delete('/api/chatbot/inbox/conversations/10');
      expect(replyAllowed.status).toBe(200);
      expect(deleteAllowed.status).toBe(200);
    });

    it('separates media view and management, including generic upload routes', async () => {
      currentTestUser = createEmployee({
        media_library_view: true,
        media_library_manage: false,
      });
      const list = await request(app).get('/api/media-library/objects');
      const deleteBlocked = await request(app).delete('/api/media-library/objects/10');
      const promoteBlocked = await request(app).post('/api/uploads/promote').send({});
      const signedAllowed = await request(app).get('/api/uploads/signed-url/uploads%2F1%2Ffile.png');
      expect(list.status).toBe(200);
      expect(deleteBlocked.status).toBe(403);
      expect(promoteBlocked.status).toBe(403);
      expect(signedAllowed.status).toBe(200);

      currentTestUser = createEmployee({ media_library_manage: true });
      const deleteAllowed = await request(app).delete('/api/media-library/objects/10');
      const promoteAllowed = await request(app).post('/api/uploads/promote').send({});
      expect(deleteAllowed.status).toBe(200);
      expect(promoteAllowed.status).toBe(200);
    });
  });
});

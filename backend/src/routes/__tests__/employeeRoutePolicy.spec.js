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
  marketplacePurchaseLimiter: (req, res, next) => next(),
  webhookLimiter: (req, res, next) => next(),
  publicLeadLimiter: (req, res, next) => next(),
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

jest.unstable_mockModule('../../controllers/dashboard.controller.js', () => ({
  default: makeMockController('dashboard'),
  validateDashboardInsightsPayload: (req, res, next) => next(),
}));

jest.unstable_mockModule('../../controllers/marketplace.controller.js', () => ({
  default: makeMockController('marketplace'),
}));

jest.unstable_mockModule('../../controllers/payment.controller.js', () => {
  const controller = makeMockController('payment');
  return {
    activateFree: controller.activateFree,
    createPayment: controller.createPayment,
    createCustomPayment: controller.createCustomPayment,
    getPaymentStatus: controller.getPaymentStatus,
    webhook: controller.webhook,
    einvoiceWebhook: controller.einvoiceWebhook,
    getInvoiceForOrder: controller.getInvoiceForOrder,
    downloadInvoicePdf: controller.downloadInvoicePdf,
    resolvePlanChangePreview: controller.resolvePlanChangePreview,
  };
});

jest.unstable_mockModule('../../controllers/campaign.controller.js', () => ({
  default: makeMockController('campaign'),
}));

jest.unstable_mockModule('../../controllers/campaignShare.controller.js', () => ({
  default: makeMockController('campaignShare'),
}));

jest.unstable_mockModule('../../controllers/scheduledPlanChange.controller.js', () => {
  const controller = makeMockController('scheduledPlanChange');
  return {
    getScheduledPlanChange: controller.getScheduledPlanChange,
  };
});

// Import routes after mocking
const { default: adminLandingPageRoutes } = await import('../adminLandingPage.routes.js');
const { default: customerRoutes } = await import('../customer.routes.js');
const { default: emailSettingsRoutes } = await import('../emailSettings.routes.js');
const { default: zaloSettingsRoutes } = await import('../zaloSettings.routes.js');
const { default: emailTemplateRoutes } = await import('../emailTemplate.routes.js');
const { default: zaloTemplateRoutes } = await import('../zaloTemplate.routes.js');
const { default: templateLabelRoutes } = await import('../templateLabel.routes.js');
const { default: campaignScheduleRoutes } = await import('../campaignSchedule.routes.js');
const { default: campaignRoutes } = await import('../campaign.routes.js');
const { default: aiRoutes } = await import('../ai.routes.js');
const { default: googleSheetsRoutes } = await import('../googleSheets.routes.js');
const { default: founderaiRoutes } = await import('../founderai.routes.js');
const { default: chatbotRoutes } = await import('../chatbot.routes.js');
const { default: mediaLibraryRoutes } = await import('../mediaLibrary.routes.js');
const { default: uploadRoutes } = await import('../upload.routes.js');
const { default: dashboardRoutes } = await import('../dashboard.routes.js');
const { default: marketplaceRoutes } = await import('../marketplace.routes.js');
const { default: paymentRoutes } = await import('../payment.routes.js');

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
app.use('/api/campaigns', campaignRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/google-sheets', googleSheetsRoutes);
app.use('/api/founderai', founderaiRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/media-library', mediaLibraryRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/payments', paymentRoutes);

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
    it('guards Google Sheets preview and check with integrations_manage', async () => {
      currentTestUser = createEmployee({ integrations_manage: false });
      const previewBlocked = await request(app).post('/api/google-sheets/preview').send({});
      const checkBlocked = await request(app).post('/api/google-sheets/check').send({});
      expect(previewBlocked.status).toBe(403);
      expect(checkBlocked.status).toBe(403);

      currentTestUser = createEmployee({ integrations_manage: true });
      const previewAllowed = await request(app).post('/api/google-sheets/preview').send({});
      const checkAllowed = await request(app).post('/api/google-sheets/check').send({});
      expect(previewAllowed.status).toBe(200);
      expect(checkAllowed.status).toBe(200);
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

  describe('9. Dashboard & Reports (/api/dashboard)', () => {
    it('blocks dashboard endpoints when reports_view permission is missing (403)', async () => {
      currentTestUser = createEmployee({ reports_view: false });
      const overview = await request(app).get('/api/dashboard/overview');
      const analytics = await request(app).get('/api/dashboard/analytics');
      const runs = await request(app).get('/api/dashboard/runs');
      const topLists = await request(app).get('/api/dashboard/top-lists');
      const compare = await request(app).get('/api/dashboard/compare');
      const insights = await request(app).get('/api/dashboard/insights/saved');

      expect(overview.status).toBe(403);
      expect(overview.body.code).toBe('PERMISSION_DENIED');
      expect(analytics.status).toBe(403);
      expect(runs.status).toBe(403);
      expect(topLists.status).toBe(403);
      expect(compare.status).toBe(403);
      expect(insights.status).toBe(403);
    });

    it('allows dashboard endpoints when reports_view permission is true (200)', async () => {
      currentTestUser = createEmployee({ reports_view: true });
      const overview = await request(app).get('/api/dashboard/overview');
      const analytics = await request(app).get('/api/dashboard/analytics');
      const runs = await request(app).get('/api/dashboard/runs');
      const topLists = await request(app).get('/api/dashboard/top-lists');
      const compare = await request(app).get('/api/dashboard/compare');
      const insights = await request(app).get('/api/dashboard/insights/saved');

      expect(overview.status).toBe(200);
      expect(analytics.status).toBe(200);
      expect(runs.status).toBe(200);
      expect(topLists.status).toBe(200);
      expect(compare.status).toBe(200);
      expect(insights.status).toBe(200);
    });

    it('keeps /orders self-only (blocked for employees even with reports_view)', async () => {
      currentTestUser = createEmployee({ reports_view: true });
      const res = await request(app).get('/api/dashboard/orders');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('OWNER_ONLY');

      currentTestUser = selfUser;
      const ownerRes = await request(app).get('/api/dashboard/orders');
      expect(ownerRes.status).toBe(200);
    });
  });

  describe('10. AI Assistant & Sessions (/api/ai)', () => {
    it('blocks AI chat and sessions when ai_assistant_use permission is missing (403)', async () => {
      currentTestUser = createEmployee({ ai_assistant_use: false });
      const chat = await request(app).post('/api/ai/chat').send({ message: 'hi' });
      const chatV2 = await request(app).post('/api/ai/chat-v2').send({ message: 'hi' });
      const sessions = await request(app).get('/api/ai/sessions');
      const sessionMsg = await request(app).get('/api/ai/sessions/1/messages');
      const delSession = await request(app).delete('/api/ai/sessions/1');
      const patchState = await request(app).patch('/api/ai/sessions/1/wizard-state').send({});

      expect(chat.status).toBe(403);
      expect(chat.body.code).toBe('PERMISSION_DENIED');
      expect(chatV2.status).toBe(403);
      expect(sessions.status).toBe(403);
      expect(sessionMsg.status).toBe(403);
      expect(delSession.status).toBe(403);
      expect(patchState.status).toBe(403);
    });

    it('allows AI chat and sessions when ai_assistant_use permission is true (200)', async () => {
      currentTestUser = createEmployee({ ai_assistant_use: true });
      const chat = await request(app).post('/api/ai/chat').send({ message: 'hi' });
      const chatV2 = await request(app).post('/api/ai/chat-v2').send({ message: 'hi' });
      const sessions = await request(app).get('/api/ai/sessions');
      const sessionMsg = await request(app).get('/api/ai/sessions/1/messages');
      const delSession = await request(app).delete('/api/ai/sessions/1');
      const patchState = await request(app).patch('/api/ai/sessions/1/wizard-state').send({});

      expect(chat.status).toBe(200);
      expect(chatV2.status).toBe(200);
      expect(sessions.status).toBe(200);
      expect(sessionMsg.status).toBe(200);
      expect(delSession.status).toBe(200);
      expect(patchState.status).toBe(200);
    });

    it('keeps business-profile self-only', async () => {
      currentTestUser = createEmployee({ ai_assistant_use: true });
      const res = await request(app).get('/api/ai/business-profile');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('OWNER_ONLY');

      currentTestUser = selfUser;
      const ownerRes = await request(app).get('/api/ai/business-profile');
      expect(ownerRes.status).toBe(200);
    });
  });

  describe('11. Marketplace (/api/marketplace)', () => {
    it('allows public browsing without special permission', async () => {
      currentTestUser = createEmployee({});
      const browse = await request(app).get('/api/marketplace/browse');
      const featured = await request(app).get('/api/marketplace/featured');
      const categories = await request(app).get('/api/marketplace/categories');

      expect(browse.status).toBe(200);
      expect(featured.status).toBe(200);
      expect(categories.status).toBe(200);
    });

    it('separates marketplace_manage and marketplace_purchase', async () => {
      currentTestUser = createEmployee({
        marketplace_manage: true,
        marketplace_purchase: false,
      });

      const getListings = await request(app).get('/api/marketplace/listings');
      const getChatbots = await request(app).get('/api/marketplace/chatbots');
      const purchaseBlocked = await request(app).post('/api/marketplace/purchase/1');
      const purchasesBlocked = await request(app).get('/api/marketplace/purchases');

      expect(getListings.status).toBe(200);
      expect(getChatbots.status).toBe(200);
      expect(purchaseBlocked.status).toBe(403);
      expect(purchaseBlocked.body.code).toBe('PERMISSION_DENIED');
      expect(purchasesBlocked.status).toBe(403);

      currentTestUser = createEmployee({
        marketplace_manage: false,
        marketplace_purchase: true,
      });

      const getListingsBlocked = await request(app).get('/api/marketplace/listings');
      const purchaseAllowed = await request(app).post('/api/marketplace/purchase/1');
      const purchasesAllowed = await request(app).get('/api/marketplace/purchases');

      expect(getListingsBlocked.status).toBe(403);
      expect(purchaseAllowed.status).toBe(200);
      expect(purchasesAllowed.status).toBe(200);
    });
  });

  describe('12. Payment & Subscriptions (/api/payments)', () => {
    it('blocks employee from payment creation, plan change, free activation, and invoice download', async () => {
      currentTestUser = createEmployee({ reports_view: true, marketplace_purchase: true });

      const scheduledChange = await request(app).get('/api/payments/scheduled-change');
      const createPayment = await request(app).post('/api/payments/create-payment');
      const createCustom = await request(app).post('/api/payments/create-custom-payment');
      const activateFree = await request(app).post('/api/payments/activate-free');
      const invoice = await request(app).get('/api/payments/invoice/ORDER123');
      const invoicePdf = await request(app).get('/api/payments/invoice/ORDER123/pdf');

      expect(scheduledChange.status).toBe(403);
      expect(scheduledChange.body.code).toBe('OWNER_ONLY');
      expect(createPayment.status).toBe(403);
      expect(createPayment.body.code).toBe('OWNER_ONLY');
      expect(createCustom.status).toBe(403);
      expect(createCustom.body.code).toBe('OWNER_ONLY');
      expect(activateFree.status).toBe(403);
      expect(activateFree.body.code).toBe('OWNER_ONLY');
      expect(invoice.status).toBe(403);
      expect(invoice.body.code).toBe('OWNER_ONLY');
      expect(invoicePdf.status).toBe(403);
      expect(invoicePdf.body.code).toBe('OWNER_ONLY');
    });

    it('allows owner in self context for payment operations', async () => {
      currentTestUser = selfUser;

      const scheduledChange = await request(app).get('/api/payments/scheduled-change');
      const createPayment = await request(app).post('/api/payments/create-payment');
      const createCustom = await request(app).post('/api/payments/create-custom-payment');
      const activateFree = await request(app).post('/api/payments/activate-free');
      const invoice = await request(app).get('/api/payments/invoice/ORDER123');
      const invoicePdf = await request(app).get('/api/payments/invoice/ORDER123/pdf');

      expect(scheduledChange.status).toBe(200);
      expect(createPayment.status).toBe(200);
      expect(createCustom.status).toBe(200);
      expect(activateFree.status).toBe(200);
      expect(invoice.status).toBe(200);
      expect(invoicePdf.status).toBe(200);
    });
  });

  describe('13. Campaign Approval (/api/campaigns/:id/approve & reject)', () => {
    it('blocks employee from approving or rejecting campaigns (owner-only)', async () => {
      currentTestUser = createEmployee({ campaigns_run: true, campaigns_create: true });

      const approveRes = await request(app).post('/api/campaigns/1/approve');
      const rejectRes = await request(app).post('/api/campaigns/1/reject');

      expect(approveRes.status).toBe(403);
      expect(approveRes.body.code).toBe('OWNER_ONLY');
      expect(rejectRes.status).toBe(403);
      expect(rejectRes.body.code).toBe('OWNER_ONLY');
    });

    it('allows owner in self context to approve or reject campaigns', async () => {
      currentTestUser = selfUser;

      const approveRes = await request(app).post('/api/campaigns/1/approve');
      const rejectRes = await request(app).post('/api/campaigns/1/reject');

      expect(approveRes.status).toBe(200);
      expect(rejectRes.status).toBe(200);
    });
  });
});

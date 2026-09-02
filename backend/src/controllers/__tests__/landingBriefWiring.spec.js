import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGenerate = jest.fn();
const mockGenerateLandingPage = jest.fn();
const mockResolveLandingBrief = jest.fn();
const mockBuildLandingBriefContext = jest.fn();
const mockChargeAiCredit = jest.fn();
const mockSaveMessages = jest.fn();

jest.unstable_mockModule('../../services/ai/aiLandingPage.service.js', () => ({
  default: { generate: mockGenerate },
}));
jest.unstable_mockModule('../../services/landingTemplate/landingTemplate.service.js', () => ({
  default: { generateLandingPage: mockGenerateLandingPage },
}));
jest.unstable_mockModule('../../services/ai/landingBrief.service.js', () => ({
  resolveLandingBrief: mockResolveLandingBrief,
  buildLandingBriefContext: mockBuildLandingBriefContext,
  resolveOwnerUserId: (user) => (
    user?.activeContext?.type === 'employee' && user.activeContext.ownerId != null
      ? Number(user.activeContext.ownerId)
      : Number(user?.id)
  ),
}));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({
  chargeAiCredit: mockChargeAiCredit,
}));
jest.unstable_mockModule('../../repositories/aiSession.repository.js', () => ({
  saveMessages: mockSaveMessages,
  createSession: jest.fn(),
  getSessionWizardState: jest.fn(),
  saveAssistantMessage: jest.fn(),
}));
jest.unstable_mockModule('../../services/ai/aiCampaign.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiCampaignDraft.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/campaignConfirmation.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/businessProfile.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/customChat.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/chatbotStudioConversation.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/chatAttachment.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiModelPolicy.service.js', () => ({
  getAllowedModelsForUser: jest.fn(),
  savePreferredModelForUser: jest.fn(),
}));
jest.unstable_mockModule('../../services/help/helpAssistant.service.js', () => ({
  tryHandleHelpChat: jest.fn(async () => null),
  HELP_ROUTE_LABELS: {
    hỏi_đáp: 'hỏi_đáp',
    làm_giúp: 'làm_giúp',
    không_rõ: 'không_rõ',
    ngoài_phạm_vi: 'ngoài_phạm_vi',
  },
}));
jest.unstable_mockModule('../campaign.controller.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignNodeRegistry.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  default: { log: jest.fn() },
  AUDIT_ACTIONS: {},
  AUDIT_ENTITY_TYPES: {},
}));
jest.unstable_mockModule('../../utils/manualRecipients.util.js', () => ({
  MAX_AI_MANUAL_RECIPIENTS: 1000,
  MAX_SHEET_RECIPIENTS: 10000,
  validateManualRecipients: jest.fn(),
}));
jest.unstable_mockModule('../../services/ai/aiCampaignWizard.service.js', () => ({
  applyWizardStateAction: jest.fn(),
  normalizeWizardState: jest.fn(),
  isWizardAnswerTurn: jest.fn(() => false),
}));

const { default: aiController } = await import('../ai.controller.js');
const { default: landingTemplateController } = await import('../landingTemplate.controller.js');

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
};

describe('LandingBrief endpoint wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildLandingBriefContext.mockReturnValue('BRIEF_CTX');
    mockGenerate.mockResolvedValue({ title: 'T', html: '<!DOCTYPE html><html></html>' });
    mockGenerateLandingPage.mockResolvedValue({ title: 'T', html: '<div/>', css: '' });
    mockChargeAiCredit.mockResolvedValue(undefined);
    mockSaveMessages.mockResolvedValue(undefined);
  });

  it('POST /ai/generate-landing-html: invalid brief → 400 and does not call Gemini generate', async () => {
    const err = new Error('name required');
    err.status = 400;
    err.code = 'LANDING_PRODUCT_NAME_REQUIRED';
    mockResolveLandingBrief.mockRejectedValue(err);

    const req = {
      body: { prompt: 'Tạo landing', landingBrief: { version: 1, source: 'assistant_wizard', productMode: 'other' } },
      user: { id: 9 },
    };
    const res = makeRes();
    await aiController.generateLandingHtml(req, res);

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockChargeAiCredit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LANDING_PRODUCT_NAME_REQUIRED' }));
  });

  it('POST /ai/generate-landing-html: employee uses owner for profile and actor for session/meter metadata', async () => {
    mockResolveLandingBrief.mockResolvedValue({
      ownerUserId: 3,
      normalizedBrief: { productMode: 'context' },
      resolvedProduct: null,
    });

    const req = {
      body: {
        prompt: 'Tạo landing page lead',
        sessionId: 77,
        userSummary: 'summary',
        landingBrief: { version: 1, source: 'assistant_wizard', productMode: 'context' },
      },
      user: { id: 9, activeContext: { type: 'employee', ownerId: 3 } },
    };
    const res = makeRes();
    await aiController.generateLandingHtml(req, res);

    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({
      userId: 3,
      actorUserId: 9,
      landingBriefContext: 'BRIEF_CTX',
    }));
    expect(mockSaveMessages).toHaveBeenCalledWith(77, 9, 'summary', expect.any(Object));
    expect(mockChargeAiCredit).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('POST /ai/generate-landing-html: legacy request without brief still generates', async () => {
    mockResolveLandingBrief.mockResolvedValue(null);
    const req = {
      body: { prompt: 'Tạo landing đơn giản' },
      user: { id: 2 },
    };
    const res = makeRes();
    await aiController.generateLandingHtml(req, res);

    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({
      userId: 2,
      actorUserId: 2,
      landingBriefContext: null,
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('POST /landing-templates/generate: invalid brief blocks before Gemini', async () => {
    const err = new Error('not found');
    err.status = 404;
    err.code = 'LANDING_PRODUCT_NOT_FOUND';
    mockResolveLandingBrief.mockRejectedValue(err);

    const req = {
      body: {
        prompt: 'Tạo landing page với tệp đính kèm đủ dài',
        landingBrief: { version: 1, source: 'assistant_wizard', productMode: 'catalog', productId: 1 },
      },
      user: { id: 4 },
    };
    const res = makeRes();
    await landingTemplateController.generate(req, res);

    expect(mockGenerateLandingPage).not.toHaveBeenCalled();
    expect(mockChargeAiCredit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('POST /landing-templates/generate: passes owner + actor to service', async () => {
    mockResolveLandingBrief.mockResolvedValue({
      ownerUserId: 11,
      normalizedBrief: { productMode: 'other', productName: 'X' },
      resolvedProduct: null,
    });
    const req = {
      body: {
        prompt: 'Tạo landing page từ template và brief',
        files: [{ tempId: 't1' }],
        landingBrief: { version: 1, source: 'assistant_wizard', productMode: 'other', productName: 'X' },
      },
      user: { id: 22, activeContext: { type: 'employee', ownerId: 11 } },
    };
    const res = makeRes();
    await landingTemplateController.generate(req, res);

    expect(mockGenerateLandingPage).toHaveBeenCalledWith(expect.objectContaining({
      userId: 11,
      actorUserId: 22,
      landingBriefContext: 'BRIEF_CTX',
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

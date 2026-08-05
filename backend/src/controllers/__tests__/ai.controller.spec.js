import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const processSmartChat = jest.fn();
const chargeAiCredit = jest.fn();
const createSession = jest.fn();
const saveMessages = jest.fn();

jest.unstable_mockModule('../../services/ai/aiCampaign.service.js', () => ({
  default: {
    processSmartChat,
  },
}));

jest.unstable_mockModule('../../services/ai/aiLandingPage.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiCampaignDraft.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/businessProfile.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/customChat.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    findChatbotById: jest.fn(),
  },
}));
jest.unstable_mockModule('../../services/chatbot/chatbotStudioConversation.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiModelPolicy.service.js', () => ({
  getAllowedModelsForUser: jest.fn(),
  savePreferredModelForUser: jest.fn(),
  resolveAllowedModel: jest.fn(async () => 'gemini-2.5-flash'),
}));
jest.unstable_mockModule('../../services/help/helpAssistant.service.js', () => ({
  tryHandleHelpChat: jest.fn(async () => null),
}));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({
  chargeAiCredit,
}));
jest.unstable_mockModule('../campaign.controller.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignCrud.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/aiSession.repository.js', () => ({
  createSession,
  saveMessages,
}));

const { default: aiController } = await import('../ai.controller.js');

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
};

describe('ai.controller', () => {
  beforeEach(() => {
    processSmartChat.mockReset();
    chargeAiCredit.mockReset();
    createSession.mockReset();
    saveMessages.mockReset();
    createSession.mockResolvedValue({ id: 123, title: 'Wizard chat' });
  });

  it('does not charge AI credit for wizard short-circuit chat responses', async () => {
    processSmartChat.mockResolvedValue({
      type: 'ask_sender_account',
      content: 'Chọn tài khoản gửi',
      data: { channel: 'zalo' },
      wizardShortCircuit: true,
    });

    const req = {
      body: {
        history: [{ role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nTôi chọn Zalo.' }],
        locale: 'vi',
      },
      user: { id: 42, role: 'user' },
    };
    const res = makeRes();

    await aiController.chat(req, res);

    expect(chargeAiCredit).not.toHaveBeenCalled();
    expect(saveMessages).toHaveBeenCalledWith(123, 42, expect.any(String), expect.not.objectContaining({
      wizardShortCircuit: true,
    }));
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.not.objectContaining({ wizardShortCircuit: true }),
    });
  });
});

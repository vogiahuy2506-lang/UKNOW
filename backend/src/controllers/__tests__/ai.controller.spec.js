import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const processSmartChat = jest.fn();
const chargeAiCredit = jest.fn();
const createSession = jest.fn();
const saveMessages = jest.fn();
const tryHandleHelpChat = jest.fn(async () => null);

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
  tryHandleHelpChat,
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
    tryHandleHelpChat.mockReset();
    tryHandleHelpChat.mockResolvedValue(null);
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

  it('không có tệp: câu hỏi được help-router trả lời, không gọi processSmartChat', async () => {
    tryHandleHelpChat.mockResolvedValue({ type: 'help', content: 'Xem hướng dẫn' });

    const req = {
      body: { history: [{ role: 'user', content: 'gói cước bao nhiêu tiền' }], locale: 'vi' },
      user: { id: 7, role: 'user' },
    };
    const res = makeRes();

    await aiController.chat(req, res);

    expect(tryHandleHelpChat).toHaveBeenCalledTimes(1);
    expect(processSmartChat).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ content: 'Xem hướng dẫn' }),
    });
  });

  it('có tệp đính kèm: BỎ QUA help-router, vào thẳng processSmartChat (đọc tệp)', async () => {
    // Help-router sẽ trả lời nếu bị gọi — nhưng có tệp thì không được gọi.
    tryHandleHelpChat.mockResolvedValue({ type: 'help', content: 'KHÔNG ĐƯỢC HIỆN' });
    processSmartChat.mockResolvedValue({ type: 'text', content: 'Đã đọc tệp' });

    const req = {
      body: {
        history: [{ role: 'user', content: 'bạn đọc được file này ko' }],
        files: [{ tempId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', originalName: 'bao_cao.pdf', contentType: 'application/pdf' }],
        locale: 'vi',
      },
      user: { id: 7, role: 'user' },
    };
    const res = makeRes();

    await aiController.chat(req, res);

    expect(tryHandleHelpChat).not.toHaveBeenCalled();
    expect(processSmartChat).toHaveBeenCalledTimes(1);
    expect(processSmartChat).toHaveBeenCalledWith(expect.objectContaining({
      files: [expect.objectContaining({ tempId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' })],
    }));
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ content: 'Đã đọc tệp' }),
    });
  });
});

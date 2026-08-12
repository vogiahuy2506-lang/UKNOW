import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const processSmartChat = jest.fn();
const processSmartChatV2 = jest.fn();
const chargeAiCredit = jest.fn();
const createSession = jest.fn();
const saveMessages = jest.fn();
const tryHandleHelpChat = jest.fn(async () => null);

jest.unstable_mockModule('../../services/ai/aiCampaign.service.js', () => ({
  default: {
    processSmartChat,
    processSmartChatV2,
  },
}));

jest.unstable_mockModule('../../services/ai/aiLandingPage.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiCampaignDraft.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/businessProfile.service.js', () => ({
  default: {},
  serializeProductList: jest.fn(() => ''),
}));
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
    processSmartChatV2.mockReset();
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
    // saveMessages nay nhận tham số thứ 5 (safeFiles) — request này không có tệp → [].
    expect(saveMessages).toHaveBeenCalledWith(123, 42, expect.any(String), expect.not.objectContaining({
      wizardShortCircuit: true,
    }), []);
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

  it('đang trả lời gate wizard: BỎ QUA help-router (kể cả câu lạc đề)', async () => {
    tryHandleHelpChat.mockResolvedValue({ type: 'help', content: 'KHÔNG ĐƯỢC HIỆN' });
    processSmartChat.mockResolvedValue({ type: 'ask_sender_account', content: 'Chọn tài khoản gửi' });

    const req = {
      body: {
        history: [
          { role: 'assistant', type: 'ask_campaign_details', content: 'Bạn muốn gửi qua kênh nào?' },
          { role: 'user', content: 'thời tiết hôm nay' },
        ],
        locale: 'vi',
      },
      user: { id: 7, role: 'user' },
    };
    const res = makeRes();

    await aiController.chat(req, res);

    expect(tryHandleHelpChat).not.toHaveBeenCalled();
    expect(processSmartChat).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ content: 'Chọn tài khoản gửi' }),
    });
  });

  it('employee chat V1/V2: truyền resourceOwnerUserId (owner) và userId (actor)', async () => {
    processSmartChat.mockResolvedValue({ type: 'text', content: 'ok' });
    processSmartChatV2.mockResolvedValue({ type: 'text', content: 'ok v2' });

    const employee = {
      id: 9,
      role: 'user',
      activeContext: { type: 'employee', ownerId: 3 },
    };
    const history = [{ role: 'user', content: 'Xin chào' }];

    await aiController.chat({
      body: { history, locale: 'vi' },
      user: employee,
    }, makeRes());

    expect(processSmartChat).toHaveBeenCalledWith(expect.objectContaining({
      userId: 9,
      resourceOwnerUserId: 3,
    }));

    await aiController.chatV2({
      body: { history, locale: 'vi' },
      user: employee,
    }, makeRes());

    expect(processSmartChatV2).toHaveBeenCalledWith(expect.objectContaining({
      userId: 9,
      resourceOwnerUserId: 3,
    }));
  });
});

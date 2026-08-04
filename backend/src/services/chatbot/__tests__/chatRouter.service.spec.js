import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getSettings = jest.fn();
const getWebChatMessages = jest.fn();
const addWebChatMessage = jest.fn();
const getChannelMessages = jest.fn();
const addChannelMessage = jest.fn();

const assertAvailable = jest.fn();
const charge = jest.fn();
const isCreditLimitError = jest.fn(() => false);
const isUsageLimitError = jest.fn(() => false);
const reserve = jest.fn();
const record = jest.fn();

const buildContext = jest.fn();
const getById = jest.fn();
const getFormattedProfileForPrompt = jest.fn();
const resolveAllowedModel = jest.fn();
const sendReply = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    getSettings,
    getWebChatMessages,
    addWebChatMessage,
    getChannelMessages,
    addChannelMessage,
  },
}));

jest.unstable_mockModule('../../../repositories/ai/unifiedInbox.repository.js', () => ({
  default: {
    isAiPaused: jest.fn(async () => false),
  },
}));

jest.unstable_mockModule('../../../repositories/ai/knowledgeBase.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../ragEngine.service.js', () => ({
  default: { buildContext },
}));

jest.unstable_mockModule('../subAssistant.service.js', () => ({
  default: { getById },
}));

jest.unstable_mockModule('../channelAdapters/webChat.adapter.js', () => ({
  default: { sendReply },
}));

jest.unstable_mockModule('../channelAdapters/zaloOA.adapter.js', () => ({ default: {} }));
jest.unstable_mockModule('../channelAdapters/facebook.adapter.js', () => ({ default: {} }));
jest.unstable_mockModule('../channelAdapters/zaloPersonal.adapter.js', () => ({ default: {} }));

jest.unstable_mockModule('../../ai/businessProfile.service.js', () => ({
  default: { getFormattedProfileForPrompt },
}));

jest.unstable_mockModule('../../../utils/aiResponseFormatter.util.js', () => ({
  stripMarkdown: (text) => text,
}));

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage: () => ({}),
}));

jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({
  default: {
    isLimitError: (...args) => isUsageLimitError(...args),
    reserve,
    record,
  },
}));

jest.unstable_mockModule('../../ai/aiCreditMeter.service.js', () => ({
  default: {
    assertAvailable,
    charge,
    isLimitError: (...args) => isCreditLimitError(...args),
  },
  VISITOR_CHAT_UNAVAILABLE_MESSAGE: 'unavailable',
  VISITOR_CHAT_ERROR_MESSAGE: 'Xin lỗi, hiện chưa thể trả lời. Vui lòng thử lại sau.',
}));

jest.unstable_mockModule('../../ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: (...args) => resolveAllowedModel(...args),
}));

const { default: chatRouterService } = await import('../chatRouter.service.js');

describe('chatRouter.service AI fallback', () => {
  beforeEach(() => {
    getSettings.mockReset();
    getWebChatMessages.mockReset();
    addWebChatMessage.mockReset();
    assertAvailable.mockReset();
    charge.mockReset();
    isCreditLimitError.mockReset();
    isUsageLimitError.mockReset();
    reserve.mockReset();
    record.mockReset();
    buildContext.mockReset();
    getById.mockReset();
    getFormattedProfileForPrompt.mockReset();
    resolveAllowedModel.mockReset();
    sendReply.mockReset();

    getSettings.mockResolvedValue({
      is_enabled: true,
      id_sub_assistant: null,
      ai_model: 'gemini-2.5-flash',
      temperature: 0.7,
      max_tokens: 512,
    });
    assertAvailable.mockResolvedValue({ skip: false });
    getWebChatMessages.mockResolvedValue([]);
    buildContext.mockResolvedValue('');
    getFormattedProfileForPrompt.mockResolvedValue('');
    addWebChatMessage.mockResolvedValue({});
    sendReply.mockResolvedValue(undefined);
    isCreditLimitError.mockReturnValue(false);
    isUsageLimitError.mockReturnValue(false);
  });

  it('returns static visitor message (does not throw) when AI call fails transiently', async () => {
    const callAI = jest
      .spyOn(chatRouterService, '_callAI')
      .mockRejectedValue(new Error('AI call timeout (30s)'));

    const result = await chatRouterService.routeMessage({
      channel: 'web',
      userId: 7,
      message: 'xin chào',
      conversationId: 99,
    });

    expect(result).toEqual({
      type: 'text',
      content: 'Xin lỗi, hiện chưa thể trả lời. Vui lòng thử lại sau.',
    });
    expect(charge).not.toHaveBeenCalled();
    expect(sendReply).toHaveBeenCalledWith({
      conversationId: 99,
      message: 'Xin lỗi, hiện chưa thể trả lời. Vui lòng thử lại sau.',
      attachments: [],
    });

    callAI.mockRestore();
  });

  it('returns static visitor message for quota errors without charging', async () => {
    const quotaError = Object.assign(new Error('quota'), { code: 'AI_USAGE_LIMIT' });
    isUsageLimitError.mockReturnValue(true);
    const callAI = jest.spyOn(chatRouterService, '_callAI').mockRejectedValue(quotaError);

    const result = await chatRouterService.routeMessage({
      channel: 'web',
      userId: 7,
      message: 'xin chào',
      conversationId: 99,
    });

    expect(result.type).toBe('text');
    expect(result.content).toContain('Xin lỗi');
    expect(charge).not.toHaveBeenCalled();

    callAI.mockRestore();
  });
});

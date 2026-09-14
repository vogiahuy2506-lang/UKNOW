import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const originalFetch = global.fetch;
const isThinkingBudgetRejection = jest.fn(() => false);

const getSettings = jest.fn();
const getWebChatMessages = jest.fn();
const addWebChatMessage = jest.fn();
const getChannelMessages = jest.fn();
const addChannelMessage = jest.fn();

const assertAvailable = jest.fn();
const charge = jest.fn();
const consume = jest.fn();
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
jest.unstable_mockModule('../whatsappBaileys.service.js', () => ({
  default: {},
  listSessions: jest.fn(() => []),
  listPersistedSessions: jest.fn(async () => []),
  sendMessage: jest.fn(async () => ({})),
}));

const getOwnerContact = jest.fn();
jest.unstable_mockModule('../../../repositories/chatbot/chatbotContactAlert.repository.js', () => ({
  default: {
    getOwnerContact,
  },
}));

jest.unstable_mockModule('../../ai/businessProfile.service.js', () => ({
  default: { getFormattedProfileForPrompt },
}));

jest.unstable_mockModule('../../../utils/aiResponseFormatter.util.js', () => ({
  stripMarkdown: (text) => text,
}));

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage: () => ({}),
  isThinkingBudgetRejection: (...args) => isThinkingBudgetRejection(...args),
  joinGeminiTextParts: (parts) => (Array.isArray(parts)
    ? parts.filter((p) => p?.text && !p.thought).map((p) => p.text).join('')
    : ''),
  THINKING_BUDGET_RETRY_RE: /budget 0 is invalid|thinking mode|thinking_?budget/i,
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
    consume,
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

describe('chatRouter._callAI thinking config', () => {
  // _callAI dùng Promise.race với setTimeout(30s) KHÔNG được clear → fake timers
  // để timer đó không treo teardown.
  beforeEach(() => {
    jest.useFakeTimers();
    resolveAllowedModel.mockReset();
    reserve.mockReset();
    record.mockReset();
    isThinkingBudgetRejection.mockReset();
    isThinkingBudgetRejection.mockReturnValue(false);

    resolveAllowedModel.mockResolvedValue('gemini-2.5-flash');
    reserve.mockResolvedValue({ maxOutputTokens: 512 });
    record.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  const callArgs = {
    userId: 7,
    systemPrompt: 'sp',
    history: [],
    message: 'xin chào',
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 512,
  };

  it('gửi thinkingConfig budget 0 và lọc thought parts', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'suy nghĩ', thought: true }, { text: 'Xin chào bạn' }] } }],
      }),
    });
    global.fetch = fetchMock;

    const res = await chatRouterService._callAI(callArgs);

    expect(res).toEqual({ text: 'Xin chào bạn' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('model chỉ-thinking từ chối budget 0 → retry bỏ thinkingConfig, nới cap ≥3072', async () => {
    isThinkingBudgetRejection.mockReturnValueOnce(true);
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Budget 0 is invalid. This model only works in thinking mode.' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'rescued' }] } }] }),
      });
    global.fetch = fetchMock;

    const res = await chatRouterService._callAI(callArgs);

    expect(res).toEqual({ text: 'rescued' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(first.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(second.generationConfig.thinkingConfig).toBeUndefined();
    expect(second.generationConfig.maxOutputTokens).toBe(3072);
  });
});

describe('ChatRouterService.buildSystemPrompt — natural pronouns + no internal note leak', () => {
  it('passes sub_assistant_name through to the prompt so AI uses the configured name', () => {
    // Bug trước: WhatsApp Baileys inbox chỉ pass {welcome_message, response_style,
    // system_instruction} cho buildSystemPrompt — thiếu sub_assistant_name.
    // Khi id_sub_assistant set trong DB nhưng subAssistant=null (vd row
    // bị xoá) thì prompt rơi về chatbot.name generic → AI xưng "Anh/Chị"
    // cứng nhắc thay vì tên đặt trong sub-assistant. Fix: pass
    // settings.sub_assistant_name từ JOIN `sa.name`.
    const prompt = chatRouterService.buildSystemPrompt({
      subAssistant: null,
      settings: {
        sub_assistant_name: 'Trợ lý Hà',
        response_style: 'friendly',
      },
      chatbot: { name: 'Tro ly AI' },
    });
    // "Trợ lý Hà" được chèn vào rule "LUON xung ten la ..."
    expect(prompt).toContain('LUON xung ten la "Trợ lý Hà"');
    // Anti xưng hô cứng: prompt phải có rule cho AI linh hoạt thay vì
    // "Anh/Chị" mặc định.
    expect(prompt).toMatch(/KHONG.*xưng hô.*Anh\/Chị|xưng hô.*linh hoạt/);
  });

  it('forbids printing internal note structures (payment note, INTERNAL tags) to customers', () => {
    // Bug: khi system_instruction có rule "khi có bill → tạo ghi chú
    // thanh toán", AI in cả cấu trúc "Ghi chú thanh toán: ..." ra reply
    // cho khách. Fix: thêm rule anti-echo trong QUY TAC QUAN TRONG.
    const prompt = chatRouterService.buildSystemPrompt({
      subAssistant: { name: 'Bot' },
      settings: { response_style: 'friendly' },
      chatbot: { name: 'Bot' },
    });
    expect(prompt).toContain('TUYET DOI KHONG in lại các cấu trúc note');
    expect(prompt).toContain('Ghi chú thanh toán');
    expect(prompt).toContain('INTERNAL');
  });

  it('forbids auto-classifying an image as bill/đơn hàng (only ask user)', () => {
    // Bug: khách gửi ảnh (có thể là bill hoặc ảnh thường), AI tự suy
    // đoán là "bill thanh toán" rồi in "Ghi chú thanh toán: ..." ra
    // reply. Fix: thêm rule "KHONG tu suy doan hinh anh la bill".
    const prompt = chatRouterService.buildSystemPrompt({
      subAssistant: null,
      settings: { response_style: 'friendly' },
      chatbot: { name: 'Bot' },
    });
    expect(prompt).toMatch(/KHÔNG tự suy đoán hình ảnh là "bill thanh toán"/);
  });

  it('instructs AI to answer social greetings naturally without payment-note template', () => {
    // Bug production (14/09/2026): khách nhắn "hello em là ai" /
    // "rảnh ko" → AI trả lời "Đang chờ ghi chú thanh toán..." thay
    // vì giới thiệu bản thân. Fix: thêm section "XU LY CAU HOI
    // CHUNG" ép AI trả lời tự nhiên cho câu xã giao, KHÔNG dùng
    // template payment-note khi khách không hỏi về payment.
    const prompt = chatRouterService.buildSystemPrompt({
      subAssistant: null,
      settings: { response_style: 'friendly' },
      chatbot: { name: 'Bot' },
    });
    expect(prompt).toContain('XU LY CAU HOI CHUNG');
    expect(prompt).toMatch(/xã giao thuần tuý/i);
    // Phải có anti-template rule: KHÔNG trả lời template payment-note
    // cho câu chào hỏi thông thường.
    expect(prompt).toMatch(/TUYỆT ĐỐI KHÔNG trả lời bằng các câu template/i);
  });
});
describe('PR-1c — bot xác nhận khi khách để lại liên hệ trong chatRouter', () => {
  beforeEach(() => {
    getSettings.mockReset();
    getWebChatMessages.mockReset();
    addWebChatMessage.mockReset();
    assertAvailable.mockReset();
    charge.mockReset();
    buildContext.mockReset();
    getFormattedProfileForPrompt.mockReset();
    sendReply.mockReset();
    getOwnerContact.mockReset();

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
    getOwnerContact.mockResolvedValue({ phone: '0901234567', email: 'owner@example.com' });
  });

  it('tin có SĐT → prompt chứa note, cleanResponse có footer', async () => {
    const callAI = jest
      .spyOn(chatRouterService, '_callAI')
      .mockResolvedValue({ text: 'Em chào anh chị ạ, em có thể giúp gì thêm không?' });

    const result = await chatRouterService.routeMessage({
      channel: 'web',
      userId: 7,
      message: 'alo tư vấn giúp tôi qua số 844790999 nhé',
      conversationId: 99,
    });

    expect(callAI).toHaveBeenCalledTimes(1);
    const aiArgs = callAI.mock.calls[0][0];
    expect(aiArgs.systemPrompt).toContain('0844790999');
    expect(aiArgs.systemPrompt).toContain('LƯU Ý HỆ THỐNG');

    const expectedFooter = 'Đã ghi nhận số điện thoại 0844790999. Chủ doanh nghiệp sẽ liên hệ lại với bạn sớm.';
    expect(result.content).toContain('Em chào anh chị ạ');
    expect(result.content).toContain(expectedFooter);

    expect(sendReply).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 99,
        message: expect.stringContaining(expectedFooter),
      })
    );

    callAI.mockRestore();
  });
});


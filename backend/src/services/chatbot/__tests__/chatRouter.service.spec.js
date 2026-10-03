import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const originalFetch = global.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;

const getSettings = jest.fn();
const getWebChatMessages = jest.fn();
const addWebChatMessage = jest.fn();
const getChannelMessages = jest.fn();
const addChannelMessage = jest.fn();
const findChatbotById = jest.fn();
const getConversationHistory = jest.fn();

const assertAvailable = jest.fn();
const charge = jest.fn();
const consume = jest.fn();
const isCreditLimitError = jest.fn(() => false);
const isUsageLimitError = jest.fn(() => false);
const reserve = jest.fn();
const record = jest.fn();
const resolveFallbackModel = jest.fn();

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
    findChatbotById,
    getConversationHistory,
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

// geminiClient.util.js KHÔNG mock: lõi thật chạy, chỉ `fetch` (ranh giới với Google) được giả bằng `Response` thật.

jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({
  default: {
    isLimitError: (...args) => isUsageLimitError(...args),
    reserve,
    record,
    resolveFallbackModel: (...args) => resolveFallbackModel(...args),
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
    consume.mockReset();
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
    resolveFallbackModel.mockReset();
    resolveFallbackModel.mockResolvedValue(null);
  });

  it('returns static visitor message (does not throw) when AI call fails transiently', async () => {
    const callAI = jest
      .spyOn(chatRouterService, '_callAI')
      .mockRejectedValue(new Error('AI call timeout (30s)'));

    const result = await chatRouterService.routeMessageWithSettings({
      channel: 'web',
      userId: 7,
      message: 'xin chào',
      conversationId: 99,
      chatbotSettings: {
        is_enabled: true,
        id_sub_assistant: null,
        ai_model: 'gemini-2.5-flash',
        temperature: 0.7,
        max_tokens: 512,
      },
    });

    expect(result).toEqual({
      type: 'text',
      content: 'Xin lỗi, hiện chưa thể trả lời. Vui lòng thử lại sau.',
    });
    expect(charge).not.toHaveBeenCalled();
    // _chargeChatCredit thật gọi aiCreditMeter.consume (không phải charge).
    expect(consume).not.toHaveBeenCalled();
    expect(addWebChatMessage).toHaveBeenCalledWith(99, 7, {
      role: 'bot',
      content: 'Xin lỗi, hiện chưa thể trả lời. Vui lòng thử lại sau.',
    });

    callAI.mockRestore();
  });

  it('Google quá tải kiểu 24/09 (503 mãi, chưa chọn dự phòng) → khách nhận câu xin lỗi cố định, KHÔNG trừ credit, KHÔNG ghi token', async () => {
    jest.useFakeTimers();
    silenceConsole('log', 'warn', 'error');
    process.env.GEMINI_API_KEY = 'AIza-khoa-bi-mat-chatrouter';
    resolveAllowedModel.mockResolvedValue('gemini-2.5-flash');
    reserve.mockResolvedValue({ maxOutputTokens: 512 });
    resolveFallbackModel.mockResolvedValue(null);
    global.fetch = jest.fn().mockImplementation(async () => googleReply(503, {
      error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' },
    }));

    try {
      const pending = chatRouterService.routeMessageWithSettings({
        channel: 'web',
        userId: 7,
        message: 'xin chào',
        conversationId: 99,
        chatbotSettings: { is_enabled: true, id_sub_assistant: null, ai_model: 'gemini-2.5-flash', temperature: 0.7, max_tokens: 512 },
      });
      await jest.advanceTimersByTimeAsync(40_000);
      const result = await pending;

      expect(result).toEqual({ type: 'text', content: 'Xin lỗi, hiện chưa thể trả lời. Vui lòng thử lại sau.' });
      expect(global.fetch).toHaveBeenCalledTimes(3); // thử lại 3 lượt rồi dừng (không có dự phòng)
      expect(consume).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      restoreConsole();
      global.fetch = originalFetch;
      if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalApiKey;
    }
  });

  it('returns static visitor message for quota errors without charging', async () => {
    const quotaError = Object.assign(new Error('quota'), { code: 'AI_USAGE_LIMIT' });
    isUsageLimitError.mockReturnValue(true);
    const callAI = jest.spyOn(chatRouterService, '_callAI').mockRejectedValue(quotaError);

    const result = await chatRouterService.routeMessageWithSettings({
      channel: 'web',
      userId: 7,
      message: 'xin chào',
      conversationId: 99,
      chatbotSettings: {
        is_enabled: true,
        id_sub_assistant: null,
        ai_model: 'gemini-2.5-flash',
        temperature: 0.7,
        max_tokens: 512,
      },
    });

    expect(result.type).toBe('text');
    expect(result.content).toContain('Xin lỗi');
    expect(charge).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();

    callAI.mockRestore();
  });
});

const consoleSpies = [];
const silenceConsole = (...methods) => {
  for (const method of methods) consoleSpies.push(jest.spyOn(console, method).mockImplementation(() => {}));
};
const restoreConsole = () => {
  while (consoleSpies.length) consoleSpies.pop().mockRestore();
};

/** Phản hồi HTTP THẬT như Google trả (status, header, thân JSON) — không dùng object `{ ok, json }` tự chế. */
const googleReply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8' },
});
const googleOk = (text, usage = { promptTokenCount: 120, candidatesTokenCount: 15, totalTokenCount: 135 }) => googleReply(200, {
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: usage,
  modelVersion: 'gemini-2.5-flash',
});
const googleOverloaded = () => googleReply(503, {
  error: { code: 503, message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary.', status: 'UNAVAILABLE' },
});
/** fetch treo tới khi bị huỷ — một lượt Google không chịu trả lời. */
const hangingFetch = () => jest.fn((_url, init) => new Promise((_resolve, reject) => {
  init.signal.addEventListener('abort', () => {
    reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
  });
}));
const urlModel = (url) => decodeURIComponent(String(url).match(/models\/([^:]+):generateContent/)?.[1] || '');

/** Chạy hết đồng hồ giả (nghỉ giữa các lượt thử lại, hạn 25 giây) rồi trả kết quả, KHÔNG để lời hứa treo. */
async function settle(promise) {
  let settled = false;
  const guarded = promise.then(
    (value) => { settled = true; return value; },
    (error) => { settled = true; throw error; },
  );
  guarded.catch(() => {});
  await jest.advanceTimersByTimeAsync(40_000);
  expect(settled).toBe(true);
  return guarded;
}

describe('chatRouter._callAI — đi qua lõi Gemini dùng chung (G2.1)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resolveAllowedModel.mockReset();
    reserve.mockReset();
    record.mockReset();
    resolveFallbackModel.mockReset();
    process.env.GEMINI_API_KEY = 'AIza-khoa-bi-mat-chatrouter';

    resolveAllowedModel.mockResolvedValue('gemini-2.5-flash');
    reserve.mockResolvedValue({ maxOutputTokens: 512 });
    record.mockResolvedValue(undefined);
    resolveFallbackModel.mockResolvedValue(null);
    silenceConsole('log', 'warn');
  });

  afterEach(() => {
    jest.useRealTimers();
    restoreConsole();
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
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

  it('gửi thinkingConfig budget 0, lọc thought parts, giữ NGUYÊN hội thoại nhiều lượt, khoá API ở header (không ở URL)', async () => {
    global.fetch = jest.fn().mockResolvedValue(googleReply(200, {
      candidates: [{ content: { parts: [{ text: 'suy nghĩ', thought: true }, { text: 'Xin chào bạn' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
    }));

    const res = await settle(chatRouterService._callAI({
      ...callArgs,
      history: [
        { role: 'visitor', content: 'Giá bao nhiêu?' },
        { role: 'bot', content: 'Dạ 100k ạ' },
        { role: 'agent', content: 'Nhân viên đây ạ' },
      ],
    }));

    expect(res).toEqual({ text: 'Xin chào bạn' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(body.generationConfig.maxOutputTokens).toBe(512);
    // Đường này chưa bao giờ gửi topP — giữ nguyên.
    expect(body.generationConfig).not.toHaveProperty('topP');
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sp' }] });
    expect(body.contents.map((c) => `${c.role}:${c.parts[0].text}`)).toEqual([
      'user:Giá bao nhiêu?',
      'model:Dạ 100k ạ',
      'model:Nhân viên đây ạ',
      'user:xin chào',
    ]);
    expect(url).not.toContain('key=');
    expect(url).not.toContain('AIza-khoa-bi-mat-chatrouter');
    expect(init.headers['x-goog-api-key']).toBe('AIza-khoa-bi-mat-chatrouter');
  });

  it('model chỉ-thinking từ chối budget 0 → retry bỏ thinkingConfig, nới cap ≥3072', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(googleReply(400, {
        error: { code: 400, message: 'Budget 0 is invalid. This model only works in thinking mode.', status: 'INVALID_ARGUMENT' },
      }))
      .mockResolvedValueOnce(googleOk('rescued'));

    const res = await settle(chatRouterService._callAI(callArgs));

    expect(res).toEqual({ text: 'rescued' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const first = JSON.parse(global.fetch.mock.calls[0][1].body);
    const second = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(first.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(second.generationConfig.thinkingConfig).toBeUndefined();
    expect(second.generationConfig.maxOutputTokens).toBe(3072);
  });

  // PR-12 (audit_ai.md C-4): Google tính tiền lượt trả lời RỖNG (MAX_TOKENS, bộ lọc an toàn) mà bản cũ ném lỗi TRƯỚC record.
  it('câu trả lời RỖNG: vẫn ghi token `chatbot_reply` TRƯỚC khi ném lỗi', async () => {
    const order = [];
    record.mockImplementation(async () => { order.push('record'); });
    global.fetch = jest.fn().mockResolvedValue(googleReply(200, {
      candidates: [{ content: { parts: [{ text: 'suy nghĩ', thought: true }] }, finishReason: 'MAX_TOKENS' }],
      usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 0, totalTokenCount: 830 },
    }));

    await expect(settle(chatRouterService._callAI(callArgs).catch((error) => { order.push('throw'); throw error; })))
      .rejects.toThrow('AI returned empty response');

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      7,
      { promptTokens: 800, outputTokens: 0, totalTokens: 830 },
      { feature: 'chatbot_reply', model: 'gemini-2.5-flash' },
    );
    expect(order).toEqual(['record', 'throw']); // ghi TRƯỚC khi ném
  });

  it('429 (hết hạn mức tạm thời) → được THỬ LẠI rồi trả lời; khách không thấy câu xin lỗi', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(googleReply(429, { error: { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } }))
      .mockResolvedValueOnce(googleOk('Dạ có ạ'));

    const res = await settle(chatRouterService._callAI(callArgs));

    expect(res).toEqual({ text: 'Dạ có ạ' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('model chính 503 liên tục (sự cố 24/09) → chuyển MODEL DỰ PHÒNG và trả lời; token ghi theo model dự phòng', async () => {
    resolveFallbackModel.mockResolvedValue('gemini-du-phong');
    global.fetch = jest.fn()
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOverloaded())
      .mockResolvedValueOnce(googleOk('Dạ dự phòng đây ạ'));

    const res = await settle(chatRouterService._callAI(callArgs));

    expect(res).toEqual({ text: 'Dạ dự phòng đây ạ' });
    expect(global.fetch.mock.calls.map(([url]) => urlModel(url))).toEqual([
      'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-du-phong',
    ]);
    expect(record).toHaveBeenCalledWith(7, expect.anything(), { feature: 'chatbot_reply', model: 'gemini-du-phong' });
  });

  it('chính 503 + dự phòng cũng 503 → ném lỗi (log đọc được câu gốc Google), KHÔNG ghi token', async () => {
    resolveFallbackModel.mockResolvedValue('gemini-du-phong');
    global.fetch = jest.fn().mockImplementation(async () => googleOverloaded());

    const err = await settle(chatRouterService._callAI(callArgs).catch((e) => e));

    expect(err.code).toBe('AI_PROVIDER_BUSY');
    expect(err.providerMessage).toContain('high demand');
    expect(record).not.toHaveBeenCalled();
  });

  it('Google treo không trả lời → hết ngân sách 25 giây thì fetch bị HUỶ THẬT (không để chạy ngầm tính tiền)', async () => {
    global.fetch = hangingFetch();

    const err = await settle(chatRouterService._callAI(callArgs).catch((e) => e));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(err.code).toBe('AI_TIMEOUT');
    expect(record).not.toHaveBeenCalled();
  });

  it('tra model dự phòng lỗi (resolveFallbackModel → null) KHÔNG làm hỏng câu trả lời', async () => {
    resolveFallbackModel.mockResolvedValue(null);
    global.fetch = jest.fn().mockResolvedValue(googleOk('ổn'));

    await expect(settle(chatRouterService._callAI(callArgs))).resolves.toEqual({ text: 'ổn' });
  });
});

describe('ChatRouterService.buildSystemPrompt — natural pronouns + no internal note leak', () => {
  it('does NOT force AI to introduce itself by name (user preference)', () => {
    // User requested: bỏ tự xưng tên, không bắt buộc giới thiệu tên.
    const prompt = chatRouterService.buildSystemPrompt({
      subAssistant: null,
      settings: {
        sub_assistant_name: 'Trợ lý Hà',
        response_style: 'friendly',
      },
      chatbot: { name: 'Tro ly AI' },
    });
    // KHÔNG còn rule bắt buộc xưng tên
    expect(prompt).not.toContain('LUON xung ten la');
    expect(prompt).not.toContain('Trợ lý Hà');
    // Vẫn có rule xưng hô tự nhiên (không cứng nhắc Anh/Chị)
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

    const result = await chatRouterService.routeMessageWithSettings({
      channel: 'web',
      userId: 7,
      message: 'alo tư vấn giúp tôi qua số 844790999 nhé',
      conversationId: 99,
      chatbotSettings: {
        is_enabled: true,
        id_sub_assistant: null,
        ai_model: 'gemini-2.5-flash',
        temperature: 0.7,
        max_tokens: 512,
      },
    });

    expect(callAI).toHaveBeenCalledTimes(1);
    const aiArgs = callAI.mock.calls[0][0];
    expect(aiArgs.systemPrompt).toContain('0844790999');
    expect(aiArgs.systemPrompt).toContain('LƯU Ý HỆ THỐNG');

    const expectedFooter = 'Đã ghi nhận số điện thoại 0844790999. Chủ doanh nghiệp sẽ liên hệ lại với bạn sớm.';
    expect(result.content).toContain('Em chào anh chị ạ');
    expect(result.content).toContain(expectedFooter);

    expect(addWebChatMessage).toHaveBeenCalledWith(
      99,
      7,
      expect.objectContaining({
        role: 'bot',
        content: expect.stringContaining(expectedFooter),
      })
    );

    callAI.mockRestore();
  });
});


describe('routeChatbotMessage — response_style của chatbot đi vào prompt (Zalo OA / Facebook / WhatsApp Cloud)', () => {
  const run = async (responseStyle) => {
    findChatbotById.mockResolvedValue({
      id: 9, id_user: 3, name: 'Bot', welcome_message: 'Chao', system_instruction: '', response_style: responseStyle,
    });
    getConversationHistory.mockResolvedValue([]);
    buildContext.mockResolvedValue('');
    resolveAllowedModel.mockResolvedValue('gemini-2.5-flash');
    const prep = jest.spyOn(chatRouterService, '_prepareChatCredit').mockResolvedValue({ creditContext: {} });
    const charge_ = jest.spyOn(chatRouterService, '_chargeChatCredit').mockResolvedValue(undefined);
    const callAI = jest.spyOn(chatRouterService, '_callAI').mockResolvedValue({ text: 'ok' });
    await chatRouterService.routeChatbotMessage({ chatbotId: 9, message: 'hi', conversationId: 1 });
    const prompt = callAI.mock.calls[0][0].systemPrompt;
    prep.mockRestore();
    charge_.mockRestore();
    callAI.mockRestore();
    return prompt;
  };

  it("response_style 'professional' -> prompt có câu phong cách chuyên nghiệp", async () => {
    const prompt = await run('professional');
    expect(prompt).toContain('Chuyen nghiep, ngan gon, suc tich.');
    expect(prompt).not.toContain('Than thien, gan gui, dung emoji phu hop.');
  });

  it("response_style 'casual' -> prompt có câu phong cách thoải mái", async () => {
    const prompt = await run('casual');
    expect(prompt).toContain('Than thien nhung thoai mai, co the dung tieng long nhe.');
  });

  it('không có response_style -> rơi về friendly như cũ', async () => {
    const prompt = await run(undefined);
    expect(prompt).toContain('Than thien, gan gui, dung emoji phu hop.');
  });
});

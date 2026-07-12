import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const axiosPost = jest.fn();
const extractGeminiUsage = jest.fn();
const attachGoogleUrlParts = jest.fn();
const reserve = jest.fn();
const record = jest.fn();
const getZaloAccountsFull = jest.fn();
const getActiveEmailSenders = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    post: axiosPost,
  },
}));

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage,
}));

jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: {
    getProfile: jest.fn(),
    getContextForPrompt: jest.fn(),
    formatProfileForPrompt: jest.fn(() => ''),
    getFormattedProfileForPrompt: jest.fn(() => Promise.resolve('')),
  },
  serializeProductList: jest.fn(() => ''),
}));

jest.unstable_mockModule('../adminContext.service.js', () => ({
  buildAdminContext: jest.fn(),
}));

jest.unstable_mockModule('../../landingTemplate/landingTemplate.service.js', () => ({
  default: {
    generateLandingPage: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: {
    readTempFileBuffer: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({
  extractTextFromBuffer: jest.fn(),
}));

jest.unstable_mockModule('../../../utils/googleUrlFetch.util.js', () => ({
  attachGoogleUrlParts,
}));

jest.unstable_mockModule('../../../repositories/ai/aiCampaign.repository.js', () => ({
  default: {
    getZaloAccountsFull,
    getActiveEmailSenders,
  },
}));

jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: {
    reserve,
    record,
  },
}));

jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async (_userId, model) => model || 'gemini-2.5-flash'),
}));

const { default: aiCampaignService } = await import('../aiCampaign.service.js');

describe('aiCampaign.service', () => {
  beforeEach(() => {
    axiosPost.mockReset();
    extractGeminiUsage.mockReset();
    attachGoogleUrlParts.mockReset();
    reserve.mockReset();
    record.mockReset();
    getZaloAccountsFull.mockReset();
    getActiveEmailSenders.mockReset();
    getZaloAccountsFull.mockResolvedValue([]);
    getActiveEmailSenders.mockResolvedValue([]);
  });

  it('passes userId into smart chat quota reservation and usage recording', async () => {
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 10, outputTokens: 5, totalTokens: 15 });
    axiosPost.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [{ text: '{"type":"text","content":"ok","missing_fields":[],"data":null}' }],
            },
          },
        ],
      },
    });

    const response = await aiCampaignService._runChat(
      'system prompt',
      [{ role: 'user', content: 'hello' }],
      [],
      42
    );

    expect(response).toMatchObject({ type: 'text', content: 'ok' });
    expect(reserve).toHaveBeenCalledWith(42, expect.objectContaining({
      requestedMaxOutputTokens: 8192,
    }));
    expect(record).toHaveBeenCalledWith(42, { promptTokens: 10, outputTokens: 5, totalTokens: 15 }, {
      feature: 'smart_chat',
      model: expect.any(String),
    });
  });

  it('converts inline multi-day draft text into suggest_content_plan', () => {
    const response = aiCampaignService._guardContentPlanResponse(
      {
        type: 'text',
        content: 'Tin nhắn 1: Chào bạn\nTin nhắn 2: Ưu đãi đặc biệt',
      },
      [{ role: 'user', content: 'Soạn chiến dịch 5 tin nhắn Zalo trong 5 ngày kêu gọi đăng ký' }]
    );

    expect(response.type).toBe('suggest_content_plan');
    expect(response.data.userPrompt).toContain('5 tin nhắn Zalo');
  });

  it('short-circuits wizard marker replies without calling Gemini or reserving quota', async () => {
    const response = await aiCampaignService.processSmartChat({
      userId: 42,
      history: [
        { role: 'user', content: 'Tạo chiến dịch email chăm sóc khách hàng' },
        { role: 'assistant', type: 'ask_campaign_details', content: 'Chọn kênh', data: { questions: [] } },
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nTôi chọn Email.' },
      ],
      locale: 'vi',
    });

    expect(response.type).toBe('email_setup_guide');
    expect(response.wizardShortCircuit).toBe(true);
    expect(axiosPost).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('forces wizard gates when Gemini returns a campaign response for a loose campaign prompt', () => {
    const guarded = aiCampaignService._guardWizardGates(
      {
        type: 'content_plan',
        content: 'Kế hoạch 5 ngày',
        data: {
          totalDays: 5,
          days: [{ day: 1, channel: 'zalo', slots: [{ channel: 'zalo', summary: 'Chào mừng' }] }],
        },
      },
      [{ role: 'user', content: 'Tạo cho tôi kịch bản 5 ngày chăm sóc khách mới qua Zalo cá nhân' }],
      { zaloAccounts: [{ id: 9, displayName: 'Zalo A', status: 'connected', isActive: true }] },
      'vi'
    );

    expect(guarded.response.type).toBe('ask_sender_account');
    expect(guarded.response.data.channel).toBe('zalo');
    expect(guarded.gateAsked).toBe('senderAccount');
  });

  it('returns revised content_plan instead of planApproved gate after revision feedback', () => {
    const contentPlanResponse = {
      type: 'content_plan',
      content: 'Kế hoạch 4 ngày',
      data: {
        totalDays: 4,
        days: [{ day: 1, channel: 'zalo', slots: [{ channel: 'zalo', summary: 'Chào' }] }],
        requiresApproval: true,
      },
    };
    const history = [
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":12}\nTK 12' },
      { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
      { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":5,"slotsPerDay":1}\n5 ngày' },
      {
        role: 'assistant',
        type: 'content_plan',
        content: 'Kế hoạch 5 ngày',
        data: { totalDays: 5, days: [{ day: 1, channel: 'zalo', slots: [{ channel: 'zalo', summary: 'Chào' }] }] },
      },
      { role: 'user', content: 'Góp ý chỉnh kế hoạch: chỉ 4 ngày thôi' },
    ];

    const guarded = aiCampaignService._guardWizardGates(contentPlanResponse, history, {}, 'vi');

    expect(guarded.response.type).toBe('content_plan');
    expect(guarded.response.data.totalDays).toBe(4);
    expect(guarded.response.data.requiresApproval).toBe(true);
  });
});

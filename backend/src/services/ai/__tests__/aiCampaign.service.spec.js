import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const axiosPost = jest.fn();
const extractGeminiUsage = jest.fn();
const attachGoogleUrlParts = jest.fn();
const reserve = jest.fn();
const record = jest.fn();
const getZaloAccountsFull = jest.fn();
const getActiveEmailSenders = jest.fn();
const getEmailTemplates = jest.fn(async () => []);
const getZaloAccounts = jest.fn(async () => []);
const getZaloGroups = jest.fn(async () => []);
const getZaloTemplates = jest.fn(async () => []);
const getRecommendedCampaignType = jest.fn(async () => 'mixed');
const getCustomerStats = jest.fn(async () => ({ total: 0, hasEmail: 0, hasZalo: 0 }));
const getCourses = jest.fn(async () => []);
const getLandingPages = jest.fn(async () => []);
const getFormattedProfileForPrompt = jest.fn(async () => '');
const getContextForPrompt = jest.fn(async () => '');

jest.unstable_mockModule('axios', () => ({
  default: {
    post: axiosPost,
  },
}));

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage,
  generateGeminiContent: jest.fn(),
}));

jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: {
    getProfile: jest.fn(),
    getContextForPrompt,
    formatProfileForPrompt: jest.fn(() => ''),
    getFormattedProfileForPrompt,
  },
  serializeProductList: jest.fn(() => ''),
}));

jest.unstable_mockModule('../adminContext.service.js', () => ({
  buildAdminContext: jest.fn(),
}));

const generateLandingPageMock = jest.fn(async () => ({
  title: 'Landing Mock',
  html: '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body><h1>Mock</h1></body></html>',
}));

jest.unstable_mockModule('../aiLandingPage.service.js', () => ({
  default: {
    generate: generateLandingPageMock,
  },
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

jest.unstable_mockModule('../aiPromptResources.service.js', () => ({
  default: {
    getZaloAccountsFull,
    getActiveEmailSenders,
    getEmailTemplates,
    getZaloAccounts,
    getZaloGroups,
    getZaloTemplates,
    getRecommendedCampaignType,
    getCustomerStats,
    getCourses,
    getLandingPages,
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

const { default: aiCampaignService, isUserConfirmingFile } = await import('../aiCampaign.service.js');
const { runChat } = await import('../aiChatTransport.service.js');

describe('aiCampaign.service', () => {
  beforeEach(() => {
    axiosPost.mockReset();
    extractGeminiUsage.mockReset();
    attachGoogleUrlParts.mockReset();
    reserve.mockReset();
    record.mockReset();
    getZaloAccountsFull.mockReset();
    getActiveEmailSenders.mockReset();
    getEmailTemplates.mockReset();
    getZaloAccounts.mockReset();
    getZaloGroups.mockReset();
    getZaloTemplates.mockReset();
    getRecommendedCampaignType.mockReset();
    getCustomerStats.mockReset();
    getCourses.mockReset();
    getLandingPages.mockReset();
    getFormattedProfileForPrompt.mockReset();
    getContextForPrompt.mockReset();
    getZaloAccountsFull.mockResolvedValue([]);
    getActiveEmailSenders.mockResolvedValue([]);
    getEmailTemplates.mockResolvedValue([]);
    getZaloAccounts.mockResolvedValue([]);
    getZaloGroups.mockResolvedValue([]);
    getZaloTemplates.mockResolvedValue([]);
    getRecommendedCampaignType.mockResolvedValue('mixed');
    getCustomerStats.mockResolvedValue({ total: 0, hasEmail: 0, hasZalo: 0 });
    getCourses.mockResolvedValue([]);
    getLandingPages.mockResolvedValue([]);
    getFormattedProfileForPrompt.mockResolvedValue('');
    getContextForPrompt.mockResolvedValue('');
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

    const response = await runChat({
      systemPrompt: 'system prompt',
      history: [{ role: 'user', content: 'hello' }],
      files: [],
      userId: 42,
    });

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

  it('bypasses suggest_content_plan when intent is content_plan_request (PR-A)', () => {
    const response = aiCampaignService._guardContentPlanResponse(
      {
        type: 'text',
        content: 'Tin nhắn 1: Chào bạn\nTin nhắn 2: Ưu đãi đặc biệt',
      },
      [{ role: 'user', content: 'Soạn chiến dịch 5 tin nhắn Zalo trong 5 ngày kêu gọi đăng ký' }],
      null,
      'content_plan_request'
    );

    expect(response.type).toBe('text');
    expect(response.content).toContain('Tin nhắn 1');
  });

  it('bypasses suggest_content_plan when history already has suggest_content_plan (hard brake PR-A)', () => {
    const response = aiCampaignService._guardContentPlanResponse(
      {
        type: 'text',
        content: 'Tin nhắn 1: Chào bạn\nTin nhắn 2: Ưu đãi đặc biệt',
      },
      [
        { role: 'user', content: 'Soạn chiến dịch 5 tin nhắn Zalo trong 5 ngày kêu gọi đăng ký' },
        { role: 'assistant', type: 'suggest_content_plan', content: 'Kế hoạch gợi ý' },
        { role: 'user', content: 'Hãy trả về content_plan JSON' },
      ]
    );

    expect(response.type).toBe('text');
    expect(response.content).toContain('Tin nhắn 1');
  });

  it('does not convert inline drafts to content_plan for quick-send', () => {
    const response = aiCampaignService._guardContentPlanResponse(
      {
        type: 'text',
        content: 'Tin nhắn 1: Cảm ơn\nTin nhắn 2: Theo dõi',
      },
      [{ role: 'user', content: 'Gửi nhanh 1 email cảm ơn đơn hàng' }],
      { flowMode: 'quick_send', contentMode: 'context' }
    );
    expect(response.type).toBe('text');
  });

  it('downgrades create_and_run to confirm_create for quick-send without explicit run', () => {
    const response = aiCampaignService._guardQuickSendResponse(
      {
        type: 'create_and_run',
        content: 'Đang chạy',
        data: { campaignType: 'email', nodes: [], autoRun: true },
      },
      [{ role: 'user', content: 'Gửi nhanh 1 email cảm ơn đơn hàng' }],
      { flowMode: 'quick_send' }
    );
    expect(response.type).toBe('confirm_create');
    expect(response.data.autoRun).toBe(false);
  });

  it('keeps create_and_run when user explicitly asks to create and run', () => {
    const response = aiCampaignService._guardQuickSendResponse(
      {
        type: 'create_and_run',
        content: 'Đang chạy',
        data: { campaignType: 'email', autoRun: true },
      },
      [{ role: 'user', content: 'Tạo và chạy ngay email cảm ơn đơn hàng' }],
      { flowMode: 'quick_send' }
    );
    expect(response.type).toBe('create_and_run');
  });

  it('does not fake confirm_create from content_plan day payload', () => {
    const response = aiCampaignService._guardQuickSendResponse(
      {
        type: 'content_plan',
        content: 'Kế hoạch 5 ngày',
        data: { totalDays: 5, days: [{ day: 1, slots: [] }] },
      },
      [{ role: 'user', content: 'Gửi nhanh 1 email cảm ơn' }],
      { flowMode: 'quick_send' }
    );
    expect(response.type).toBe('text');
    expect(response.data).toBeNull();
  });

  it('retypes content_plan to confirm_create only when script-shaped', () => {
    const response = aiCampaignService._guardQuickSendResponse(
      {
        type: 'content_plan',
        content: 'Script',
        data: { campaignType: 'email', nodes: [{ tempId: 'n1' }], connections: [] },
      },
      [{ role: 'user', content: 'Gửi nhanh 1 email cảm ơn' }],
      { flowMode: 'quick_send' }
    );
    expect(response.type).toBe('confirm_create');
    expect(response.data.nodes).toHaveLength(1);
  });

  it('downgrades create_and_run when dataSource is manual even if explicit run', () => {
    const response = aiCampaignService._guardManualRecipientsNoAutoRun(
      {
        type: 'create_and_run',
        content: 'Đang chạy',
        data: { campaignType: 'email', nodes: [], connections: [], autoRun: true },
      },
      { dataSource: 'manual' }
    );
    expect(response.type).toBe('confirm_create');
    expect(response.data.wizardDataSource).toBe('manual');
    expect(response.data.autoRun).toBe(false);
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

  it('quick-send with thank-you purpose skips campaignBrief and asks sender', async () => {
    getActiveEmailSenders.mockResolvedValue([
      { id: 7, name: 'Sales', email: 'sales@example.com', status: 'active' },
    ]);
    const response = await aiCampaignService.processSmartChat({
      userId: 42,
      history: [
        { role: 'user', content: 'Gửi nhanh 1 email cảm ơn đơn hàng' },
      ],
      locale: 'vi',
    });

    expect(response.wizardShortCircuit).toBe(true);
    expect(response._wizard.brief).toMatchObject({
      flowMode: 'quick_send',
      contentMode: 'context',
      productMode: 'context',
    });
    expect(response._wizard.gates.schedule).toEqual({ mode: 'once' });
    expect(response._wizard.gateAsked).toBe('senderAccount');
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('quick-send without purpose still asks campaignBrief after source', async () => {
    getActiveEmailSenders.mockResolvedValue([
      { id: 7, name: 'Sales', email: 'sales@example.com', status: 'active' },
    ]);
    const response = await aiCampaignService.processSmartChat({
      userId: 42,
      history: [
        { role: 'user', content: 'Gửi nhanh 1 email' },
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"manual"}\nManual' },
      ],
      locale: 'vi',
    });

    expect(response._wizard.gateAsked).toBe('campaignBrief');
    expect(response._wizard.gates.schedule).toEqual({ mode: 'once' });
    expect(response._wizard.brief?.flowMode).toBe('quick_send');
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('keeps persisted quick_send when history is marker-only (latestIntent null)', async () => {
    getActiveEmailSenders.mockResolvedValue([
      { id: 7, name: 'Sales', email: 'sales@example.com', status: 'active' },
    ]);
    const response = await aiCampaignService.processSmartChat({
      userId: 42,
      history: [
        // Marker-only: no free-text campaign → latestIntentIsQuickSend stays null
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
      ],
      locale: 'vi',
      persistedWizardState: {
        v: 1,
        gates: {
          isCampaignFlow: true,
          channel: 'email',
          senderAccountId: 7,
          dataSource: null,
          schedule: { mode: 'once' },
          planApproved: false,
          hasContentPlan: false,
          zaloGroupIds: [],
        },
        brief: {
          version: 1,
          source: 'assistant_campaign_wizard',
          flowMode: 'quick_send',
          contentMode: 'context',
          productMode: 'context',
          productIds: [],
          productName: null,
          productDescription: null,
          topicText: null,
          contentLocale: 'vi',
        },
        plan: {},
        meta: {},
      },
    });

    expect(response.wizardShortCircuit).toBe(true);
    expect(response._wizard.brief.flowMode).toBe('quick_send');
    expect(response._wizard.gates.schedule).toEqual({ mode: 'once' });
    expect(response._wizard.gateAsked).toBe('dataSource');
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('free-text huỷ resets wizard gates/brief/plan before re-asking gates', async () => {
    const response = await aiCampaignService.processSmartChat({
      userId: 42,
      history: [
        { role: 'user', content: 'Tạo chiến dịch email chăm sóc khách hàng' },
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
        { role: 'assistant', type: 'ask_campaign_details', content: 'Chọn sender', data: { questions: [] } },
        { role: 'user', content: 'huỷ' },
      ],
      locale: 'vi',
      persistedWizardState: {
        v: 1,
        gates: {
          isCampaignFlow: true,
          channel: 'email',
          senderAccountId: null,
          dataSource: null,
          schedule: null,
          planApproved: false,
          hasContentPlan: true,
          zaloGroupIds: [],
        },
        brief: {
          contentMode: 'custom_topic',
          productMode: 'context',
          topicText: 'Cũ',
          productIds: [],
        },
        plan: { snapshot: { totalDays: 3 }, sourcePrompt: 'x', requiresApproval: true, savedTemplates: [], status: null, campaignId: null },
        meta: {},
      },
    });

    expect(response.wizardShortCircuit).toBe(true);
    expect(response.type).toBe('text');
    expect(response.content).toMatch(/dừng|xoá|xóa/i);
    expect(response._wizard.planReset).toBe(true);
    expect(response._wizard.gates.isCampaignFlow).toBe(false);
    expect(response._wizard.gates.channel).toBeNull();
    expect(response._wizard.brief.contentMode).toBeNull();
    expect(axiosPost).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
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
      { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Chăm sóc khách"}\nChủ đề' },
      { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":5,"slotsPerDay":1}\n5 ngày' },
      {
        role: 'assistant',
        type: 'content_plan',
        content: 'Kế hoạch 5 ngày',
        data: { totalDays: 5, days: [{ day: 1, channel: 'zalo', slots: [{ channel: 'zalo', summary: 'Chào' }] }] },
      },
      { role: 'user', content: 'Góp ý chỉnh kế hoạch: chỉ 4 ngày thôi' },
    ];

    const mergedGates = {
      isCampaignFlow: true,
      channel: 'zalo',
      senderAccountId: 12,
      dataSource: 'db',
      schedule: { mode: 'drip', days: 5, slotsPerDay: 1 },
      hasContentPlan: false,
      planApproved: false,
      zaloGroupIds: [],
      brief: {
        contentMode: 'custom_topic',
        productMode: 'context',
        topicText: 'Chăm sóc khách',
        productIds: [],
      },
    };

    const guarded = aiCampaignService._guardWizardGates(
      contentPlanResponse,
      history,
      { zaloAccounts: [{ id: 12, displayName: 'TK', status: 'connected', isActive: true }] },
      'vi',
      mergedGates
    );

    expect(guarded.response.type).toBe('content_plan');
    expect(guarded.response.data.totalDays).toBe(4);
    expect(guarded.response.data.requiresApproval).toBe(true);
  });

  it('employee chat V1: loads tenant resources by owner, meters Gemini by actor', async () => {
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
    axiosPost.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [{ text: '{"type":"text","content":"xin chào","missing_fields":[],"data":null}' }],
            },
          },
        ],
      },
    });

    await aiCampaignService.processSmartChat({
      userId: 9,
      resourceOwnerUserId: 3,
      history: [{ role: 'user', content: 'Xin chào trợ lý' }],
      locale: 'vi',
    });

    expect(getCourses).toHaveBeenCalledWith(3);
    expect(getEmailTemplates).toHaveBeenCalledWith(3);
    expect(getLandingPages).toHaveBeenCalledWith(3);
    expect(getFormattedProfileForPrompt).toHaveBeenCalledWith(3);
    expect(getCourses).not.toHaveBeenCalledWith(9);
    expect(reserve).toHaveBeenCalledWith(9, expect.any(Object));
    expect(record).toHaveBeenCalledWith(9, expect.any(Object), expect.objectContaining({ feature: 'smart_chat' }));
  });

  it('employee chat V2: loads tenant resources by owner, meters Gemini by actor', async () => {
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
    axiosPost.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [{ text: '{"type":"text","content":"ok v2","missing_fields":[],"data":null}' }],
            },
          },
        ],
      },
    });

    await aiCampaignService.processSmartChatV2({
      userId: 9,
      resourceOwnerUserId: 3,
      history: [{ role: 'user', content: 'Xin chào trợ lý' }],
      locale: 'vi',
    });

    expect(getEmailTemplates).toHaveBeenCalledWith(3);
    expect(getZaloAccounts).toHaveBeenCalledWith(3);
    expect(getCustomerStats).toHaveBeenCalledWith(3);
    expect(getContextForPrompt).toHaveBeenCalledWith(3, 'Xin chào trợ lý');
    expect(getEmailTemplates).not.toHaveBeenCalledWith(9);
    expect(reserve).toHaveBeenCalledWith(9, expect.any(Object));
    expect(record).toHaveBeenCalledWith(9, expect.any(Object), expect.objectContaining({ feature: 'smart_chat' }));
  });

  it('PR-B: trims content_plan days when model returns more days than user schedule', async () => {
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
    axiosPost.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    type: 'content_plan',
                    content: 'Kế hoạch 5 ngày cho chiến dịch',
                    data: {
                      totalDays: 5,
                      days: [
                        { day: 1, slots: [{ summary: 'Tin 1' }] },
                        { day: 2, slots: [{ summary: 'Tin 2' }] },
                        { day: 3, slots: [{ summary: 'Tin 3' }] },
                        { day: 4, slots: [{ summary: 'Tin 4' }] },
                        { day: 5, slots: [{ summary: 'Tin 5' }] },
                      ],
                    },
                    missing_fields: [],
                  }),
                },
              ],
            },
          },
        ],
      },
    });

    const result = await aiCampaignService.processSmartChat({
      userId: 1,
      history: [
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":1}\nTK 1' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
        { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Sale"}\nSale' },
        { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":3,"slotsPerDay":1}\n3 ngày' },
        { role: 'assistant', type: 'suggest_content_plan', content: 'Lên kế hoạch' },
        { role: 'user', content: 'Lên kế hoạch cho tôi' },
      ],
      locale: 'vi',
    });

    expect(result.type).toBe('content_plan');
    expect(result.data.days.length).toBe(3);
    expect(result.data.totalDays).toBe(3);
    expect(result.content).toContain('tự động điều chỉnh còn đúng 3 ngày');
  });

  it('PR-B: trims multi-step in confirm_create to match schedule.days * slotsPerDay', async () => {
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
    axiosPost.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    type: 'confirm_create',
                    content: 'Tạo chiến dịch Zalo',
                    data: {
                      campaignName: 'Zalo 3 tin',
                      nodes: [
                        {
                          nodeType: 'action',
                          nodeSubtype: 'send_zalo_group',
                          config: {
                            zaloGroupTemplateSteps: [
                              { message: 'Tin 1', delayValue: 0 },
                              { message: 'Tin 2', delayValue: 1 },
                              { message: 'Tin 3', delayValue: 2 },
                              { message: 'Tin 4', delayValue: 3 },
                              { message: 'Tin 5', delayValue: 4 },
                            ],
                          },
                        },
                      ],
                      connections: [],
                    },
                    missing_fields: [],
                  }),
                },
              ],
            },
          },
        ],
      },
    });

    const result = await aiCampaignService.processSmartChat({
      userId: 1,
      history: [
        { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo' },
        { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":1}\nTK 1' },
        { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
        { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Sale"}\nSale' },
        { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":3,"slotsPerDay":1}\n3 ngày' },
        { role: 'assistant', type: 'content_plan', data: { totalDays: 3, days: [{ day: 1 }, { day: 2 }, { day: 3 }] } },
        { role: 'user', content: '[wizard]{"gate":"planApproved","value":"approve"}\nĐồng ý' },
        { role: 'user', content: 'Tạo chiến dịch' },
      ],
      locale: 'vi',
    });

    expect(result.type).toBe('confirm_create');
    const groupNode = result.data.nodes[0];
    expect(groupNode.config.zaloGroupTemplateSteps.length).toBe(3);
  });

  describe('isUserConfirmingFile', () => {
    it('matches common Vietnamese and English confirmation phrases', () => {
      expect(isUserConfirmingFile('vẫn dùng file này')).toBe(true);
      expect(isUserConfirmingFile('cứ tiếp tục')).toBe(true);
      expect(isUserConfirmingFile('tiếp tục đi')).toBe(true);
      expect(isUserConfirmingFile('ok')).toBe(true);
      expect(isUserConfirmingFile('đồng ý')).toBe(true);
      expect(isUserConfirmingFile('ừ dùng đi')).toBe(true);
      expect(isUserConfirmingFile('được, làm tiếp đi')).toBe(true);
      expect(isUserConfirmingFile('vẫn dùng')).toBe(true);
      expect(isUserConfirmingFile('chốt')).toBe(true);
      expect(isUserConfirmingFile('yes')).toBe(true);
    });

    it('does not match cancel or unrelated questions', () => {
      expect(isUserConfirmingFile('huỷ')).toBe(false);
      expect(isUserConfirmingFile('đổi file khác')).toBe(false);
      expect(isUserConfirmingFile('hạn mức của tôi còn bao nhiêu?')).toBe(false);
    });
  });

  describe('PR-0 landing page generation in smart chat', () => {
    beforeEach(() => {
      reserve.mockResolvedValue({ maxOutputTokens: 8192 });
      extractGeminiUsage.mockReturnValue({ promptTokens: 10, outputTokens: 5, totalTokens: 15 });
    });

    it('prompt chat không còn chuỗi "html": "Nội dung HTML"', async () => {
      axiosPost.mockResolvedValueOnce({
        data: {
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: '{"type":"text","content":"Chào bạn","missing_fields":[],"data":null}' }] },
            },
          ],
        },
      });

      await aiCampaignService.processSmartChat({
        history: [{ role: 'user', content: 'Tạo landing page cho tôi' }],
        userId: 1,
      });

      expect(axiosPost).toHaveBeenCalled();
      const lastCall = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
      const payload = lastCall[1];
      const systemPrompt = payload.systemInstruction.parts[0].text;
      expect(systemPrompt).not.toContain('"html": "Nội dung HTML');
      expect(systemPrompt).toContain('TUYỆT ĐỐI KHÔNG viết HTML');
    });

    it('khi model trả type landing_page: gọi aiLandingPageService.generate và trả title + html', async () => {
      axiosPost.mockResolvedValueOnce({
        data: {
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      type: 'landing_page',
                      content: 'Đã tạo landing page cho bạn',
                      missing_fields: [],
                      data: {
                        title: 'Khoá Học AI Pro',
                        prompt: 'Trang landing giới thiệu khoá học AI chuyên sâu',
                      },
                    }),
                  },
                ],
              },
            },
          ],
        },
      });

      const res = await aiCampaignService.processSmartChat({
        history: [{ role: 'user', content: 'Tạo trang giới thiệu khoá học AI' }],
        userId: 1,
        resourceOwnerUserId: 10,
      });

      expect(generateLandingPageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 10,
          actorUserId: 1,
          prompt: 'Trang landing giới thiệu khoá học AI chuyên sâu',
          titleHint: 'Khoá Học AI Pro',
        })
      );
      expect(res.type).toBe('landing_page');
      expect(res.data).toMatchObject({
        title: 'Landing Mock',
        html: expect.stringContaining('<!DOCTYPE html>'),
      });
    });
  });
});

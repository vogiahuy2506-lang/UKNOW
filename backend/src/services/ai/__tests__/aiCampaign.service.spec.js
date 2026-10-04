import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createBrainGeminiAdapter } from './fixtures/brainGeminiAdapter.js';

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
const getForms = jest.fn(async () => []);
const getFormattedProfileForPrompt = jest.fn(async () => '');
const getContextForPrompt = jest.fn(async () => '');

jest.unstable_mockModule('axios', () => ({
  default: {
    post: axiosPost,
  },
}));

// runChat đi qua generateGeminiContent (G2.3): ranh giới Google giả nằm ở đó nhưng trả đúng hình dạng kết quả của lõi.
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage,
  generateGeminiContent: createBrainGeminiAdapter({ axiosPost, extractGeminiUsage }),
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
    getForms,
    // P8a — cờ Telegram/WhatsApp tắt trong spec này: không có tài khoản/dòng prompt nào.
    getAdapterChannelAccounts: async () => ({ telegram: [], whatsapp: [] }),
    getAdapterAccountsPromptBlock: async () => '',
    getAdapterNodeTypesPromptLines: () => '',
    getBlockedZaloPromptNotice: () => '',
  },
}));

jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: {
    reserve,
    record,
    resolveFallbackModel: jest.fn(async () => null),
  },
}));

jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async (_userId, model) => model || 'gemini-2.5-flash'),
}));

// PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — nhân viên (userId ≠ chủ) chỉ thấy tài khoản Zalo ĐƯỢC GIAO; bảng giao được mock.
const mockFindAssigned = jest.fn();
const realMemberRepo = await import('../../../repositories/user/memberChannelAccount.repository.js');
jest.unstable_mockModule('../../../repositories/user/memberChannelAccount.repository.js', () => ({
  ...realMemberRepo,
  findAssignedZaloAccountIds: mockFindAssigned,
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
    mockFindAssigned.mockReset();
    mockFindAssigned.mockResolvedValue([5]);
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
    getForms.mockReset();
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
    getForms.mockResolvedValue([]);
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
    // PR-G3: tài khoản Zalo theo CHỦ nhưng chỉ phần được giao cho nhân viên (danh sách wizard, prompt, nhóm, gợi ý kênh).
    expect(mockFindAssigned).toHaveBeenCalledWith(3, 9);
    expect(getZaloAccountsFull).toHaveBeenCalledWith(3, [5]);
    expect(getZaloAccounts).toHaveBeenCalledWith(3, [5]);
    expect(getZaloGroups).toHaveBeenCalledWith(3, [5]);
    expect(getRecommendedCampaignType).toHaveBeenCalledWith(3, [5]);
    expect(reserve).toHaveBeenCalledWith(9, expect.any(Object));
    expect(record).toHaveBeenCalledWith(9, expect.any(Object), expect.objectContaining({ feature: 'smart_chat' }));
  });

  // PR-G3 — mọi đường lấy danh sách / mặc định Zalo của trợ lý đều theo việc giao; chủ không bị lọc.
  describe('tài khoản Zalo được giao cho nhân viên (G3)', () => {
    const textReply = () => {
      reserve.mockResolvedValue({ maxOutputTokens: 1024 });
      extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
      axiosPost.mockResolvedValue({
        data: { candidates: [{ content: { parts: [{ text: '{"type":"text","content":"ok","missing_fields":[],"data":null}' }] } }] },
      });
    };

    it('CHỦ chat: danh sách Zalo KHÔNG bị lọc (accessibleIds = null), không đọc bảng giao', async () => {
      textReply();
      await aiCampaignService.processSmartChat({
        userId: 3, resourceOwnerUserId: 3, history: [{ role: 'user', content: 'Xin chào trợ lý' }], locale: 'vi',
      });
      expect(mockFindAssigned).not.toHaveBeenCalled();
      expect(getZaloAccountsFull).toHaveBeenCalledWith(3, null);
      expect(getZaloAccounts).toHaveBeenCalledWith(3, null);
      expect(getZaloGroups).toHaveBeenCalledWith(3, null);
    });

    it('nhân viên chưa được giao gì: mọi danh sách lọc bằng [] (không phải null)', async () => {
      textReply();
      mockFindAssigned.mockResolvedValue([]);
      await aiCampaignService.processSmartChat({
        userId: 9, resourceOwnerUserId: 3, history: [{ role: 'user', content: 'Xin chào trợ lý' }], locale: 'vi',
      });
      expect(getZaloAccountsFull).toHaveBeenCalledWith(3, []);
      expect(getZaloAccounts).toHaveBeenCalledWith(3, []);
    });

    it('FAIL-CLOSED: đọc bảng giao lỗi → danh sách lọc bằng [] (không bao giờ null)', async () => {
      textReply();
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFindAssigned.mockRejectedValue(new Error('db down'));
      await aiCampaignService.processSmartChat({
        userId: 9, resourceOwnerUserId: 3, history: [{ role: 'user', content: 'Xin chào trợ lý' }], locale: 'vi',
      });
      expect(getZaloAccountsFull).toHaveBeenCalledWith(3, []);
      expect(getZaloAccounts).toHaveBeenCalledWith(3, []);
    });

    it('_getWizardResources đánh dấu zaloAccessRestricted đúng theo có lọc hay không', async () => {
      expect((await aiCampaignService._getWizardResources(3, [5])).zaloAccessRestricted).toBe(true);
      expect((await aiCampaignService._getWizardResources(3, [])).zaloAccessRestricted).toBe(true);
      expect((await aiCampaignService._getWizardResources(3, null)).zaloAccessRestricted).toBe(false);
      expect((await aiCampaignService._getWizardResources(3)).zaloAccessRestricted).toBe(false);
    });

    // (Ca `generateCampaignScript (nhân viên)` của G3 đã gỡ cùng hàm — PR-13 C P3-2 xoá route /generate-campaign không ai gọi.)
  });

  // C P3-1 (PLAN_SUA_AI_DOT4 PR-3): lượt mà JSON của model hỏng không được tính credit. Cờ `parseFailed` (do parseAiJson gắn) phải
  // ĐI KÈM kết quả cuối của processSmartChat — đi qua các lớp guard bằng cách chúng giữ nguyên khoá lạ khi dựng lại object; guard nào
  // bắt đầu bỏ khoá này thì ca dưới đỏ (khi đó lượt hỏng bị trừ credit trở lại, hướng an toàn nhưng sai chính sách).
  it('C P3-1: model trả JSON hỏng → processSmartChat mang cờ parseFailed cùng lời xin lỗi soạn sẵn', async () => {
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
    axiosPost.mockResolvedValue({
      data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"type":"text","content":"xin chào' }] } }] },
    });

    const response = await aiCampaignService.processSmartChat({
      userId: 9,
      history: [{ role: 'user', content: 'Xin chào trợ lý' }],
      locale: 'vi',
    });

    expect(response.parseFailed).toBe(true);
    expect(response.content).toMatch(/lỗi định dạng/);
  });

  it('C P3-1: model trả JSON hợp lệ, hoặc văn xuôi thuần (câu trả lời thật) → KHÔNG có cờ parseFailed', async () => {
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });

    axiosPost.mockResolvedValueOnce({
      data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"type":"text","content":"xin chào","missing_fields":[],"data":null}' }] } }] },
    });
    const valid = await aiCampaignService.processSmartChat({ userId: 9, history: [{ role: 'user', content: 'Xin chào trợ lý' }], locale: 'vi' });
    expect(valid.parseFailed).toBeUndefined();

    axiosPost.mockResolvedValueOnce({
      data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Chào bạn, mình có thể giúp gì?' }] } }] },
    });
    const prose = await aiCampaignService.processSmartChat({ userId: 9, history: [{ role: 'user', content: 'Xin chào trợ lý' }], locale: 'vi' });
    expect(prose.content).toBe('Chào bạn, mình có thể giúp gì?');
    expect(prose.parseFailed).toBeUndefined();
  });

  it('PR-6c: prompt chat (V1) liệt kê danh sách Biểu mẫu (formId + title) và node read_form_submissions khi có 2 form', async () => {
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
    getForms.mockResolvedValueOnce([
      { id: 12, title: 'Tư vấn 1-1', isPublished: true, consentEnabled: true, consentedCount: 5 },
      { id: 20, title: 'Đặt lịch demo', isPublished: true, consentEnabled: false, consentedCount: 0 },
    ]);
    axiosPost.mockResolvedValue({
      data: {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: '{"type":"text","content":"ok","missing_fields":[],"data":null}' }] },
          },
        ],
      },
    });

    await aiCampaignService.processSmartChat({
      userId: 1,
      history: [{ role: 'user', content: 'Xin chào trợ lý' }],
      locale: 'vi',
    });

    const lastCall = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
    const systemPrompt = lastCall[1].systemInstruction.parts[0].text;
    expect(systemPrompt).toContain('id: 12');
    expect(systemPrompt).toContain('Tư vấn 1-1');
    expect(systemPrompt).toContain('id: 20');
    expect(systemPrompt).toContain('Đặt lịch demo');
    expect(systemPrompt).toContain('data/read_form_submissions');
  });

  // PR-1 (PLAN_VA_TRO_LY_AI_2026-09-28) Việc 2 — một nguồn năng lực: khối "KÊNH KHÔNG ĐƯỢC HỖ TRỢ" /
  // "TÍNH NĂNG CHƯA CÓ" viết tay (lệch với assistantCapabilities.js khi bật kênh mới, xem mục 3 báo
  // cáo rà soát) được thay bằng formatAssistantCapabilities('vi') — một nguồn duy nhất với não trợ
  // giúp. Ghim đúng 2 chuỗi mới có mặt, 2 chuỗi cũ KHÔNG còn.
  it('PR-1: prompt chat (V1) dùng formatAssistantCapabilities làm nguồn năng lực chung, không còn khối viết tay cũ', async () => {
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
    axiosPost.mockResolvedValue({
      data: {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: '{"type":"text","content":"ok","missing_fields":[],"data":null}' }] },
          },
        ],
      },
    });

    await aiCampaignService.processSmartChat({
      userId: 1,
      history: [{ role: 'user', content: 'Xin chào trợ lý' }],
      locale: 'vi',
    });

    const lastCall = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
    const systemPrompt = lastCall[1].systemInstruction.parts[0].text;
    expect(systemPrompt).toContain('=== NĂNG LỰC HÀNH ĐỘNG CỦA TRỢ LÝ');
    expect(systemPrompt).toContain('## KHÔNG HỖ TRỢ');
    expect(systemPrompt).not.toContain('Hệ thống hiện hỗ trợ 3 kênh');
    expect(systemPrompt).not.toContain('KÊNH KHÔNG ĐƯỢC HỖ TRỢ');
  });

  // PR-3 (LENH_GIAO_TRO_LY_AI_PR3_2026-09-28) Việc 2 — nhân viên thiếu quyền bị chặn ngay lượt
  // đầu, không tốn credit (wizardShortCircuit:true), không gọi model.
  describe('Việc 2 — nhân viên thiếu quyền', () => {
    it('(a) nhân viên thiếu campaigns_create + "tạo chiến dịch..." → text, permissionDenied, wizardShortCircuit, KHÔNG gọi model', async () => {
      const result = await aiCampaignService.processSmartChat({
        userId: 1,
        history: [{ role: 'user', content: 'tạo chiến dịch email giới thiệu khoá học cho khách cũ' }],
        locale: 'vi',
        employeePermissions: { campaigns_create: false },
      });

      expect(result.type).toBe('text');
      expect(result.data).toMatchObject({ permissionDenied: 'campaigns_create' });
      // Review PR-B (Việc 5): link hướng dẫn nhân viên phải bấm được (link markdown), không phải chữ thường.
      expect(result.content).toContain('](/huong-dan/nhan-vien)');
      expect(result.wizardShortCircuit).toBe(true);
      expect(axiosPost).not.toHaveBeenCalled();
    });

    // Phát hiện lúc phản biện: với sender/dataSource resources rỗng (mock mặc định của file này),
    // "tạo chiến dịch email..." không chạm axiosPost dù permission đủ — cổng tất định CÓ TRƯỚC PR-3
    // ("Deterministic gates before Gemini for any campaign-flow turn" :1009-1023) tự hỏi thêm
    // thông tin (sender/dataSource) trước khi tới model, và TỰ nó cũng set wizardShortCircuit:true.
    // Vì vậy ca (b) chỉ ghim đúng điều PR-3 chịu trách nhiệm: permission đủ thì KHÔNG còn
    // data.permissionDenied — không ghim "axiosPost được gọi" (đó là hành vi gate khác, không phải
    // của PR-3, và không tái hiện được trong bộ mock rỗng của file này).
    it('(b) cùng câu, campaigns_create:true → KHÔNG còn bị chặn bởi cổng quyền (permissionDenied biến mất)', async () => {
      const result = await aiCampaignService.processSmartChat({
        userId: 1,
        history: [{ role: 'user', content: 'tạo chiến dịch email giới thiệu khoá học cho khách cũ' }],
        locale: 'vi',
        employeePermissions: { campaigns_create: true },
      });

      expect(result.data?.permissionDenied).not.toBe('campaigns_create');
    });

    // Review PR-3 — hợp đồng "thiếu khoá = thiếu quyền" (permissions[key] !== true): controller truyền
    // `activeContext.permissions || {}` nên nhân viên chưa được cấp quyền nào tới đây bằng object RỖNG,
    // không phải {campaigns_create:false}. Đột biến "!== true" → "=== false" sống sót qua ca (a) —
    // ca này ghim đúng hợp đồng đó.
    it('(a2) nhân viên với permissions RỖNG {} (chưa cấp quyền nào) + "tạo chiến dịch..." → vẫn bị chặn campaigns_create', async () => {
      const result = await aiCampaignService.processSmartChat({
        userId: 1,
        history: [{ role: 'user', content: 'tạo chiến dịch email giới thiệu khoá học cho khách cũ' }],
        locale: 'vi',
        employeePermissions: {},
      });

      expect(result.type).toBe('text');
      expect(result.data).toMatchObject({ permissionDenied: 'campaigns_create' });
      expect(result.wizardShortCircuit).toBe(true);
      expect(axiosPost).not.toHaveBeenCalled();
    });

    it('(c) chủ (employeePermissions không truyền) → đi model, prompt KHÔNG chứa === QUYỀN NHÂN VIÊN', async () => {
      reserve.mockResolvedValue({ maxOutputTokens: 1024 });
      extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
      axiosPost.mockResolvedValue({
        data: {
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: '{"type":"text","content":"ok","missing_fields":[],"data":null}' }] },
            },
          ],
        },
      });

      await aiCampaignService.processSmartChat({
        userId: 1,
        history: [{ role: 'user', content: 'Xin chào trợ lý' }],
        locale: 'vi',
      });

      const lastCall = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
      const systemPrompt = lastCall[1].systemInstruction.parts[0].text;
      expect(systemPrompt).not.toContain('=== QUYỀN NHÂN VIÊN');
    });

    it('(d) nhân viên thiếu landing_pages + "tạo landing page..." → text, permissionDenied===landing_pages', async () => {
      const result = await aiCampaignService.processSmartChat({
        userId: 1,
        history: [{ role: 'user', content: 'tạo landing page bán khoá học tiếng Anh' }],
        locale: 'vi',
        employeePermissions: { campaigns_create: true, landing_pages: false },
      });

      expect(result.type).toBe('text');
      expect(result.data).toMatchObject({ permissionDenied: 'landing_pages' });
      expect(result.wizardShortCircuit).toBe(true);
      expect(axiosPost).not.toHaveBeenCalled();
    });

    // Phát hiện lúc phản biện: câu "soạn template email chào mừng học viên mới" trong lệnh giao
    // KHÔNG khớp isPlanTemplateDraftRequest (isPlanTemplatePrompt chỉ khớp đúng chuỗi máy sinh
    // "tạo chi tiết template cho ngày N" — dùng khi wizard đang ở giữa content_plan đã duyệt, xem
    // aiCampaignWizard.service.js:183,1623). Dùng đúng câu máy sinh để ghim đúng hành vi thật.
    it('(e) thiếu cả 2 quyền mẫu + prompt máy sinh "tạo chi tiết template cho ngày..." → text; chỉ thiếu zalo_templates → đi model', async () => {
      const denied = await aiCampaignService.processSmartChat({
        userId: 1,
        history: [{ role: 'user', content: 'Tạo chi tiết template cho ngày 1, slot 1 (Email)' }],
        locale: 'vi',
        employeePermissions: { campaigns_create: true, email_templates: false, zalo_templates: false },
      });
      expect(denied.type).toBe('text');
      expect(denied.data).toMatchObject({ permissionDenied: 'email_templates,zalo_templates' });
      expect(denied.wizardShortCircuit).toBe(true);
      expect(axiosPost).not.toHaveBeenCalled();

      reserve.mockResolvedValue({ maxOutputTokens: 1024 });
      extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
      axiosPost.mockResolvedValue({
        data: {
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: '{"type":"text","content":"ok","missing_fields":[],"data":null}' }] },
            },
          ],
        },
      });
      await aiCampaignService.processSmartChat({
        userId: 1,
        history: [{ role: 'user', content: 'Tạo chi tiết template cho ngày 1, slot 1 (Email)' }],
        locale: 'vi',
        employeePermissions: { campaigns_create: true, email_templates: false, zalo_templates: true },
      });
      expect(axiosPost).toHaveBeenCalled();
    });

    it('(f) nhân viên đủ quyền + "chào bạn" → prompt chứa === QUYỀN NHÂN VIÊN và "đủ 5 quyền trên"; thiếu campaigns_run → liệt kê có campaigns_run', async () => {
      reserve.mockResolvedValue({ maxOutputTokens: 1024 });
      extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
      axiosPost.mockResolvedValue({
        data: {
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: '{"type":"text","content":"ok","missing_fields":[],"data":null}' }] },
            },
          ],
        },
      });

      await aiCampaignService.processSmartChat({
        userId: 1,
        history: [{ role: 'user', content: 'chào bạn' }],
        locale: 'vi',
        employeePermissions: {
          campaigns_create: true,
          campaigns_run: true,
          landing_pages: true,
          email_templates: true,
          zalo_templates: true,
        },
      });
      let lastCall = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
      let systemPrompt = lastCall[1].systemInstruction.parts[0].text;
      expect(systemPrompt).toContain('=== QUYỀN NHÂN VIÊN');
      expect(systemPrompt).toContain('đủ 5 quyền trên');

      axiosPost.mockClear();
      await aiCampaignService.processSmartChat({
        userId: 1,
        history: [{ role: 'user', content: 'chào bạn' }],
        locale: 'vi',
        employeePermissions: {
          campaigns_create: true,
          campaigns_run: false,
          landing_pages: true,
          email_templates: true,
          zalo_templates: true,
        },
      });
      lastCall = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
      systemPrompt = lastCall[1].systemInstruction.parts[0].text;
      expect(systemPrompt).toContain('=== QUYỀN NHÂN VIÊN');
      expect(systemPrompt).toMatch(/KHÔNG có quyền:.*campaigns_run/);
    });
  });

  // C P3-3 (rà soát AI 03/10): hết suất chiến dịch phải báo NGAY ở lượt mở luồng, cùng khuôn cổng quyền PR-3 ngay trên — trước đây
  // khách đi hết wizard (nhiều lượt AI) rồi mới bị 400 `limitReached` ở nút Tạo. Service không tự chạm DB: controller truyền
  // `campaignSlotCheck` (trả kết quả checkUserResourceLimit hoặc null).
  describe('C P3-3 — hết suất chiến dịch ở lượt mở luồng', () => {
    const OPEN = 'tạo chiến dịch email giới thiệu khoá học cho khách cũ';
    const FULL = { allowed: false, limit: 5, currentCount: 5, message: 'Tài khoản đã đạt giới hạn số chiến dịch (5).' };
    const OK = { allowed: true, limit: 5, currentCount: 2, message: null };
    const run = (over = {}) => aiCampaignService.processSmartChat({
      userId: 1,
      history: [{ role: 'user', content: OPEN }],
      locale: 'vi',
      ...over,
    });
    const mockModelOk = () => {
      reserve.mockResolvedValue({ maxOutputTokens: 1024 });
      extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
      axiosPost.mockResolvedValue({
        data: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"type":"text","content":"ok","missing_fields":[],"data":null}' }] } }] },
      });
    };

    it('hết suất → câu báo cố định có số suất + link nâng gói, wizardShortCircuit (KHÔNG trừ credit), KHÔNG gọi model, reset wizard', async () => {
      const campaignSlotCheck = jest.fn(async () => FULL);
      const result = await run({ campaignSlotCheck });

      expect(campaignSlotCheck).toHaveBeenCalledTimes(1);
      expect(result.type).toBe('text');
      expect(result.wizardShortCircuit).toBe(true);
      expect(result.data).toEqual({ limitReached: 'campaigns', limit: 5 });
      expect(result.content).toContain('5/5');
      expect(result.content).toContain('](/app/billing)');
      expect(result._wizard).toMatchObject({ gateAsked: null, planChanged: true, planReset: true });
      expect(axiosPost).not.toHaveBeenCalled();
    });

    it('gói không có chiến dịch (limit 0) → câu riêng "chưa có tính năng tạo chiến dịch", không in 0/0', async () => {
      const result = await run({ campaignSlotCheck: async () => ({ allowed: false, limit: 0, currentCount: 0, message: 'x' }) });
      expect(result.wizardShortCircuit).toBe(true);
      expect(result.content).toContain('chưa có tính năng tạo chiến dịch');
      expect(result.content).not.toContain('0/0');
    });

    it('locale en → câu báo tiếng Anh', async () => {
      const result = await run({ locale: 'en', campaignSlotCheck: async () => FULL });
      expect(result.content).toContain("You've used all 5/5 campaign slots");
      expect(result.content).toContain('](/app/billing)');
    });

    it('còn suất → KHÔNG chặn (đi tiếp như cũ, không có data.limitReached); hàm kiểm được gọi đúng 1 lần', async () => {
      const campaignSlotCheck = jest.fn(async () => OK);
      const result = await run({ campaignSlotCheck });
      expect(campaignSlotCheck).toHaveBeenCalledTimes(1);
      expect(result.data?.limitReached).toBeUndefined();
    });

    it('không kiểm được (hàm trả null — controller đã fail-open) → đi tiếp như cũ', async () => {
      const result = await run({ campaignSlotCheck: async () => null });
      expect(result.data?.limitReached).toBeUndefined();
    });

    it('không truyền campaignSlotCheck (đường gọi khác / spec cũ) → không kiểm gì, hành vi cũ', async () => {
      const result = await run();
      expect(result.data?.limitReached).toBeUndefined();
    });

    it('cổng QUYỀN nhân viên đứng trước: thiếu campaigns_create thì báo thiếu quyền và KHÔNG tốn truy vấn hạn mức', async () => {
      const campaignSlotCheck = jest.fn(async () => FULL);
      const result = await run({ employeePermissions: { campaigns_create: false }, campaignSlotCheck });
      expect(result.data).toMatchObject({ permissionDenied: 'campaigns_create' });
      expect(campaignSlotCheck).not.toHaveBeenCalled();
    });

    describe('chỉ ở lượt MỞ luồng — các lượt khác KHÔNG kiểm (không chặn nhầm người đang hỏi / đang đi dở wizard)', () => {
      it('tin không phải yêu cầu chiến dịch ("Xin chào trợ lý") → không kiểm, đi tới model', async () => {
        mockModelOk();
        const campaignSlotCheck = jest.fn(async () => FULL);
        const result = await run({ history: [{ role: 'user', content: 'Xin chào trợ lý' }], campaignSlotCheck });
        expect(campaignSlotCheck).not.toHaveBeenCalled();
        expect(axiosPost).toHaveBeenCalled();
        expect(result.data?.limitReached).toBeUndefined();
      });

      it('luồng chiến dịch đã mở từ trước, tin cuối chỉ là câu trả lời thường → không kiểm lại', async () => {
        mockModelOk();
        const campaignSlotCheck = jest.fn(async () => FULL);
        await run({
          history: [
            { role: 'user', content: OPEN },
            { role: 'assistant', type: 'text', content: 'Bạn muốn gửi cho nhóm khách nào?' },
            { role: 'user', content: 'khách đã mua khoá IELTS' },
          ],
          campaignSlotCheck,
        });
        expect(campaignSlotCheck).not.toHaveBeenCalled();
      });

      it('lượt về LANDING ("tạo landing page…", dù router báo làm_giúp) → không chặn bằng hết suất chiến dịch', async () => {
        mockModelOk();
        const campaignSlotCheck = jest.fn(async () => FULL);
        const result = await run({
          history: [{ role: 'user', content: 'tạo landing page bán khoá học tiếng Anh' }],
          routeSaysActionRequest: true,
          campaignSlotCheck,
        });
        expect(campaignSlotCheck).not.toHaveBeenCalled();
        expect(result.data?.limitReached).toBeUndefined();
      });

      it('prompt MÁY của kế hoạch nhiều ngày (planSlotKey / intent content_plan_request) → không kiểm', async () => {
        mockModelOk();
        const campaignSlotCheck = jest.fn(async () => FULL);
        await run({
          history: [{ role: 'user', content: 'Tạo chi tiết template cho ngày 1, slot 1 (Email)' }],
          planSlotKey: 'day1-slot1',
          routeSaysActionRequest: true,
          campaignSlotCheck,
        });
        await run({
          history: [{ role: 'user', content: 'Hãy trả về content_plan JSON cho chiến dịch 3 ngày' }],
          intent: 'content_plan_request',
          routeSaysActionRequest: true,
          campaignSlotCheck,
        });
        expect(campaignSlotCheck).not.toHaveBeenCalled();
      });

      it('router báo làm_giúp cho một câu chưa có từ khoá chiến dịch ("gửi giúp mình tin cho khách") → vẫn là lượt mở luồng, có kiểm', async () => {
        const campaignSlotCheck = jest.fn(async () => FULL);
        const result = await run({
          history: [{ role: 'user', content: 'gửi giúp mình tin cho khách cũ' }],
          routeSaysActionRequest: true,
          campaignSlotCheck,
        });
        expect(campaignSlotCheck).toHaveBeenCalledTimes(1);
        expect(result.data).toEqual({ limitReached: 'campaigns', limit: 5 });
      });
    });
  });

  it('PR-5b-2b: prompt chat (V1) ghi rõ landing đã gắn Biểu mẫu (formId cạnh slug), landing khác vẫn ghi bình thường', async () => {
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 2, outputTokens: 1, totalTokens: 3 });
    getLandingPages.mockResolvedValueOnce([
      { slug: 'khoa-hoc-ielts', title: 'Khoá IELTS', isPublished: true, formId: 7 },
      { slug: 'landing-thuong', title: 'Landing thường', isPublished: true, formId: null },
    ]);
    axiosPost.mockResolvedValue({
      data: {
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: '{"type":"text","content":"ok","missing_fields":[],"data":null}' }] },
          },
        ],
      },
    });

    await aiCampaignService.processSmartChat({
      userId: 1,
      history: [{ role: 'user', content: 'Xin chào trợ lý' }],
      locale: 'vi',
    });

    const lastCall = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
    const systemPrompt = lastCall[1].systemInstruction.parts[0].text;
    expect(systemPrompt).toContain('slug: "khoa-hoc-ielts"');
    expect(systemPrompt).toContain('formId=7');
    expect(systemPrompt).toContain('slug: "landing-thuong"');
    // Landing không có form gắn: dòng của nó KHÔNG chứa "formId=" (đứng riêng, không lẫn số của landing kia).
    const landingThuongLine = systemPrompt.split('\n').find((line) => line.includes('landing-thuong'));
    expect(landingThuongLine).not.toContain('formId=');
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

    it('T12: system prompt dặn dò trang web, website, web page và KHÔNG BAO GIỜ gọi ask_campaign_details', async () => {
      axiosPost.mockResolvedValueOnce({
        data: {
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [{ text: JSON.stringify({ type: 'text', content: 'Chào bạn', missing_fields: [], data: null }) }],
              },
            },
          ],
        },
      });

      await aiCampaignService.processSmartChat({
        history: [{ role: 'user', content: 'Tạo website cho tôi' }],
        userId: 1,
      });

      expect(axiosPost).toHaveBeenCalled();
      const lastCall = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
      const payload = lastCall[1];
      const systemPrompt = payload.systemInstruction.parts[0].text;
      expect(systemPrompt).toContain('trang web, website, web page');
      expect(systemPrompt).toContain('tuyệt đối KHÔNG BAO GIỜ gọi ask_campaign_details cho yêu cầu tạo trang web/website');
      expect(systemPrompt).toContain('### Khi user prompt "tạo landing page / trang web / website [...]":');
    });

    // C P2-8 — não chiến dịch từng được dặn "hướng dẫn user vào đúng mục trong menu" mà KHÔNG có danh sách menu nào trong prompt
    // → câu hỏi xoá/sửa chiến dịch cũ, tài khoản, thanh toán lọt vào đây thì model bịa đường đi. Nay chỉ được mời mở mục Hướng dẫn.
    it('C P2-8: yêu cầu ngoài phạm vi (xoá chiến dịch cũ, tài khoản, thanh toán) → dặn mời mở mục Hướng dẫn kèm link /huong-dan, KHÔNG dặn tự nêu đường đi menu', async () => {
      axiosPost.mockResolvedValueOnce({
        data: {
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [{ text: JSON.stringify({ type: 'text', content: 'Chào bạn', missing_fields: [], data: null }) }],
              },
            },
          ],
        },
      });

      await aiCampaignService.processSmartChat({
        history: [{ role: 'user', content: 'Xin chào trợ lý' }],
        userId: 1,
      });

      const lastCall = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
      const systemPrompt = lastCall[1].systemInstruction.parts[0].text;
      const outOfScopeRule = systemPrompt.split('\n').find((line) => line.includes('Xóa/sửa/dừng chiến dịch cũ, quản lý tài khoản, thanh toán'));
      expect(outOfScopeRule).toBeTruthy();
      expect(outOfScopeRule).toContain('[Hướng dẫn](/huong-dan)');
      expect(outOfScopeRule).toContain('mục Hướng dẫn');
      expect(outOfScopeRule).toContain('KHÔNG kèm tên miền');
      // Luật cũ bảo model "vào đúng mục trong menu" — phải biến mất khỏi toàn bộ prompt.
      expect(systemPrompt).not.toContain('hướng dẫn user vào đúng mục trong menu');
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

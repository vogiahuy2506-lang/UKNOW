/**
 * F2.2 (rà soát C P1-3) — compiler Email bỏ bộ lọc người nhận.
 *
 * Câu "gửi email cho khách đã mua khoá A mà chưa mua khoá B": LLM đặt `interestedCourseIds` / `notPurchasedCourseIds` /
 * `interestedCustomerType` trên node `interested_customers`. Compiler (prod bật cho email) dựng lại node đó luôn là
 * "both / 1000" nên bộ lọc mất — email đi tới MỌI khách có email, và thẻ xác nhận chỉ ghi "Lấy dữ liệu khách hàng".
 *
 * Quy tắc chốt ngay: script LLM có bộ lọc người nhận → GIỮ script LLM (không cho compiler ghi đè). Không có bộ lọc → compiler áp
 * như cũ. Test chạy qua processSmartChat (marker wizard thật + script LLM thật hình dạng), không dựng riêng hàm quyết định.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createBrainGeminiAdapter } from './fixtures/brainGeminiAdapter.js';

const axiosPost = jest.fn();
const extractGeminiUsage = jest.fn();
const generateGeminiContent = jest.fn();
const reserve = jest.fn();
const record = jest.fn();
const getZaloAccountsFull = jest.fn();
const getActiveEmailSenders = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { post: axiosPost } }));
// Hai đường cùng gọi generateGeminiContent: não chính (runChat, G2.3) gửi `contents` nhiều lượt; slot filler gửi `parts`.
const brainGenerateGeminiContent = createBrainGeminiAdapter({ axiosPost, extractGeminiUsage });
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage,
  generateGeminiContent: (args) => (Array.isArray(args?.contents) ? brainGenerateGeminiContent(args) : generateGeminiContent(args)),
}));
jest.unstable_mockModule('../businessProfile.service.js', () => ({
  default: {
    getProfile: jest.fn(),
    getContextForPrompt: jest.fn(async () => ''),
    formatProfileForPrompt: jest.fn(() => ''),
    getFormattedProfileForPrompt: jest.fn(async () => ''),
  },
  serializeProductList: jest.fn(() => ''),
}));
jest.unstable_mockModule('../adminContext.service.js', () => ({ buildAdminContext: jest.fn() }));
jest.unstable_mockModule('../aiLandingPage.service.js', () => ({ default: { generate: jest.fn() } }));
jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({ default: { readTempFileBuffer: jest.fn() } }));
jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({ extractTextFromBuffer: jest.fn() }));
jest.unstable_mockModule('../../../utils/googleUrlFetch.util.js', () => ({
  attachGoogleUrlParts: jest.fn(async () => ({ parts: [], warnings: [] })),
}));
jest.unstable_mockModule('../aiPromptResources.service.js', () => ({
  default: {
    getZaloAccountsFull,
    getActiveEmailSenders,
    getEmailTemplates: jest.fn(async () => []),
    getZaloAccounts: jest.fn(async () => []),
    getZaloGroups: jest.fn(async () => []),
    getZaloTemplates: jest.fn(async () => []),
    getRecommendedCampaignType: jest.fn(async () => 'email'),
    getCustomerStats: jest.fn(async () => ({ total: 10, hasEmail: 10, hasZalo: 0 })),
    getCourses: jest.fn(async () => []),
    getLandingPages: jest.fn(async () => []),
    getForms: jest.fn(async () => []),
    getAdapterChannelAccounts: async () => ({ telegram: [], whatsapp: [] }),
    getAdapterAccountsPromptBlock: async () => '',
    getAdapterNodeTypesPromptLines: () => '',
    getBlockedZaloPromptNotice: () => '',
  },
}));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: { reserve, record, resolveFallbackModel: jest.fn(async () => null) },
}));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async (_userId, model) => model || 'gemini-2.5-flash'),
}));

const { default: aiCampaignService } = await import('../aiCampaign.service.js');
const { detectLegacyAudienceFilters } = await import('../campaignIntent.schema.js');

/** Script LLM hình dạng thật: node khách DB (cấu hình bộ lọc tuỳ ca) → node gửi email có nội dung đầy đủ. */
function llmEmailScript(audienceConfig) {
  return {
    type: 'confirm_create',
    content: 'Tạo chiến dịch email',
    data: {
      campaignName: 'Email khách đã mua khoá A',
      campaignType: 'email',
      nodes: [
        {
          tempId: 'n_audience',
          nodeType: 'data',
          nodeSubtype: 'interested_customers',
          nodeName: 'Danh sách khách',
          config: audienceConfig,
        },
        {
          tempId: 'n_send',
          nodeType: 'action',
          nodeSubtype: 'send_email',
          nodeName: 'Gửi email',
          config: {
            recipientSource: 'node',
            recipientNodeId: 'n_audience',
            recipientField: 'email',
            emailSteps: [
              { emailSubject: 'Khoá nâng cao dành riêng cho bạn', emailBody: '<p>Xin chào {{full_name}}, mời bạn học tiếp.</p>', delayValue: 0 },
            ],
          },
        },
      ],
      connections: [{ sourceNodeId: 'n_audience', targetNodeId: 'n_send', connectionType: 'default', connectionLabel: '' }],
    },
    missing_fields: [],
  };
}

const EMAIL_HISTORY = [
  { role: 'user', content: 'Tạo chiến dịch email gửi cho khách đã mua khoá A mà chưa mua khoá B' },
  { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
  { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":1}\nEmail 1' },
  { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nKhách trong DB' },
  { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Mời học khoá nâng cao"}\nChủ đề' },
  { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi 1 lần' },
];

async function runEmailTurn(audienceConfig) {
  axiosPost.mockResolvedValue({
    data: { candidates: [{ content: { parts: [{ text: JSON.stringify(llmEmailScript(audienceConfig)) }] } }] },
  });
  const result = await aiCampaignService.processSmartChat({ userId: 7, history: EMAIL_HISTORY, locale: 'vi' });
  const audienceNode = result.data?.nodes?.find((n) => n.nodeSubtype === 'interested_customers' || n.node_subtype === 'interested_customers');
  return { result, audienceConfig: audienceNode?.config };
}

describe('F2.2 — script LLM có bộ lọc người nhận thì compiler KHÔNG ghi đè', () => {
  const prevEnabled = process.env.COMPILER_ENABLED_FLOWS;
  const prevSlot = process.env.COMPILER_SLOT_FILLING_FLOWS;

  beforeEach(() => {
    process.env.COMPILER_ENABLED_FLOWS = 'email';
    process.env.COMPILER_SLOT_FILLING_FLOWS = '';
    [axiosPost, extractGeminiUsage, generateGeminiContent, reserve, record, getZaloAccountsFull, getActiveEmailSenders]
      .forEach((fn) => fn.mockReset());
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 1, outputTokens: 1, totalTokens: 2 });
    getZaloAccountsFull.mockResolvedValue([]);
    getActiveEmailSenders.mockResolvedValue([{ id: 1, name: 'Email 1', email: 'shop@example.vn', status: 'active', isActive: true }]);
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.COMPILER_ENABLED_FLOWS;
    else process.env.COMPILER_ENABLED_FLOWS = prevEnabled;
    if (prevSlot === undefined) delete process.env.COMPILER_SLOT_FILLING_FLOWS;
    else process.env.COMPILER_SLOT_FILLING_FLOWS = prevSlot;
  });

  it('"đã mua khoá A, chưa mua khoá B" (courseIds + notPurchased + type purchased) → giữ script LLM, bộ lọc còn nguyên', async () => {
    const { result, audienceConfig } = await runEmailTurn({
      interestedCustomerType: 'purchased',
      interestedLimit: 1000,
      interestedCourseIds: [3],
      notPurchasedCourseIds: [4],
    });

    expect(result.type).toBe('confirm_create');
    expect(result.data.compilerApplied).not.toBe(true);
    expect(result.data._via).not.toBe('ai_compiler');
    expect(audienceConfig).toMatchObject({
      interestedCustomerType: 'purchased',
      interestedCourseIds: [3],
      notPurchasedCourseIds: [4],
    });
  });

  it('chỉ có loại khách "purchased" (không có id khoá) cũng là bộ lọc → giữ script LLM', async () => {
    const { result, audienceConfig } = await runEmailTurn({ interestedCustomerType: 'purchased', interestedLimit: 1000 });

    expect(result.data.compilerApplied).not.toBe(true);
    expect(audienceConfig.interestedCustomerType).toBe('purchased');
  });

  it('giới hạn số khách khác mặc định (gửi thử 20 khách) → giữ script LLM, không bị nới thành 1000', async () => {
    const { result, audienceConfig } = await runEmailTurn({ interestedCustomerType: 'both', interestedLimit: 20 });

    expect(result.data.compilerApplied).not.toBe(true);
    expect(audienceConfig.interestedLimit).toBe(20);
  });

  it('ĐỐI CHỨNG: không có bộ lọc ("both"/1000, mảng rỗng) → compiler áp như cũ (via ai_compiler)', async () => {
    const { result, audienceConfig } = await runEmailTurn({
      interestedCustomerType: 'both',
      interestedLimit: 1000,
      interestedCourseIds: [],
      notPurchasedCourseIds: [],
    });

    expect(result.data.compilerApplied).toBe(true);
    expect(result.data._via).toBe('ai_compiler');
    expect(audienceConfig).toMatchObject({ interestedCustomerType: 'both', interestedLimit: 1000 });
  });
});

describe('detectLegacyAudienceFilters (hàm thuần)', () => {
  const node = (nodeSubtype, config) => ({ nodeType: 'data', nodeSubtype, config });

  it('không có node khách DB / script rỗng → không có bộ lọc', () => {
    expect(detectLegacyAudienceFilters(null)).toEqual({ hasFilters: false, reasons: [] });
    expect(detectLegacyAudienceFilters({ nodes: [] })).toEqual({ hasFilters: false, reasons: [] });
    expect(detectLegacyAudienceFilters({ nodes: [node('read_sheet', { interestedCourseIds: [1] })] }).hasFilters).toBe(false);
  });

  it('liệt kê đúng lý do; nhận cả snake_case node_subtype và alias read_interested_customers', () => {
    const result = detectLegacyAudienceFilters({
      nodes: [{ node_subtype: 'read_interested_customers', config: { interestedCourseIds: ['7'], notPurchasedCourseIds: [9], interestedCustomerType: 'Interested', interestedLimit: 50 } }],
    });
    expect(result.hasFilters).toBe(true);
    expect(result.reasons.sort()).toEqual(['interestedCourseIds', 'interestedCustomerType', 'interestedLimit', 'notPurchasedCourseIds']);
  });

  it('giá trị mặc định / rỗng không tính là bộ lọc', () => {
    expect(detectLegacyAudienceFilters({
      nodes: [node('interested_customers', { interestedCustomerType: 'both', interestedLimit: '1000', interestedCourseIds: [], notPurchasedCourseIds: [null, ''] })],
    })).toEqual({ hasFilters: false, reasons: [] });
    expect(detectLegacyAudienceFilters({ nodes: [node('interested_customers', {})] }).hasFilters).toBe(false);
  });
});

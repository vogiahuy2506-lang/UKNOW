/**
 * F2.1 (PLAN_SUA_AI_DOT1_2026-10-03) — Slot filling Zalo nhóm viết "mù".
 *
 * Sự cố thật: 9 chiến dịch Zalo nhóm của 9 chủ shop khác nhau đã gửi 23 tin thật 20–26/09/2026 với nội dung AI bịa "chiến dịch
 * đặc biệt, ưu đãi đặc quyền lớn nhất năm", không có chủ đề/sản phẩm khách đã nhập. Spec cũ (campaignSlotFiller.spec.js) xanh vì
 * TỰ DỰNG `contentBrief.topic` bằng tay — tên trường mà CampaignBrief thật không hề có.
 *
 * Spec này đi đúng đường production: lịch sử chat có marker `[wizard]{"gate":"campaignBrief",…}` → processSmartChat →
 * extractCampaignBriefFromHistory → deriveIntent → compileCampaign → fillContentSlots → generateGeminiContent. KHÔNG tự dựng
 * `contentBrief`; chụp prompt thật gửi cho Gemini (mock) và kiểm trong đó.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createBrainGeminiAdapter } from './fixtures/brainGeminiAdapter.js';

const axiosPost = jest.fn();
const extractGeminiUsage = jest.fn();
const generateGeminiContent = jest.fn();
const attachGoogleUrlParts = jest.fn();
const reserve = jest.fn();
const record = jest.fn();
const getZaloAccountsFull = jest.fn();
const getActiveEmailSenders = jest.fn();
const getFormattedProfileForPrompt = jest.fn();
const findByIdAndUser = jest.fn();
const findByIdsAndUser = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { post: axiosPost } }));

// Hai đường cùng gọi generateGeminiContent: não chính (runChat, G2.3) gửi `contents` nhiều lượt; slot filler gửi `parts`.
// Tách theo đó để mock cũ của slot filler (đếm lượt gọi, đọc prompt) không đổi.
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
    getFormattedProfileForPrompt,
  },
  serializeProductList: jest.fn(() => ''),
}));

jest.unstable_mockModule('../adminContext.service.js', () => ({ buildAdminContext: jest.fn() }));
jest.unstable_mockModule('../aiLandingPage.service.js', () => ({ default: { generate: jest.fn() } }));
jest.unstable_mockModule('../../landingTemplate/landingTemplate.service.js', () => ({
  default: { generateLandingPage: jest.fn() },
}));
jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: { readTempFileBuffer: jest.fn() },
}));
jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({ extractTextFromBuffer: jest.fn() }));
jest.unstable_mockModule('../../../utils/googleUrlFetch.util.js', () => ({ attachGoogleUrlParts }));

jest.unstable_mockModule('../aiPromptResources.service.js', () => ({
  default: {
    getZaloAccountsFull,
    getActiveEmailSenders,
    getEmailTemplates: jest.fn(async () => []),
    getZaloAccounts: jest.fn(async () => []),
    getZaloGroups: jest.fn(async () => []),
    getZaloTemplates: jest.fn(async () => []),
    getRecommendedCampaignType: jest.fn(async () => 'mixed'),
    getCustomerStats: jest.fn(async () => ({ total: 0, hasEmail: 0, hasZalo: 0 })),
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

// Sản phẩm catalog: resolveCampaignBrief THẬT import động repository này — mock đúng ranh giới DB.
jest.unstable_mockModule('../../../repositories/courses/course.repository.js', () => ({
  default: { findByIdAndUser, findByIdsAndUser },
}));

const { default: aiCampaignService } = await import('../aiCampaign.service.js');

const ZALO_GROUP_SCRIPT = {
  type: 'confirm_create',
  content: 'Tạo chiến dịch Zalo nhóm',
  data: {
    campaignName: 'Zalo nhóm',
    campaignType: 'zalo',
    nodes: [
      {
        tempId: 'n_send',
        nodeType: 'action',
        nodeSubtype: 'send_zalo_group',
        config: { zaloGroupTemplateSteps: [{ message: 'Tin do LLM lần 1', delayValue: 0 }] },
      },
    ],
    connections: [],
  },
  missing_fields: [],
};

function mockBrainReturns(response) {
  axiosPost.mockResolvedValue({
    data: { candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }] },
  });
}

/** Lịch sử y hệt FE gửi: lời yêu cầu → thẻ kênh → tài khoản → nhóm → brief → lịch (marker cuối). */
function wizardHistory({ requestText, briefMarker }) {
  return [
    { role: 'user', content: requestText },
    { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo_group"}\nZalo nhóm' },
    { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo_group","accountId":1}\nTK 1' },
    { role: 'user', content: '[wizard]{"gate":"zaloGroups","groupIds":["g1"]}\nNhóm 1' },
    { role: 'user', content: `[wizard]${JSON.stringify(briefMarker)}\nChủ đề` },
    // Lượt cuối là marker lịch gửi (người dùng bấm thẻ cuối cùng) — đúng cách FE gửi: marker là tin cuối, server mới gọi model.
    { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi 1 lần' },
  ];
}

async function runZaloGroupTurn({ requestText, briefMarker, locale = 'vi', localeContext = null }) {
  const result = await aiCampaignService.processSmartChat({
    userId: 7,
    history: wizardHistory({ requestText, briefMarker }),
    locale,
    localeContext,
  });
  const call = generateGeminiContent.mock.calls[0]?.[0] || null;
  return {
    result,
    slotUserPrompt: call?.parts?.[0]?.text || '',
    slotSystemPrompt: call?.systemInstruction?.parts?.[0]?.text || '',
  };
}

describe('F2.1 — slot filling Zalo nhóm nhận chủ đề/sản phẩm/ngôn ngữ từ brief THẬT', () => {
  const prevFlows = process.env.COMPILER_SLOT_FILLING_FLOWS;
  const prevEnabled = process.env.COMPILER_ENABLED_FLOWS;

  beforeEach(() => {
    process.env.COMPILER_SLOT_FILLING_FLOWS = 'zalo_group';
    process.env.COMPILER_ENABLED_FLOWS = '';
    [axiosPost, extractGeminiUsage, generateGeminiContent, attachGoogleUrlParts, reserve, record,
      getZaloAccountsFull, getActiveEmailSenders, getFormattedProfileForPrompt, findByIdAndUser, findByIdsAndUser,
    ].forEach((fn) => fn.mockReset());
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 1, outputTokens: 1, totalTokens: 2 });
    attachGoogleUrlParts.mockImplementation(async () => ({ parts: [], warnings: [] }));
    getZaloAccountsFull.mockResolvedValue([{ id: 1, displayName: 'TK 1', status: 'connected', isActive: true }]);
    getActiveEmailSenders.mockResolvedValue([]);
    getFormattedProfileForPrompt.mockResolvedValue('');
    generateGeminiContent.mockResolvedValue({
      text: JSON.stringify({ slots: [{ slotId: 'whatever', message: 'Xin chào cả nhà! Đây là tin đã soạn.' }] }),
      usage: { promptTokens: 1, outputTokens: 1, totalTokens: 2 },
      modelUsed: 'gemini-2.5-flash',
    });
    mockBrainReturns(ZALO_GROUP_SCRIPT);
  });

  afterEach(() => {
    if (prevFlows === undefined) delete process.env.COMPILER_SLOT_FILLING_FLOWS;
    else process.env.COMPILER_SLOT_FILLING_FLOWS = prevFlows;
    if (prevEnabled === undefined) delete process.env.COMPILER_ENABLED_FLOWS;
    else process.env.COMPILER_ENABLED_FLOWS = prevEnabled;
  });

  it('custom_topic: prompt gửi Gemini chứa topicText khách nhập, câu yêu cầu thật, luật cấm bịa — KHÔNG còn "Thông báo chiến dịch"', async () => {
    const topicText = 'Thông báo lịch nghỉ Tết Nguyên đán 2027 của cửa hàng Hoa Nắng';
    const { result, slotUserPrompt, slotSystemPrompt } = await runZaloGroupTurn({
      requestText: 'Tạo chiến dịch gửi vào nhóm Zalo khách quen thông báo lịch nghỉ Tết',
      briefMarker: { gate: 'campaignBrief', contentMode: 'custom_topic', topicText },
    });

    expect(generateGeminiContent).toHaveBeenCalledTimes(1);
    // Chốt chặn: slot filling thật sự chạy và được áp dụng (không phải đường fail-open).
    expect(result.data._via || result.data.script?._via).toBe('ai_compiler_slot_filling');

    expect(slotUserPrompt).toContain(topicText);
    expect(slotUserPrompt).toContain('Tạo chiến dịch gửi vào nhóm Zalo khách quen thông báo lịch nghỉ Tết');
    expect(slotUserPrompt).not.toContain('Thông báo chiến dịch');
    expect(slotSystemPrompt).toMatch(/KHÔNG bịa dữ kiện/);
    expect(slotSystemPrompt).toMatch(/giá, ưu đãi, khuyến mãi/);
    // Marker `[wizard]{…}` là JSON máy sinh, không được lọt vào prompt như "lời người dùng".
    expect(slotUserPrompt).not.toContain('[wizard]');
  });

  it('single_product "other": prompt chứa tên + mô tả sản phẩm khách nhập', async () => {
    const { slotUserPrompt } = await runZaloGroupTurn({
      requestText: 'Tạo chiến dịch Zalo nhóm giới thiệu sản phẩm mới',
      briefMarker: {
        gate: 'campaignBrief',
        contentMode: 'single_product',
        productMode: 'other',
        productName: 'Bó hoa hướng dương Mini',
        productDescription: 'Bó hoa nhỏ 5 bông, giao trong ngày nội thành',
      },
    });

    expect(slotUserPrompt).toContain('Bó hoa hướng dương Mini');
    expect(slotUserPrompt).toContain('Bó hoa nhỏ 5 bông, giao trong ngày nội thành');
  });

  it('single_product từ catalog: resolveCampaignBrief THẬT giải sản phẩm → prompt chứa tên + giá + mô tả sản phẩm đó', async () => {
    findByIdAndUser.mockResolvedValue({
      id: 5,
      course_name: 'Khoá Marketing AI cơ bản',
      description: 'Học cách dùng AI viết nội dung bán hàng trong 4 buổi',
      category: 'Đào tạo',
      price: 1990000,
      original_price: 2990000,
    });
    const { slotUserPrompt } = await runZaloGroupTurn({
      requestText: 'Tạo chiến dịch Zalo nhóm giới thiệu khoá học',
      briefMarker: { gate: 'campaignBrief', contentMode: 'single_product', productId: 5 },
    });

    expect(findByIdAndUser).toHaveBeenCalledWith(5, 7);
    expect(slotUserPrompt).toContain('Khoá Marketing AI cơ bản');
    expect(slotUserPrompt).toContain('Học cách dùng AI viết nội dung bán hàng trong 4 buổi');
    expect(slotUserPrompt).toContain('1990000');
  });

  it('chọn tiếng Anh (contentLocale=en từ ngôn ngữ UI): prompt yêu cầu viết toàn bộ bằng tiếng Anh', async () => {
    const { slotUserPrompt, slotSystemPrompt } = await runZaloGroupTurn({
      requestText: 'Create a Zalo group campaign announcing our holiday schedule',
      briefMarker: { gate: 'campaignBrief', contentMode: 'custom_topic', topicText: 'Holiday schedule announcement' },
      locale: 'en',
      localeContext: { uiLocale: 'en', conversationLocale: 'en', contentLocale: 'en', contentLocaleSource: 'explicit' },
    });

    expect(slotUserPrompt).toContain('Holiday schedule announcement');
    expect(slotUserPrompt).toContain('Tiếng Anh (English)');
    expect(slotSystemPrompt).toContain('Write the ENTIRE message in natural, professional English');
    expect(slotSystemPrompt).not.toContain('Tiếng Việt chuẩn có dấu, ngữ điệu');
  });

  it('hồ sơ doanh nghiệp (đã định dạng) được đưa vào prompt như dữ kiện tham chiếu, kèm luật không tự thêm sản phẩm', async () => {
    getFormattedProfileForPrompt.mockResolvedValue('=== HỒ SƠ DOANH NGHIỆP (đầy đủ) ===\n- Tên công ty: Cửa hàng Hoa Nắng\n=== HẾT HỒ SƠ ===');
    const { slotUserPrompt } = await runZaloGroupTurn({
      requestText: 'Tạo chiến dịch Zalo nhóm thông báo nghỉ Tết',
      briefMarker: { gate: 'campaignBrief', contentMode: 'custom_topic', topicText: 'Nghỉ Tết 2027' },
    });

    expect(slotUserPrompt).toContain('Cửa hàng Hoa Nắng');
    expect(slotUserPrompt).toMatch(/KHÔNG tự đưa sản phẩm ngoài mục "THÔNG TIN NỘI DUNG"/);
  });
});

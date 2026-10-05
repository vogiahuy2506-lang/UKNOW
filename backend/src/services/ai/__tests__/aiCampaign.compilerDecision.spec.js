/**
 * PR-10 mục 3(d) (C P2-2): `data.compiler = { applied, reason }` — quyết định của compiler ở lượt xác nhận chiến dịch phải NHÌN THẤY được
 * trong phản hồi (và vì thế trong ai_chat_messages.data) thay vì chỉ ở dòng console.log mất mỗi lần deploy.
 *
 * Đi đúng đường production như campaignSlotFillerWiring.spec.js: lịch sử chat có marker `[wizard]{…}` → processSmartChat →
 * deriveIntent → compileCampaign → fillContentSlots / mergeCompiledWithContent. Ranh giới giả lập: Google (não + slot filler), tài nguyên, CSDL.
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

const FULL_HISTORY = [
  { role: 'user', content: 'Tạo chiến dịch gửi vào nhóm Zalo khách quen thông báo lịch nghỉ Tết' },
  { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo_group"}\nZalo nhóm' },
  { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo_group","accountId":1}\nTK 1' },
  { role: 'user', content: '[wizard]{"gate":"zaloGroups","groupIds":["g1"]}\nNhóm 1' },
  { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Nghỉ Tết 2027"}\nChủ đề' },
  { role: 'user', content: '[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi 1 lần' },
];

const runTurn = (history = FULL_HISTORY) => aiCampaignService.processSmartChat({ userId: 7, history, locale: 'vi' });

describe('PR-10 — data.compiler = { applied, reason } ở lượt xác nhận chiến dịch', () => {
  const prevFlows = process.env.COMPILER_SLOT_FILLING_FLOWS;
  const prevEnabled = process.env.COMPILER_ENABLED_FLOWS;

  beforeEach(() => {
    process.env.COMPILER_SLOT_FILLING_FLOWS = '';
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

  it('Slot Filling chạy và được áp dụng → { applied: true, reason: "slot_filling" }', async () => {
    process.env.COMPILER_SLOT_FILLING_FLOWS = 'zalo_group';
    const result = await runTurn();
    expect(result.data._via || result.data.script?._via).toBe('ai_compiler_slot_filling'); // chốt: thật sự đã áp dụng
    expect(result.data.compiler).toEqual({ applied: true, reason: 'slot_filling' });
  });

  it('chỉ bật merge (COMPILER_ENABLED_FLOWS) → graph ghép nội dung LLM → { applied: true, reason: "merge" }', async () => {
    process.env.COMPILER_ENABLED_FLOWS = 'zalo_group';
    const result = await runTurn();
    expect(result.data._via || result.data.script?._via).toBe('ai_compiler');
    expect(result.data.compiler).toEqual({ applied: true, reason: 'merge' });
  });

  it('luồng CHƯA bật cờ nào → giữ script LLM, { applied: false, reason: "flow_disabled" }', async () => {
    const result = await runTurn();
    expect(String(result.data._via || result.data.script?._via || '')).not.toMatch(/ai_compiler/);
    expect(result.data.compiler).toEqual({ applied: false, reason: 'flow_disabled' });
  });

  it('chỉ bật Slot Filling mà Google trả slot hỏng → giữ script LLM, { applied: false, reason: "slot_filling_failed" }', async () => {
    process.env.COMPILER_SLOT_FILLING_FLOWS = 'zalo_group';
    generateGeminiContent.mockResolvedValue({ text: '', usage: { totalTokens: 2 }, modelUsed: 'gemini-2.5-flash' });
    const result = await runTurn();
    expect(String(result.data._via || result.data.script?._via || '')).not.toMatch(/ai_compiler/);
    expect(result.data.compiler).toEqual({ applied: false, reason: 'slot_filling_failed' });
  });

  it('mọi nhánh quyết định đều gán data.compiler (ghim mã nguồn — nhánh intent_incomplete và 2 lý do của khối catch không dựng được bằng lịch sử chat: cổng wizard hỏi đủ trường trước khi tới đây)', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../aiCampaign.service.js', import.meta.url), 'utf8');
    for (const reason of ['intent_incomplete', 'flow_disabled', 'audience_filters', 'slot_filling', 'slot_filling_failed', 'merge', 'merge_failed']) {
      expect(source).toContain(`compilerDecision = { applied: ${reason === 'slot_filling' || reason === 'merge' ? 'true' : 'false'}, reason: '${reason}' }`);
    }
    // Hai lý do còn lại (empty_content / merge_error) đến từ khối catch: biến `reason` được gán cho compilerDecision.
    expect(source).toContain('compilerDecision = { applied: false, reason };');
  });

  it('lượt KHÔNG phải xác nhận chiến dịch (câu chữ thường) → không có data.compiler', async () => {
    mockBrainReturns({ type: 'text', content: 'Chào bạn', data: null, missing_fields: [] });
    const result = await runTurn([{ role: 'user', content: 'Xin chào' }]);
    expect(result.data?.compiler).toBeUndefined();
  });
});

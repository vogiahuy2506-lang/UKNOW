/**
 * Rà soát C P2-7 (04/10/2026) — nguồn "lead của landing" qua processSmartChat (marker wizard thật + lời model hình dạng thật).
 *
 * Lỗi gốc: chọn nguồn "Đăng ký từ Landing Page" mà model dựng node khách DB → FE vá thành `read_landing_leads` với
 * `landingLeadsSlugs: []` = MỌI lead của MỌI landing → tin gửi nhầm người, không thu hồi được.
 *
 * Nay: (1) cổng `landingLeads` chặn TRƯỚC khi gọi model; (2) đã chọn → server ghi đúng lựa chọn lên node; (3) lưới cuối: model tự dựng
 * node lead landing slug rỗng mà người dùng chưa chọn → KHÔNG xác nhận, hỏi lại thẻ chọn landing.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createBrainGeminiAdapter } from './fixtures/brainGeminiAdapter.js';

const axiosPost = jest.fn();
const extractGeminiUsage = jest.fn();
const reserve = jest.fn();
const record = jest.fn();
const getActiveEmailSenders = jest.fn();
const getLandingPickerOptions = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { post: axiosPost } }));
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage,
  generateGeminiContent: createBrainGeminiAdapter({ axiosPost, extractGeminiUsage }),
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
jest.unstable_mockModule('../../landingTemplate/landingTemplate.service.js', () => ({
  default: { generateLandingPage: jest.fn() },
}));
jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({ default: { readTempFileBuffer: jest.fn() } }));
jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({ extractTextFromBuffer: jest.fn() }));
jest.unstable_mockModule('../../../utils/googleUrlFetch.util.js', () => ({
  attachGoogleUrlParts: jest.fn(async () => ({ parts: [], warnings: [] })),
}));
jest.unstable_mockModule('../aiPromptResources.service.js', () => ({
  default: {
    getZaloAccountsFull: jest.fn(async () => []),
    getActiveEmailSenders,
    getEmailTemplates: jest.fn(async () => []),
    getZaloAccounts: jest.fn(async () => []),
    getZaloGroups: jest.fn(async () => []),
    getZaloTemplates: jest.fn(async () => []),
    getRecommendedCampaignType: jest.fn(async () => 'email'),
    getCustomerStats: jest.fn(async () => ({ total: 10, hasEmail: 10, hasZalo: 0 })),
    getCourses: jest.fn(async () => []),
    getLandingPages: jest.fn(async () => []),
    getLandingPickerOptions,
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

/** Hình dạng THẬT của `aiPromptResources.getLandingPickerOptions` (repo trả cột snake_case, service map sang camelCase). */
const PICKER = {
  totalLeads: 200,
  landings: [
    { slug: 'khoa-ielts', title: 'Khoá IELTS', isPublished: true, formId: null, leadCount: 120, formConsentedCount: 0 },
    { slug: 'khoa-toeic', title: 'Khoá TOEIC', isPublished: true, formId: null, leadCount: 80, formConsentedCount: 0 },
  ],
};

const sendEmailNode = {
  tempId: 'n_send',
  nodeType: 'action',
  nodeSubtype: 'send_email',
  config: {
    recipientSource: 'node',
    recipientNodeId: 'n_audience',
    recipientField: 'email',
    emailSteps: [{ emailSubject: 'Mời bạn', emailBody: '<p>Xin chào {{full_name}}</p>', delayValue: 0 }],
  },
};
const modelConfirm = (audienceNode) => ({
  type: 'confirm_create',
  content: 'Mình đã soạn xong chiến dịch.',
  data: {
    campaignName: 'Email người đăng ký',
    campaignType: 'email',
    autoRun: false,
    nodes: [audienceNode, sendEmailNode],
    connections: [{ sourceNodeId: 'n_audience', targetNodeId: 'n_send', connectionType: 'default', connectionLabel: '' }],
  },
  missing_fields: [],
});
const dbAudience = () => ({ tempId: 'n_audience', nodeType: 'data', nodeSubtype: 'interested_customers', config: { interestedCustomerType: 'both', interestedLimit: 1000 } });
const landingAudience = (slugs) => ({ tempId: 'n_audience', nodeType: 'data', nodeSubtype: 'read_landing_leads', config: { landingLeadsSlugs: slugs } });

const user = (content) => ({ role: 'user', content });
const BASE = [
  user('Tạo chiến dịch email gửi cho người đăng ký landing'),
  user('[wizard]{"gate":"channel","channel":"email"}\nEmail'),
  user('[wizard]{"gate":"senderAccount","channel":"email","accountId":1}\nEmail 1'),
];
const TAIL = [
  user('[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Mời học thử"}\nChủ đề'),
  user('[wizard]{"gate":"schedule","value":"once","mode":"once"}\nGửi 1 lần'),
];
const historyWith = (...middle) => [...BASE, ...middle, ...TAIL];

const runTurn = async ({ history, modelReply, locale = 'vi' }) => {
  if (modelReply) {
    axiosPost.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: JSON.stringify(modelReply) }] } }] },
    });
  }
  return aiCampaignService.processSmartChat({ userId: 7, history, locale });
};

describe('C P2-7 — nguồn landing qua processSmartChat', () => {
  const prevFlows = process.env.COMPILER_ENABLED_FLOWS;

  beforeEach(() => {
    process.env.COMPILER_ENABLED_FLOWS = '';
    [axiosPost, extractGeminiUsage, reserve, record, getActiveEmailSenders, getLandingPickerOptions].forEach((fn) => fn.mockReset());
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 1, outputTokens: 1, totalTokens: 2 });
    getActiveEmailSenders.mockResolvedValue([{ id: 1, name: 'Email 1', email: 'shop@example.vn', status: 'active', isActive: true }]);
    getLandingPickerOptions.mockResolvedValue(PICKER);
    if (prevFlows === undefined) delete process.env.COMPILER_ENABLED_FLOWS;
  });

  it('chọn nguồn landing mà CHƯA chọn trang → thẻ landing_picker TRƯỚC khi gọi model (không tốn lượt Gemini)', async () => {
    const result = await aiCampaignService.processSmartChat({
      userId: 7,
      history: [...BASE, user('[wizard]{"gate":"dataSource","value":"landing"}\nLanding')],
      locale: 'vi',
    });

    expect(result.type).toBe('landing_picker');
    expect(result.wizardShortCircuit).toBe(true);
    expect(result._wizard.gateAsked).toBe('landingLeads');
    expect(result.data.landings.map((l) => l.slug)).toEqual(['khoa-ielts', 'khoa-toeic']);
    expect(result.data.totalLeads).toBe(200);
    expect(getLandingPickerOptions).toHaveBeenCalledWith(7);
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('tra danh sách landing lỗi (null) → chặn bằng câu thử lại, KHÔNG đi tiếp với danh sách rỗng', async () => {
    getLandingPickerOptions.mockResolvedValue(null);
    const result = await aiCampaignService.processSmartChat({
      userId: 7,
      history: [...BASE, user('[wizard]{"gate":"dataSource","value":"landing"}\nLanding')],
      locale: 'vi',
    });

    expect(result.type).toBe('text');
    expect(result.content).toMatch(/chưa tải được/);
    expect(result._wizard.gateAsked).toBe('landingLeads');
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('ca đúng của rà soát: chọn landing rồi model dựng node KHÁCH DB → node thành lead landing với slug ĐÃ CHỌN, KHÔNG ra slug rỗng', async () => {
    const result = await runTurn({
      history: historyWith(
        user('[wizard]{"gate":"dataSource","value":"landing"}\nLanding'),
        user('[wizard]{"gate":"landingLeads","slugs":["khoa-ielts"]}\nKhoá IELTS'),
      ),
      modelReply: modelConfirm(dbAudience()),
    });

    expect(result.type).toBe('confirm_create');
    const audience = result.data.nodes.find((n) => n.tempId === 'n_audience');
    expect(audience.nodeSubtype).toBe('read_landing_leads');
    expect(audience.config.landingLeadsSlugs).toEqual(['khoa-ielts']);
    // Chọn trang rồi thì không cần tải lại danh sách landing cho cổng.
    expect(getLandingPickerOptions).not.toHaveBeenCalled();
  });

  it('model tự điền slug khác (bịa) → bị ĐÈ bằng slug người dùng đã chọn', async () => {
    const result = await runTurn({
      history: historyWith(
        user('[wizard]{"gate":"dataSource","value":"landing"}\nLanding'),
        user('[wizard]{"gate":"landingLeads","slugs":["khoa-ielts","khoa-toeic"]}\n2 trang'),
      ),
      modelReply: modelConfirm(landingAudience(['trang-bia-cua-model'])),
    });

    expect(result.type).toBe('confirm_create');
    expect(result.data.nodes.find((n) => n.tempId === 'n_audience').config.landingLeadsSlugs).toEqual(['khoa-ielts', 'khoa-toeic']);
  });

  it('"Tất cả landing" tường minh → slug rỗng ĐƯỢC PHÉP, script mang dấu landingLeadsAll để thẻ xác nhận chấp nhận', async () => {
    const result = await runTurn({
      history: historyWith(
        user('[wizard]{"gate":"dataSource","value":"landing"}\nLanding'),
        user('[wizard]{"gate":"landingLeads","all":true}\nTất cả'),
      ),
      modelReply: modelConfirm(landingAudience([])),
    });

    expect(result.type).toBe('confirm_create');
    expect(result.data.nodes.find((n) => n.tempId === 'n_audience').config.landingLeadsSlugs).toEqual([]);
    expect(result.data.landingLeadsAll).toBe(true);
  });

  describe('lưới cuối — model tự dựng node lead landing slug RỖNG mà người dùng chưa chọn', () => {
    const dbSourceHistory = historyWith(user('[wizard]{"gate":"dataSource","value":"db"}\nKhách DB'));

    it('→ KHÔNG xác nhận: thay confirm_create bằng thẻ chọn landing, gateAsked=landingLeads', async () => {
      const result = await runTurn({ history: dbSourceHistory, modelReply: modelConfirm(landingAudience([])) });

      expect(result.type).toBe('landing_picker');
      expect(result._wizard.gateAsked).toBe('landingLeads');
      expect(result.data.landings).toHaveLength(2);
      expect(result.data.nodes).toBeUndefined();
      expect(getLandingPickerOptions).toHaveBeenCalledWith(7);
    });

    it('thiếu hẳn trường landingLeadsSlugs cũng bị chặn', async () => {
      const result = await runTurn({
        history: dbSourceHistory,
        modelReply: modelConfirm({ tempId: 'n_audience', nodeType: 'data', nodeSubtype: 'read_landing_leads', config: {} }),
      });
      expect(result.type).toBe('landing_picker');
    });

    it('tra danh sách lỗi ở lưới → câu thử lại, vẫn KHÔNG xác nhận', async () => {
      getLandingPickerOptions.mockResolvedValue(null);
      const result = await runTurn({ history: dbSourceHistory, modelReply: modelConfirm(landingAudience([])) });

      expect(result.type).toBe('text');
      expect(result.content).toMatch(/chưa tải được/);
    });

    it('node có slug CỤ THỂ (không phải "mọi lead") thì đi qua bình thường', async () => {
      const result = await runTurn({ history: dbSourceHistory, modelReply: modelConfirm(landingAudience(['khoa-ielts'])) });

      expect(result.type).toBe('confirm_create');
      expect(result.data.nodes.find((n) => n.tempId === 'n_audience').config.landingLeadsSlugs).toEqual(['khoa-ielts']);
    });

    it('chiến dịch nguồn khách DB bình thường không bị lưới đụng tới', async () => {
      const result = await runTurn({ history: dbSourceHistory, modelReply: modelConfirm(dbAudience()) });

      expect(result.type).toBe('confirm_create');
      expect(result.data.nodes.find((n) => n.tempId === 'n_audience').nodeSubtype).toBe('interested_customers');
      expect(getLandingPickerOptions).not.toHaveBeenCalled();
    });
  });
});

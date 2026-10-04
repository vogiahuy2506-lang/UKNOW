/**
 * H2 (rà soát C P1-6) mục 3 — model KHÔNG tự đọc/đếm người nhận từ dữ liệu bảng; hệ thống cung cấp tên cột + số người nhận.
 *
 *  - Khi Sheet người nhận đã chốt: prompt mang dòng `sheetRecipients` (số email/SĐT hợp lệ + tên cột) do `checkSheetForChannel`
 *    đọc tất định — KHÔNG mang dòng dữ liệu nào của khách.
 *  - Prompt hệ thống không còn dặn "AI CÓ THỂ đọc được các cột và dữ liệu / báo số lượng người nhận hợp lệ" như thể dữ liệu luôn
 *    nằm trong tin; thay bằng luật: nội dung chỉ có ở tin hiện tại, từ lượt sau chỉ lấy số từ `sheetRecipients`.
 *
 * Ranh giới giả: như `aiCampaignRecipientPii.spec.js` (axios.get trả CSV gviz, Gemini qua generateGeminiContent).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createBrainGeminiAdapter } from './fixtures/brainGeminiAdapter.js';

const axiosPost = jest.fn();
const axiosGet = jest.fn();
const extractGeminiUsage = jest.fn();
const generateGeminiContent = jest.fn();
const reserve = jest.fn();
const record = jest.fn();
const readTempFileBuffer = jest.fn();
const extractTextFromBuffer = jest.fn();

jest.unstable_mockModule('axios', () => ({ default: { post: axiosPost, get: axiosGet } }));
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
jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: { readTempFileBuffer, readFileBufferByKey: jest.fn() },
}));
jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({ extractTextFromBuffer }));
// googleUrlFetch.util.js KHÔNG mock: mã thật, ranh giới là axios.get ở trên.
jest.unstable_mockModule('../aiPromptResources.service.js', () => ({
  default: {
    getZaloAccountsFull: jest.fn(async () => []),
    getActiveEmailSenders: jest.fn(async () => [{ id: 1, name: 'Email 1', email: 'shop@example.vn', status: 'active', isActive: true }]),
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

const SHEET_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`;
const DATA_ROWS = 300;

/** CSV đúng như gviz trả: mọi ô nằm trong ngoặc kép. */
const gvizCsv = () => [
  '"Họ tên","Số điện thoại","Email"',
  ...Array.from({ length: DATA_ROWS }, (_, i) => {
    const n = String(i + 1).padStart(4, '0');
    return `"Khách ${n}","09000${n}","khach${n}@example.test"`;
  }),
].join('\n');

/** Mọi lời gọi Gemini của não chính (thân request thật: systemInstruction + contents). */
const geminiRequests = () => axiosPost.mock.calls.map(([, body]) => body);
const lastRequest = () => geminiRequests().at(-1);
const sheetRowsIn = (body) => (JSON.stringify(body).match(/khach\d{4}@example\.test/g) || []).length;
const systemText = (body) => body.systemInstruction.parts.map((p) => p.text).join('\n');

const marker = (payload, readable) => ({ role: 'user', content: `[wizard]${JSON.stringify(payload)}\n${readable}` });
/** Lịch sử FE gửi khi đã chọn xong: kênh → tài khoản → NGUỒN (Sheet) → brief → lịch một lần. */
const SHEET_FLOW_HISTORY = [
  { role: 'user', content: `Tạo chiến dịch email gửi cho danh sách này ${SHEET_URL}` },
  marker({ gate: 'channel', channel: 'email' }, 'Email'),
  marker({ gate: 'senderAccount', channel: 'email', accountId: 1 }, 'Email 1'),
  marker({ gate: 'dataSource', value: 'sheet', sheetUrl: SHEET_URL }, `Google Sheet: ${SHEET_URL}`),
  marker({ gate: 'campaignBrief', contentMode: 'custom_topic', topicText: 'Mời học khoá nâng cao' }, 'Chủ đề'),
  marker({ gate: 'schedule', value: 'once', mode: 'once' }, 'Gửi 1 lần'),
];

describe('H2 (C P1-6) mục 3 — prompt và thông tin người nhận do hệ thống cung cấp', () => {
  beforeEach(() => {
    [axiosPost, axiosGet, extractGeminiUsage, generateGeminiContent, reserve, record, readTempFileBuffer, extractTextFromBuffer]
      .forEach((fn) => fn.mockReset());
    reserve.mockResolvedValue({ maxOutputTokens: 1024 });
    extractGeminiUsage.mockReturnValue({ promptTokens: 1, outputTokens: 1, totalTokens: 2 });
    axiosPost.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: JSON.stringify({ type: 'text', content: 'ok', missing_fields: [], data: null }) }] } }] },
    });
    axiosGet.mockImplementation(async (url) => (String(url).includes(`/d/${SHEET_ID}/gviz/`)
      ? { status: 200, data: gvizCsv(), headers: { 'content-type': 'text/csv; charset=utf-8' } }
      : { status: 403, data: '', headers: {} }));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('đã chọn Sheet: model nhận sheetRecipients (số người nhận + tên cột) do hệ thống đọc, KHÔNG có dòng dữ liệu nào', async () => {
    await aiCampaignService.processSmartChat({ userId: 7, history: SHEET_FLOW_HISTORY, locale: 'vi' });

    expect(axiosPost).toHaveBeenCalledTimes(1);
    const system = systemText(lastRequest());
    expect(system).toContain('sheetRecipients');
    expect(system).toContain(`${DATA_ROWS} email hợp lệ`);
    expect(system).toContain('"Họ tên"');
    expect(system).toContain(SHEET_URL);
    expect(sheetRowsIn(lastRequest())).toBe(0);
  });

  describe('prompt hệ thống', () => {
    it('không còn dặn model "đọc cột / đếm người nhận từ dữ liệu file" như thể dữ liệu luôn nằm trong tin; có luật chỉ lấy số từ sheetRecipients', async () => {
      await aiCampaignService.processSmartChat({
        userId: 7,
        history: [{ role: 'user', content: 'Xin chào trợ lý' }],
        locale: 'vi',
      });

      const system = systemText(lastRequest());
      expect(system).not.toContain('AI CÓ THỂ đọc được các cột và dữ liệu');
      expect(system).not.toContain('Báo rõ cho người dùng: cột nào được chọn làm người nhận và số lượng người nhận hợp lệ');
      expect(system).toContain('CHỈ lấy từ dòng "sheetRecipients"');
      expect(system).toContain('KHÔNG tự đếm');
      expect(system).toContain('Từ các lượt SAU hệ thống KHÔNG gửi lại nội dung tệp hay liên kết Google cũ');
    });
  });
});

/**
 * C P1-6 (d) — nối dây ở `processSmartChat`: khi wizard đang ở nguồn người nhận = Excel/Google Sheet, link Sheet / tệp danh sách
 * ở lượt HIỆN TẠI chỉ đi sang Gemini dưới dạng bản tóm tắt (cờ `summarizeRecipientLists` của `runChat`).
 *
 * `aiChatTransport.recipientSummary.spec.js` khoá hành vi của `runChat`; spec này khoá điều kiện bật cờ ở não chiến dịch.
 * Ranh giới giả: như `aiCampaignRecipientPii.spec.js` (axios.get trả CSV gviz; Gemini qua `generateGeminiContent`).
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
    return `"Khách ${n}","090000${n}","khach${n}@example.test"`;
  }),
].join('\n');
const fileCsv = () => [
  'Họ tên,SĐT,Email',
  ...Array.from({ length: DATA_ROWS }, (_, i) => {
    const n = String(i + 1).padStart(4, '0');
    return `Người ${n},091100${n},nguoi${n}@example.test`;
  }),
].join('\n');

const lastRequest = () => axiosPost.mock.calls.at(-1)[1];
const sheetRowsIn = (body) => (JSON.stringify(body).match(/khach\d{4}@example\.test/g) || []).length;
const fileRowsIn = (body) => (JSON.stringify(body).match(/nguoi\d{4}@example\.test/g) || []).length;
const systemText = (body) => body.systemInstruction.parts.map((p) => p.text).join('\n');
const lastUserText = (body) => body.contents[body.contents.length - 1].parts.map((p) => p.text || '').join('\n');

const marker = (payload, readable) => ({ role: 'user', content: `[wizard]${JSON.stringify(payload)}\n${readable}` });
/** Lịch sử FE gửi: đã chọn xong kênh → tài khoản → NGUỒN → brief → lịch một lần; nguồn chưa mang link (người dùng dán ở tin kế tiếp). */
const flowHistory = (dataSource) => [
  { role: 'user', content: 'Tạo chiến dịch email gửi cho danh sách khách của mình' },
  marker({ gate: 'channel', channel: 'email' }, 'Email'),
  marker({ gate: 'senderAccount', channel: 'email', accountId: 1 }, 'Email 1'),
  marker({ gate: 'dataSource', value: dataSource }, 'Nguồn người nhận'),
  marker({ gate: 'campaignBrief', contentMode: 'custom_topic', topicText: 'Mời học khoá nâng cao' }, 'Chủ đề'),
  marker({ gate: 'schedule', value: 'once', mode: 'once' }, 'Gửi 1 lần'),
];

describe('C P1-6 (d) — processSmartChat bật tóm tắt danh sách người nhận đúng lúc', () => {
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

  it('nguồn = Google Sheet, link dán LẦN ĐẦU ở tin hiện tại: 0 dòng khách trong lời gọi Gemini; model nhận số đếm + tên cột + dòng mẫu đã che', async () => {
    const history = [...flowHistory('sheet'), { role: 'user', content: `Đây là danh sách của mình: ${SHEET_URL}` }];

    await aiCampaignService.processSmartChat({ userId: 7, history, locale: 'vi' });

    expect(axiosPost).toHaveBeenCalledTimes(1);
    expect(sheetRowsIn(lastRequest())).toBe(0);
    const last = lastUserText(lastRequest());
    expect(last).toContain(`${DATA_ROWS} email hợp lệ`);
    expect(last).toContain('"Họ tên", "Số điện thoại", "Email"');
    expect(last).toContain('email "k***@example.test"');
    expect(last).not.toContain('[Nội dung Google Sheet');
    // Hệ thống vẫn nói cùng một con số ở khối WIZARD ĐÃ CHỐT (checkSheetForChannel) — hai nguồn tất định khớp nhau.
    expect(systemText(lastRequest())).toContain(`${DATA_ROWS} email hợp lệ`);
  });

  it('nguồn = Excel/Google Sheet, tệp CSV danh sách đính ở tin hiện tại: 0 dòng tệp trong lời gọi Gemini; có bản tóm tắt đã che', async () => {
    readTempFileBuffer.mockResolvedValue(Buffer.from(fileCsv(), 'utf-8'));
    extractTextFromBuffer.mockImplementation(async () => fileCsv());
    const history = [...flowHistory('sheet'), { role: 'user', content: 'Đây là tệp danh sách của mình' }];

    await aiCampaignService.processSmartChat({
      userId: 7,
      history,
      files: [{ tempId: 't-khach', originalName: 'khach_hang.csv', contentType: 'text/csv' }],
      locale: 'vi',
    });

    expect(axiosPost).toHaveBeenCalledTimes(1);
    expect(fileRowsIn(lastRequest())).toBe(0);
    const last = lastUserText(lastRequest());
    expect(last).toContain('tệp "khach_hang.csv"');
    expect(last).toContain(`${DATA_ROWS} email hợp lệ`);
    expect(last).toContain('email "n***@example.test"');
  });

  it('ranh giới đã chọn: nguồn KHÁC Sheet (ở đây DB) mà người dùng dán link Sheet → coi là tài liệu tham khảo, đính nguyên văn như cũ', async () => {
    const history = [...flowHistory('db'), { role: 'user', content: `Tham khảo bảng giá này giúp mình ${SHEET_URL}` }];

    await aiCampaignService.processSmartChat({ userId: 7, history, locale: 'vi' });

    expect(axiosPost).toHaveBeenCalledTimes(1);
    expect(sheetRowsIn(lastRequest())).toBe(DATA_ROWS);
    expect(lastUserText(lastRequest())).toContain('[Nội dung Google Sheet');
  });

  it('prompt hệ thống nói đúng thực tế mới: ở tin hiện tại model chỉ nhận khối tóm tắt, không còn hứa "nội dung nằm trong tin"', async () => {
    await aiCampaignService.processSmartChat({ userId: 7, history: [{ role: 'user', content: 'Xin chào trợ lý' }], locale: 'vi' });

    const system = systemText(lastRequest());
    expect(system).toContain('hệ thống KHÔNG gắn nội dung bảng mà chỉ gắn khối tóm tắt');
    expect(system).toContain('vài dòng ĐÃ CHE');
    expect(system).not.toContain('Chỉ ở lượt nội dung đang nằm ngay trong tin');
    expect(system).not.toContain('chỉ nêu SỐ THỨ TỰ dòng, không nhắc lại nội dung dòng');
  });
});

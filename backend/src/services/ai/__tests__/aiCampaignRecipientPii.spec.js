/**
 * H2 (rà soát C P1-6) — nối dây ở `processSmartChat`: danh sách người nhận (Google Sheet) không đi lại sang Gemini.
 *
 * `aiChatTransport.recipientPii.spec.js` khoá hành vi của `runChat`. Spec này khoá phần NỐI DÂY của não chiến dịch:
 *  - URL Sheet đã chốt làm nguồn người nhận (marker `[wizard]` trong lịch sử, HOẶC state đã lưu sau khi tải lại trang — lúc đó
 *    marker biến mất khỏi lịch sử, chỉ còn `persistedState.gates.sheetUrl`) không được tải vào prompt dù nằm trong tin thường;
 *  - link dán LẦN ĐẦU ở tin hiện tại vẫn được tải để AI đọc cột lần đầu;
 *  - brief `attached_file` + ảnh: ảnh ở tin cũ vẫn đính lại (bytes là nguồn nội dung duy nhất); brief khác thì không;
 *
 * Ranh giới giả: `axios.get` trả CSV như gviz (cả `googleUrlFetch.util` lẫn `recipientExtractor` đều đi qua nó, mã thật);
 * Gemini qua `generateGeminiContent` của `utils/geminiClient.util.js` (fixture `brainGeminiAdapter`: thân request THẬT mà
 * `runChat` dựng — systemInstruction + contents).
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
const { createEmptyWizardState } = await import('../aiCampaignWizard.service.js');

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
const contentTexts = (body) => body.contents.flatMap((c) => c.parts.map((p) => p.text || ''));
const firstMessageText = (body) => body.contents[0].parts.map((p) => p.text || '').join('\n');

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

describe('H2 (C P1-6) — processSmartChat không gửi lại danh sách người nhận cho Gemini', () => {
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

  describe('Sheet người nhận đã chốt', () => {
    it('đã chọn Sheet (marker): 0 dòng Sheet trong lời gọi Gemini, marker vẫn nguyên văn trong lịch sử', async () => {
      const result = await aiCampaignService.processSmartChat({ userId: 7, history: SHEET_FLOW_HISTORY, locale: 'vi' });

      expect(axiosPost).toHaveBeenCalledTimes(1);
      expect(result._wizard.gates.sheetCheck).toMatchObject({ status: 'ok', emailCount: DATA_ROWS });
      expect(sheetRowsIn(lastRequest())).toBe(0);
      // Marker vẫn nguyên văn trong lịch sử (URL cho node read_sheet).
      expect(contentTexts(lastRequest()).join('\n')).toContain(`"sheetUrl":"${SHEET_URL}"`);
    });

    it('người dùng dán LẠI link đã chốt trong tin thường ở lượt hiện tại → vẫn 0 dòng Sheet (loại theo marker trong lịch sử)', async () => {
      const history = [
        ...SHEET_FLOW_HISTORY,
        { role: 'user', content: `Nhắc lại bảng ở đây ${SHEET_URL}, viết email ngắn gọn thôi` },
      ];

      await aiCampaignService.processSmartChat({ userId: 7, history, locale: 'vi' });

      expect(axiosPost).toHaveBeenCalledTimes(1);
      expect(sheetRowsIn(lastRequest())).toBe(0);
      expect(contentTexts(lastRequest()).join('\n')).toContain('KHÔNG gửi cho AI');
    });

    it('TẢI LẠI TRANG (marker biến mất, chỉ còn state đã lưu): link dán lại vẫn không được tải — loại theo persistedState.gates.sheetUrl', async () => {
      const persisted = createEmptyWizardState();
      persisted.gates = {
        ...persisted.gates,
        isCampaignFlow: true,
        channel: 'email',
        senderAccountId: 1,
        dataSource: 'sheet',
        sheetUrl: SHEET_URL,
        schedule: { mode: 'once' },
      };
      persisted.brief = { ...persisted.brief, contentMode: 'custom_topic', productMode: null, topicText: 'Mời học khoá nâng cao', contentLocale: 'vi' };
      const history = [{ role: 'user', content: `Viết email ngắn gọn cho bảng này ${SHEET_URL}` }];

      await aiCampaignService.processSmartChat({ userId: 7, history, locale: 'vi', persistedWizardState: persisted });

      expect(axiosPost).toHaveBeenCalledTimes(1);
      expect(sheetRowsIn(lastRequest())).toBe(0);
      expect(contentTexts(lastRequest()).join('\n')).toContain('KHÔNG gửi cho AI');
    });

    it('ĐỐI CHỨNG: link dán LẦN ĐẦU ở tin hiện tại (chưa chốt, không phải chiến dịch) vẫn được tải để AI đọc cột lần đầu', async () => {
      const history = [{ role: 'user', content: `Phân tích giúp mình bảng này ${SHEET_URL}` }];

      await aiCampaignService.processSmartChat({ userId: 7, history, locale: 'vi' });

      expect(axiosPost).toHaveBeenCalledTimes(1);
      expect(sheetRowsIn(lastRequest())).toBe(DATA_ROWS);
    });

    it('lượt sau khi dán lần đầu (tin cũ có link, tin hiện tại không): 0 dòng, chỉ còn dòng báo', async () => {
      const history = [
        { role: 'user', content: `Phân tích giúp mình bảng này ${SHEET_URL}` },
        { role: 'assistant', content: 'Bảng có 3 cột: Họ tên, Số điện thoại, Email.' },
        { role: 'user', content: 'Cột nào là email?' },
      ];

      await aiCampaignService.processSmartChat({ userId: 7, history, locale: 'vi' });

      expect(sheetRowsIn(lastRequest())).toBe(0);
      expect(firstMessageText(lastRequest())).toContain('KHÔNG gửi lại');
    });
  });

  describe('brief attached_file + ảnh (ảnh chỉ có bytes, không có chữ để lưu)', () => {
    const imageHistory = () => [
      { role: 'user', content: 'Dùng ảnh này làm nội dung', files: [{ tempId: 't-anh', originalName: 'poster.png', contentType: 'image/png' }] },
      { role: 'assistant', content: 'Đã nhận ảnh.' },
      { role: 'user', content: 'Viết email giúp mình' },
    ];
    const stateWithBrief = (briefPatch) => {
      const persisted = createEmptyWizardState();
      persisted.brief = { ...persisted.brief, contentLocale: 'vi', ...briefPatch };
      return persisted;
    };

    it('brief attached_file mà tệp là ảnh → ảnh ở tin CŨ vẫn được đính lại cho model', async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from('PNGDATA'));
      const persisted = stateWithBrief({
        contentMode: 'attached_file',
        productMode: 'attached_file',
        hasAttachedFile: true,
        attachedFile: { originalName: 'poster.png', contentType: 'image/png', text: '', isImage: true, hasProductData: null, userConfirmed: false },
      });

      await aiCampaignService.processSmartChat({ userId: 7, history: imageHistory(), locale: 'vi', persistedWizardState: persisted });

      expect(axiosPost).toHaveBeenCalledTimes(1);
      const firstParts = lastRequest().contents[0].parts;
      expect(firstParts.some((p) => p.inlineData?.mimeType === 'image/png')).toBe(true);
    });

    it('ĐỐI CHỨNG: brief khác (custom_topic) → ảnh ở tin cũ KHÔNG đính lại, chỉ còn dòng báo', async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from('PNGDATA'));
      const persisted = stateWithBrief({ contentMode: 'custom_topic', topicText: 'Mời học khoá nâng cao' });

      await aiCampaignService.processSmartChat({ userId: 7, history: imageHistory(), locale: 'vi', persistedWizardState: persisted });

      const parts = lastRequest().contents.flatMap((c) => c.parts);
      expect(parts.some((p) => p.inlineData)).toBe(false);
      expect(readTempFileBuffer).not.toHaveBeenCalled();
      expect(firstMessageText(lastRequest())).toContain('poster.png');
    });
  });

  describe('tệp bảng tính đính kèm không được lưu chữ vào wizard_state', () => {
    const listCsv = Buffer.from(['Họ tên,Số điện thoại,Email', ...Array.from({ length: 5 }, (_, i) => `Khách ${i},09000000${i},khach${i}@example.test`)].join('\n'));
    const priceCsv = Buffer.from('Gói,Giá\nCơ bản,199000\nNâng cao,499000');
    const run = async (name, buffer, text) => {
      readTempFileBuffer.mockResolvedValue(buffer);
      extractTextFromBuffer.mockResolvedValue(text);
      return aiCampaignService.processSmartChat({
        userId: 7,
        locale: 'vi',
        history: [{ role: 'user', content: 'Tạo chiến dịch email từ tệp này' }],
        files: [{ tempId: 't-1', originalName: name, contentType: 'text/csv' }],
      });
    };

    it('tệp DANH SÁCH người nhận: không có attachedFile.text trong state trả về, không đi qua extractTextFromBuffer', async () => {
      const result = await run('khach.csv', listCsv, 'LIST_PII_TEXT khach0@example.test');
      expect(JSON.stringify(result._wizard?.brief || {})).not.toContain('khach0@example.test');
      expect(result._wizard?.brief?.attachedFile?.text).toBeFalsy();
      expect(extractTextFromBuffer).not.toHaveBeenCalled();
    });

    it('ĐỐI CHỨNG: tệp bảng giá (không có liên hệ) vẫn lưu chữ như tệp nội dung', async () => {
      const result = await run('bang_gia.csv', priceCsv, 'Gói Cơ bản 199000');
      expect(result._wizard?.brief?.attachedFile?.text).toContain('Cơ bản');
    });
  });

  describe('nhánh super admin giữ hành vi cũ (không có brief để lưu bản trích)', () => {
    it("tệp ở tin cũ vẫn đính lại cho trợ lý admin (historyAttachments='all')", async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from('xlsx'));
      extractTextFromBuffer.mockResolvedValue('Doanh thu quý 3: 1 tỷ');

      await aiCampaignService.processSmartChat({
        userId: 1,
        userRole: 'admin',
        locale: 'vi',
        history: [
          { role: 'user', content: 'Tóm tắt báo cáo', files: [{ tempId: 't-bc', originalName: 'bao_cao.xlsx', contentType: 'application/vnd.ms-excel' }] },
          { role: 'assistant', content: 'Doanh thu tăng.' },
          { role: 'user', content: 'Quý 3 thì sao?' },
        ],
      });

      expect(contentTexts(lastRequest()).join('\n')).toContain('Doanh thu quý 3: 1 tỷ');
    });
  });
});

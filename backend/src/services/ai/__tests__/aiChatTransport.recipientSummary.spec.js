/**
 * C P1-6 (d) — lượt HIỆN TẠI: tệp / link Sheet là danh sách người nhận chỉ đi sang Gemini dưới dạng bản tóm tắt.
 *
 * Đợt 3 (H2, `aiChatTransport.recipientPii.spec.js`) đã chặn tin cũ, marker và URL đã chốt; còn lại lượt dán link / đính tệp ở tin
 * hiện tại vẫn đưa tới 300 dòng Sheet hoặc cả tệp (tên/SĐT/email khách cuối) nguyên văn. Với `summarizeRecipientLists` (wizard ở
 * nguồn người nhận) thân request Gemini chỉ được mang số đếm + tên cột + vài dòng mẫu đã che; bảng KHÔNG phải danh sách người nhận
 * (bảng giá/sản phẩm) và mọi nơi gọi khác (cờ tắt) vẫn nhận nội dung nguyên văn.
 *
 * Ranh giới giả đúng hình dạng thật (như spec H2): `axios.get` trả CSV như gviz; Gemini: `global.fetch` trả `Response` thật, đo
 * thẳng thân request; bộ đọc người nhận + `googleUrlFetch.util.js` là mã THẬT.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const originalFetch = global.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;

const axiosGet = jest.fn();
jest.unstable_mockModule('axios', () => ({ default: { get: axiosGet } }));

const readTempFileBuffer = jest.fn();
const readFileBufferByKey = jest.fn();
const extractTextFromBuffer = jest.fn();
jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
  default: { readTempFileBuffer, readFileBufferByKey },
}));
jest.unstable_mockModule('../../../utils/fileParser.util.js', () => ({ extractTextFromBuffer }));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: {
    reserve: jest.fn(async () => ({ maxOutputTokens: 8192 })),
    record: jest.fn(async () => {}),
    resolveFallbackModel: jest.fn(async () => null),
  },
}));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async () => 'gemini-2.5-flash'),
}));

const { runChat } = await import('../aiChatTransport.service.js');

const SHEET_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
const PRICE_SHEET_ID = '1PriceSheetAbCdEfGhIjKlMnOpQrStUvWx9876';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`;
const PRICE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${PRICE_SHEET_ID}/edit`;
const DATA_ROWS = 300;
const CSV = 'text/csv';

/** CSV đúng như gviz trả: mọi ô nằm trong ngoặc kép. */
const gvizCustomerCsv = () => [
  '"Họ tên","Số điện thoại","Email"',
  ...Array.from({ length: DATA_ROWS }, (_, i) => {
    const n = String(i + 1).padStart(4, '0');
    return `"Khách ${n}","090000${n}","khach${n}@example.test"`;
  }),
].join('\n');
const gvizPriceCsv = () => [
  '"Sản phẩm","Giá","Ghi chú"',
  '"Khoá Python","2000000","Khai giảng 15/10"',
  '"Khoá Excel","1500000","Học online"',
  '"Khoá SQL","1800000","Có chứng chỉ"',
].join('\n');
/** Tệp CSV khách (đúng hình dạng tệp người dùng tải lên: không ngoặc kép). */
const customerFileCsv = () => [
  'Họ tên,SĐT,Email',
  ...Array.from({ length: DATA_ROWS }, (_, i) => {
    const n = String(i + 1).padStart(4, '0');
    return `Người ${n},091100${n},nguoi${n}@example.test`;
  }),
].join('\n');

const sheetRowsIn = (body) => (JSON.stringify(body).match(/khach\d{4}@example\.test/g) || []).length;
const fileRowsIn = (body) => (JSON.stringify(body).match(/nguoi\d{4}@example\.test/g) || []).length;
const fileNamesIn = (body) => (JSON.stringify(body).match(/Người \d{4}/g) || []).length;
const fileTextIn = (body) => JSON.stringify(body);

const googleOk = (text) => new Response(JSON.stringify({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
}), { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' } });
const requestBody = () => JSON.parse(global.fetch.mock.calls[0][1].body);
const lastUserParts = (body) => body.contents[body.contents.length - 1].parts.map((p) => p.text || '');

async function turn({ history, files = [], ...options }) {
  global.fetch.mockClear();
  await runChat({ systemPrompt: 'sys', history, files, userId: 101, ...options });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  return requestBody();
}

describe('C P1-6 (d) — danh sách người nhận ở lượt hiện tại chỉ đi dưới dạng bản tóm tắt', () => {
  let consoleSpies;

  beforeEach(() => {
    [axiosGet, readTempFileBuffer, readFileBufferByKey, extractTextFromBuffer].forEach((fn) => fn.mockReset());
    axiosGet.mockImplementation(async (url) => {
      const headers = { 'content-type': 'text/csv; charset=utf-8' };
      if (String(url).includes(`/d/${SHEET_ID}/gviz/`)) return { status: 200, data: gvizCustomerCsv(), headers };
      if (String(url).includes(`/d/${PRICE_SHEET_ID}/gviz/`)) return { status: 200, data: gvizPriceCsv(), headers };
      return { status: 403, data: '', headers: {} };
    });
    global.fetch = jest.fn(async () => googleOk('{"type":"text","content":"ok","missing_fields":[],"data":null}'));
    process.env.GEMINI_API_KEY = 'AIza-khoa-bi-mat-test';
    consoleSpies = ['warn', 'error', 'log'].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  });

  afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore());
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  });

  describe('link Google Sheet dán ở tin hiện tại', () => {
    const history = [{ role: 'user', content: `Gửi email cho danh sách khách này: ${SHEET_URL}` }];

    it('bật cờ: 0 dòng khách; có số email/SĐT hợp lệ, tên cột và dòng mẫu ĐÃ CHE; không còn khối "[Nội dung Google Sheet"', async () => {
      const body = await turn({ history, summarizeRecipientLists: true });

      expect(sheetRowsIn(body)).toBe(0);
      const last = lastUserParts(body).join('\n');
      expect(last).toContain(`${DATA_ROWS} email hợp lệ`);
      expect(last).toContain(`${DATA_ROWS} SĐT hợp lệ`);
      expect(last).toContain('"Họ tên", "Số điện thoại", "Email"');
      expect(last).toContain('email "k***@example.test"');
      expect(last).toContain(`Google Sheet "${SHEET_URL}"`);
      expect(last).not.toContain('[Nội dung Google Sheet');
      expect(JSON.stringify(body)).not.toMatch(/090000\d{4}/);
      // Câu người dùng gõ vẫn nguyên văn (kèm link — model cần URL cho node read_sheet).
      expect(lastUserParts(body)[0]).toBe(history[0].content);
      // Sheet chỉ tải 1 lần.
      expect(axiosGet).toHaveBeenCalledTimes(1);
    });

    it('ĐỐI CHỨNG (cờ tắt — mọi nơi gọi khác, chat thường): vẫn đính 300 dòng nguyên văn trong rào', async () => {
      const body = await turn({ history });

      expect(sheetRowsIn(body)).toBe(DATA_ROWS);
      expect(lastUserParts(body).join('\n')).toContain('[Nội dung Google Sheet');
    });

    it('bật cờ nhưng bảng là BẢNG GIÁ (không có email/SĐT): vẫn đính nguyên văn để AI đọc được sản phẩm', async () => {
      const body = await turn({
        history: [{ role: 'user', content: `Xem bảng giá này ${PRICE_SHEET_URL}` }],
        summarizeRecipientLists: true,
      });

      const last = lastUserParts(body).join('\n');
      expect(last).toContain('Khoá Python | 2000000 | Khai giảng 15/10');
      expect(last).toContain('[Nội dung Google Sheet');
      expect(last).not.toContain('Danh sách người nhận');
    });

    it('tin cũ vẫn không đính lại khi bật cờ (H2 giữ nguyên): tin cũ chỉ còn dòng báo, tin hiện tại không có link thì không gắn gì', async () => {
      const body = await turn({
        history: [
          { role: 'user', content: `Danh sách khách ở đây ${SHEET_URL}` },
          { role: 'assistant', content: 'Đã nhận danh sách.' },
          { role: 'user', content: 'Viết email ngắn gọn thôi' },
        ],
        summarizeRecipientLists: true,
      });

      expect(sheetRowsIn(body)).toBe(0);
      expect(JSON.stringify(body)).not.toContain('email hợp lệ');
      expect(axiosGet).not.toHaveBeenCalled();
    });
  });

  describe('tệp Excel/CSV đính ở tin hiện tại', () => {
    const CSV_FILE = { tempId: 't-khach', originalName: 'khach_hang.csv', contentType: CSV };

    it('bật cờ: 0 dòng tệp (email/SĐT/tên), có tóm tắt đã che; không đọc tệp bằng bộ trích văn bản', async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from(customerFileCsv(), 'utf-8'));
      extractTextFromBuffer.mockImplementation(async () => customerFileCsv());

      const body = await turn({
        history: [{ role: 'user', content: 'Đây là danh sách khách cần gửi', files: [CSV_FILE] }],
        summarizeRecipientLists: true,
      });

      expect(fileRowsIn(body)).toBe(0);
      expect(fileNamesIn(body)).toBe(0);
      expect(JSON.stringify(body)).not.toMatch(/091100\d{4}/);
      const last = lastUserParts(body).join('\n');
      expect(last).toContain('tệp "khach_hang.csv"');
      expect(last).toContain(`${DATA_ROWS} email hợp lệ`);
      expect(last).toContain('"Họ tên", "SĐT", "Email"');
      expect(last).toContain('email "n***@example.test"');
      expect(last).not.toContain('[Nội dung tệp đính kèm');
      expect(extractTextFromBuffer).not.toHaveBeenCalled();
    });

    it('tệp ở `files` của request (không nằm trong history, FE gửi kèm lượt hiện tại) cũng chỉ còn bản tóm tắt', async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from(customerFileCsv(), 'utf-8'));

      const body = await turn({
        history: [{ role: 'user', content: 'Đây là danh sách khách cần gửi' }],
        files: [CSV_FILE],
        summarizeRecipientLists: true,
      });

      expect(fileRowsIn(body)).toBe(0);
      expect(lastUserParts(body).join('\n')).toContain(`${DATA_ROWS} email hợp lệ`);
    });

    it('ĐỐI CHỨNG (cờ tắt): tệp vẫn đính nguyên văn trong rào', async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from(customerFileCsv(), 'utf-8'));
      extractTextFromBuffer.mockImplementation(async () => customerFileCsv());

      const body = await turn({ history: [{ role: 'user', content: 'Đây là danh sách', files: [CSV_FILE] }] });

      expect(fileRowsIn(body)).toBe(DATA_ROWS);
      expect(lastUserParts(body).join('\n')).toContain('[Nội dung tệp đính kèm: "khach_hang.csv"]');
    });

    it('bật cờ nhưng tệp là BẢNG GIÁ: đính nguyên văn qua bộ trích văn bản (AI đọc được sản phẩm)', async () => {
      const priceCsv = ['Sản phẩm,Giá', 'Khoá Python,2000000', 'Khoá Excel,1500000', 'Khoá SQL,1800000'].join('\n');
      readTempFileBuffer.mockResolvedValue(Buffer.from(priceCsv, 'utf-8'));
      extractTextFromBuffer.mockImplementation(async () => priceCsv);

      const body = await turn({
        history: [{ role: 'user', content: 'Tệp bảng giá', files: [{ tempId: 't-gia', originalName: 'bang_gia.csv', contentType: CSV }] }],
        summarizeRecipientLists: true,
      });

      expect(extractTextFromBuffer).toHaveBeenCalledTimes(1);
      const last = lastUserParts(body).join('\n');
      expect(last).toContain('Khoá Python,2000000');
      expect(last).toContain('[Nội dung tệp đính kèm: "bang_gia.csv"]');
    });

    it('bật cờ, tệp .xlsx HỎNG (bộ đọc người nhận không đọc được): rơi về đường cũ, KHÔNG làm hỏng lượt chat', async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from('khong phai bang tinh', 'utf-8'));
      extractTextFromBuffer.mockImplementation(async () => 'Nội dung trích được từ tệp lạ');

      const body = await turn({
        history: [{ role: 'user', content: 'Tệp này', files: [{ tempId: 't-x', originalName: 'hong.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }] }],
        summarizeRecipientLists: true,
      });

      expect(extractTextFromBuffer).toHaveBeenCalledTimes(1);
      expect(fileTextIn(body)).toContain('Nội dung trích được từ tệp lạ');
    });

    it('bật cờ nhưng tệp KHÔNG phải bảng tính (Word/PDF): không đụng bộ tóm tắt, nguyên văn trong rào', async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from('docx-bytes'));
      extractTextFromBuffer.mockImplementation(async () => 'Khoá học Python khai giảng. Liên hệ 0911000001 hoặc nguoi0001@example.test');

      const body = await turn({
        history: [{ role: 'user', content: 'Soạn email theo tài liệu', files: [{ tempId: 't-doc', originalName: 'gioi_thieu.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }] }],
        summarizeRecipientLists: true,
      });

      const last = lastUserParts(body).join('\n');
      expect(last).toContain('Khoá học Python khai giảng. Liên hệ 0911000001');
      expect(last).toContain('[Nội dung tệp đính kèm: "gioi_thieu.docx"]');
      expect(last).not.toContain('Danh sách người nhận');
    });

    it('tệp ở tin CŨ: không đính lại, không đọc lại (H2 giữ nguyên khi bật cờ)', async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from(customerFileCsv(), 'utf-8'));

      const body = await turn({
        history: [
          { role: 'user', content: 'Đây là danh sách khách', files: [CSV_FILE] },
          { role: 'assistant', content: 'Đã nhận.' },
          { role: 'user', content: 'Gửi qua email nhé' },
        ],
        summarizeRecipientLists: true,
      });

      expect(readTempFileBuffer).not.toHaveBeenCalled();
      expect(fileRowsIn(body)).toBe(0);
      expect(JSON.stringify(body)).toContain('KHÔNG được gửi lại');
    });
  });
});

/**
 * H2 (rà soát C P1-6, 03/10/2026) — danh sách người nhận KHÔNG gửi lại cho Gemini ở mọi lượt.
 *
 * Trước đây `runChat` đính lại tệp + tải lại mọi URL Google của TẤT CẢ tin user trong lịch sử ở mỗi lượt: Google Sheet người
 * nhận (≤300 dòng tên/SĐT/email khách cuối) và tệp Excel/CSV nguyên văn đi sang Google ở mọi lượt LLM còn lại của phiên — thừa
 * so với mức cần của bên XỬ LÝ dữ liệu (NĐ 13) và tốn token lặp. Marker wizard `[wizard]{…"sheetUrl":…}` làm regex URL khớp ở
 * MỌI lượt sau khi đã chọn nguồn.
 *
 * Ranh giới giả đúng hình dạng thật (đừng dựng dữ liệu giả hình dạng rồi test xanh — bài học F2):
 *  - Google Sheet: `axios.get` trả CSV dạng text như endpoint gviz (`validateStatus: () => true` nên 403 vẫn là response);
 *    `googleUrlFetch.util.js` là mã THẬT (regex URL, papaparse, cắt 300 dòng).
 *  - Gemini: `global.fetch` trả `Response` thật; `geminiClient.util.js` thật. Đo thẳng thân request gửi Google.
 *  - Lịch sử có đúng khuôn FE gửi: tin marker `[wizard]{json}\n<câu đọc được>` (AiChatbot.jsx `buildWizardMarkerText`).
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
const OTHER_SHEET_ID = '1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`;
const OTHER_SHEET_URL = `https://docs.google.com/spreadsheets/d/${OTHER_SHEET_ID}/edit`;
const DATA_ROWS = 300;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** CSV đúng như gviz trả: mọi ô nằm trong ngoặc kép. */
const gvizCsv = (prefix) => [
  '"Họ tên","Số điện thoại","Email"',
  ...Array.from({ length: DATA_ROWS }, (_, i) => {
    const n = String(i + 1).padStart(4, '0');
    return `"Khách ${n}","09000${n}","${prefix}${n}@example.test"`;
  }),
].join('\n');

/** Số dòng KHÁCH (email dạng khachNNNN@…) có mặt trong toàn bộ thân request gửi Google (systemInstruction + contents). */
const sheetRowsIn = (body) => (JSON.stringify(body).match(/khach\d{4}@example\.test/g) || []).length;
const otherRowsIn = (body) => (JSON.stringify(body).match(/khac\d{4}@example\.test/g) || []).length;
/** Số dòng của "tệp Excel" khách (SĐT dạng 0911NNNNNN). */
const fileRowsIn = (body) => (JSON.stringify(body).match(/0911\d{6}/g) || []).length;

const excelText = () => `--- Sheet: Sheet1 ---\nHọ tên | SĐT | Email\n${
  Array.from({ length: DATA_ROWS }, (_, i) => `Người ${i + 1} | 0911${String(i + 1).padStart(6, '0')} | nguoi${i + 1}@example.test`).join('\n')
}`;

const googleOk = (text) => new Response(JSON.stringify({
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
}), { status: 200, headers: { 'content-type': 'application/json; charset=UTF-8' } });

const requestBody = (callIndex = 0) => JSON.parse(global.fetch.mock.calls[callIndex][1].body);
/** Mọi đoạn text của hội thoại gửi Google (không tính systemInstruction). */
const contentTexts = (body) => body.contents.flatMap((c) => c.parts.map((p) => p.text || ''));

/** Một lượt runChat với lịch sử cho trước; trả thân request THẬT đã gửi Google. */
async function turn({ history, files = [], ...options }) {
  global.fetch.mockClear();
  await runChat({ systemPrompt: 'sys', history, files, userId: 101, ...options });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  return requestBody(0);
}

/** Phiên 7 lượt đúng khuôn FE: chọn kênh → tài khoản → NGUỒN (marker mang sheetUrl) → brief → lịch → lời nhắc kế hoạch máy sinh. */
const asst = (content) => ({ role: 'assistant', content });
const SESSION = [
  { role: 'user', content: `Gửi email giới thiệu khoá học cho danh sách khách này: ${SHEET_URL}` }, // 1
  asst('Bạn muốn gửi qua kênh nào?'),
  { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' }, // 2
  asst('Dùng tài khoản email nào?'),
  { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":1}\nEmail 1' }, // 3
  asst('Lấy danh sách khách từ đâu?'),
  // 4 — chọn nguồn: marker mang sheetUrl, câu đọc được cũng nhắc lại link (trường hợp xấu nhất cho regex URL)
  { role: 'user', content: `[wizard]{"gate":"dataSource","value":"sheet","sheetUrl":"${SHEET_URL}"}\nGoogle Sheet: ${SHEET_URL}` },
  asst('Bạn muốn gửi về chủ đề gì?'),
  { role: 'user', content: '[wizard]{"gate":"campaignBrief","contentMode":"custom_topic","topicText":"Mời học khoá mới"}\nChủ đề' }, // 5
  asst('Lịch gửi thế nào?'),
  { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":5,"slotsPerDay":1}\nChuỗi 5 ngày' }, // 6
  asst('Mình lên kế hoạch 5 ngày nhé.'),
  // 7 — lời nhắc kế hoạch nội dung do FE tự sinh: văn xuôi + khối "WIZARD ĐÃ CHỐT" mang dòng `- sheetUrl: "…"` (KHÔNG phải marker)
  {
    role: 'user',
    content: `Lên kế hoạch nội dung 5 ngày.\n=== WIZARD ĐÃ CHỐT ===\n- channel: "email"\n- dataSource: "sheet"\n- sheetUrl: "${SHEET_URL}"\nLịch gửi: chuỗi 5 ngày, mỗi ngày 1 tin.`,
  },
];
const userTurnEnds = SESSION.map((m, i) => (m.role === 'user' ? i : -1)).filter((i) => i >= 0);
/** Lịch sử FE gửi ở lượt thứ k (1..7): mọi tin tới hết tin user thứ k. */
const historyAtTurn = (k) => SESSION.slice(0, userTurnEnds[k - 1] + 1);
/** Giống aiCampaign.processSmartChat: từ lượt đã chọn nguồn (tin 4) trở đi, URL đó là nguồn người nhận đã chốt. */
const excludeAtTurn = (k) => (k >= 4 ? [SHEET_URL] : []);

describe('H2 (C P1-6) — danh sách người nhận không gửi lại cho Gemini', () => {
  let consoleSpies;

  beforeEach(() => {
    readTempFileBuffer.mockReset();
    readFileBufferByKey.mockReset();
    extractTextFromBuffer.mockReset();
    axiosGet.mockReset();
    axiosGet.mockImplementation(async (url) => {
      const csvHeaders = { 'content-type': 'text/csv; charset=utf-8' };
      if (String(url).includes(`/d/${SHEET_ID}/gviz/`)) return { status: 200, data: gvizCsv('khach'), headers: csvHeaders };
      if (String(url).includes(`/d/${OTHER_SHEET_ID}/gviz/`)) return { status: 200, data: gvizCsv('khac'), headers: csvHeaders };
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

  describe('Google Sheet người nhận', () => {
    it('phiên 7 lượt: CHỈ lượt dán link đầu có CSV; từ lượt chọn nguồn (marker) trở đi mọi lời gọi Gemini có 0 dòng Sheet; Sheet chỉ tải 1 lần', async () => {
      const rowsPerTurn = [];
      let turn7Chars = 0;
      for (let k = 1; k <= 7; k += 1) {
        // eslint-disable-next-line no-await-in-loop
        const body = await turn({ history: historyAtTurn(k), excludeGoogleUrls: excludeAtTurn(k) });
        rowsPerTurn.push(sheetRowsIn(body));
        if (k === 7) turn7Chars = JSON.stringify(body).length;
      }

      // Lượt 1: link dán lần đầu ở tin hiện tại → AI đọc được cột/dữ liệu lần đầu (không làm hỏng luồng đó).
      expect(rowsPerTurn[0]).toBe(DATA_ROWS);
      // Lượt 2..7 (kể cả lượt 4 là chính tin chọn nguồn, và lượt 7 là lời nhắc máy mang `- sheetUrl:`): KHÔNG dòng nào.
      expect(rowsPerTurn.slice(1)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(rowsPerTurn.reduce((a, b) => a + b, 0)).toBe(DATA_ROWS);
      // Không tải lại sheet ở các lượt sau (trước đây mỗi lượt một lần).
      expect(axiosGet).toHaveBeenCalledTimes(1);

      // Số đo cho báo cáo: ký tự thân request lượt 7 (sau khi sửa). Trước khi sửa lượt 7 mang CSV 300 dòng (≈ vài chục nghìn ký tự).
      console.info(`[H2 đo] ký tự thân request Gemini lượt 7 = ${turn7Chars}`);
      expect(turn7Chars).toBeLessThan(20000);
    });

    it('marker wizard mang sheetUrl: kể cả là TIN HIỆN TẠI và không có danh sách loại trừ vẫn không tải Sheet', async () => {
      const body = await turn({ history: historyAtTurn(4) });

      expect(sheetRowsIn(body)).toBe(0);
      expect(axiosGet).not.toHaveBeenCalled();
      // Marker vẫn nguyên văn để model lấy URL cho node read_sheet.
      expect(contentTexts(body).join('\n')).toContain(`"sheetUrl":"${SHEET_URL}"`);
    });

    it('URL đã chốt làm nguồn nằm trong tin THƯỜNG của lượt hiện tại (lời nhắc kế hoạch FE sinh): không tải, chèn dòng báo trỏ sang sheetRecipients', async () => {
      const body = await turn({ history: historyAtTurn(7), excludeGoogleUrls: [SHEET_URL] });

      expect(sheetRowsIn(body)).toBe(0);
      expect(axiosGet).not.toHaveBeenCalled();
      const lastParts = body.contents[body.contents.length - 1].parts.map((p) => p.text || '').join('\n');
      expect(lastParts).toContain('KHÔNG gửi cho AI');
      expect(lastParts).toContain('sheetRecipients');
    });

    it('so khớp theo id tài liệu: cùng sheet nhưng khác đuôi URL (/edit#gid vs /gviz) vẫn bị loại', async () => {
      const body = await turn({
        history: [{ role: 'user', content: `Xem giúp https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv` }],
        excludeGoogleUrls: [SHEET_URL],
      });

      expect(sheetRowsIn(body)).toBe(0);
      expect(axiosGet).not.toHaveBeenCalled();
    });

    it('sheet KHÁC (chưa chốt) dán ở tin hiện tại vẫn được tải để AI đọc cột lần đầu', async () => {
      const body = await turn({
        history: [{ role: 'user', content: `Phân tích giúp mình bảng này ${OTHER_SHEET_URL}` }],
        excludeGoogleUrls: [SHEET_URL],
      });

      expect(otherRowsIn(body)).toBe(DATA_ROWS);
      expect(sheetRowsIn(body)).toBe(0);
    });

    it('tin user CŨ có link Google thường (không phải marker): không tải lại, chỉ còn dòng báo "đã đọc, không gửi lại"', async () => {
      const body = await turn({
        history: [
          { role: 'user', content: `Phân tích giúp mình bảng này ${OTHER_SHEET_URL}` },
          asst('Bảng có 3 cột.'),
          { role: 'user', content: 'Cột nào là email?' },
        ],
      });

      expect(otherRowsIn(body)).toBe(0);
      expect(axiosGet).not.toHaveBeenCalled();
      const firstParts = body.contents[0].parts.map((p) => p.text || '').join('\n');
      expect(firstParts).toContain('KHÔNG gửi lại');
      expect(firstParts).toContain(OTHER_SHEET_URL);
    });

    it('tin marker cũ KHÔNG bị gắn dòng báo (marker là siêu dữ liệu, URL trong đó là nguồn đã chốt)', async () => {
      const body = await turn({ history: historyAtTurn(5), excludeGoogleUrls: [SHEET_URL] });

      const markerMsg = body.contents.find((c) => (c.parts[0].text || '').startsWith('[wizard]{"gate":"dataSource"'));
      expect(markerMsg.parts).toHaveLength(1);
    });
  });

  describe('Tệp đính kèm trong chat (Excel/CSV danh sách khách)', () => {
    const XLSX_FILE = { tempId: 't-khach', originalName: 'khach_hang.xlsx', contentType: XLSX };

    it('tệp Excel đính ở lượt 2: CHỈ lượt 2 có nội dung tệp; lượt 3+ không (kèm dòng báo có tên tệp); tệp chỉ được đọc 1 lần', async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from('xlsx-bytes'));
      extractTextFromBuffer.mockImplementation(async () => excelText());
      const history = [
        { role: 'user', content: 'Mình có danh sách khách muốn gửi email' }, // 1
        asst('Bạn gửi tệp lên nhé.'),
        { role: 'user', content: 'Đây là tệp', files: [XLSX_FILE] }, // 2
        asst('Đã nhận tệp.'),
        { role: 'user', content: 'Gửi qua email nhé' }, // 3
        asst('Ok.'),
        { role: 'user', content: 'Chủ đề là khai giảng' }, // 4
        asst('Ok.'),
        { role: 'user', content: 'Gửi 1 lần' }, // 5
      ];
      const upTo = (userIdx) => history.slice(0, userIdx + 1);

      const t1 = await turn({ history: upTo(0) });
      // Lượt 2: `files` của request = đúng tệp đó (FE gửi cả trong history lẫn `files`) — không đính hai lần.
      const t2 = await turn({ history: upTo(2), files: [XLSX_FILE] });
      const later = [];
      for (const idx of [4, 6, 8]) {
        // eslint-disable-next-line no-await-in-loop
        later.push(await turn({ history: upTo(idx) }));
      }

      expect(fileRowsIn(t1)).toBe(0);
      expect(fileRowsIn(t2)).toBe(DATA_ROWS);
      expect(contentTexts(t2).filter((t) => t.includes('[Nội dung tệp đính kèm: "khach_hang.xlsx"]'))).toHaveLength(1);
      expect(later.map(fileRowsIn)).toEqual([0, 0, 0]);
      expect(readTempFileBuffer).toHaveBeenCalledTimes(1);
      const tmsg = later[0].contents[2].parts.map((p) => p.text || '').join('\n');
      expect(tmsg).toContain('khach_hang.xlsx');
      expect(tmsg).toContain('KHÔNG được gửi lại');
    });

    it("historyAttachments='images': ảnh ở tin cũ VẪN đính lại (brief attached_file + ảnh chỉ có bytes), tệp văn bản/Excel cũ thì không", async () => {
      readTempFileBuffer.mockImplementation(async (tempId) => Buffer.from(tempId === 't-anh' ? 'PNGDATA' : 'xlsx-bytes'));
      extractTextFromBuffer.mockImplementation(async () => excelText());
      const history = [
        {
          role: 'user',
          content: 'Dùng ảnh và bảng này',
          files: [{ tempId: 't-anh', originalName: 'poster.png', contentType: 'image/png' }, XLSX_FILE],
        },
        asst('Ok.'),
        { role: 'user', content: 'Viết email giúp mình' },
      ];

      const body = await turn({ history, historyAttachments: 'images' });

      const first = body.contents[0].parts;
      expect(first.some((p) => p.inlineData?.mimeType === 'image/png')).toBe(true);
      expect(fileRowsIn(body)).toBe(0);
      expect(first.map((p) => p.text || '').join('\n')).toContain('khach_hang.xlsx');
      expect(first.map((p) => p.text || '').join('\n')).not.toContain('poster.png');
      expect(readTempFileBuffer).toHaveBeenCalledTimes(1);
    });

    it("mặc định ('current'): ảnh ở tin cũ cũng không đính lại", async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from('PNGDATA'));
      const history = [
        { role: 'user', content: 'Đây là ảnh', files: [{ tempId: 't-anh', originalName: 'poster.png', contentType: 'image/png' }] },
        asst('Ok.'),
        { role: 'user', content: 'Mô tả ảnh' },
      ];

      const body = await turn({ history });

      expect(body.contents.flatMap((c) => c.parts).some((p) => p.inlineData)).toBe(false);
      expect(readTempFileBuffer).not.toHaveBeenCalled();
    });

    it("historyAttachments='all' (trợ lý super admin) giữ hành vi cũ: tệp và link Google ở tin cũ vẫn đính lại", async () => {
      readTempFileBuffer.mockResolvedValue(Buffer.from('xlsx-bytes'));
      extractTextFromBuffer.mockImplementation(async () => excelText());
      const history = [
        { role: 'user', content: `Tóm tắt giúp ${OTHER_SHEET_URL}`, files: [XLSX_FILE] },
        asst('Đã tóm tắt.'),
        { role: 'user', content: 'Phần giá thì sao?' },
      ];

      const body = await turn({ history, historyAttachments: 'all' });

      expect(fileRowsIn(body)).toBe(DATA_ROWS);
      expect(otherRowsIn(body)).toBe(DATA_ROWS);
    });
  });
});

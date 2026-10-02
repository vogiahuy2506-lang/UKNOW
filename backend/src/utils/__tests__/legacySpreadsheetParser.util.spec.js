import { describe, it, expect } from '@jest/globals';
import module from 'module';
import {
  assertSpreadsheetSize,
  parseLegacySpreadsheet,
} from '../legacySpreadsheetParser.util.js';
import { MAX_UPLOAD_FILE_BYTES } from '../uploadLimits.util.js';

/**
 * `xlsx@0.18.5` (SheetJS) còn lỗi prototype pollution + ReDoS khi đọc tệp lạ nên chỉ được chạy
 * trong worker_threads. Các bài dưới dùng worker THẬT (không mock worker_threads): cái cần canh
 * chính là thread bị giết thật, bộ nhớ bị chặn thật, và Object.prototype của tiến trình chính
 * không bị làm bẩn thật.
 */
const require = module.createRequire(import.meta.url);
const XLSX = require('xlsx');

const fixtureWorker = (name) => new URL(`./fixtures/${name}`, import.meta.url);

function buildWorkbook(sheets, bookType) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType });
}

const RECIPIENT_ROWS = [
  ['Tên', 'Thư', 'SDT'],
  ['Do G', 'g@test.com', '0909000111'],
  ['', '', ''],
  ['Vu F', 'f@domain.vn', 987112233],
  ['x', 1.5, true],
];

describe('legacySpreadsheetParser.util — đọc .xls bằng SheetJS trong worker', () => {
  it("output 'rows': y hệt sheet_to_json({ header: 1, defval: '' }) chạy trực tiếp", async () => {
    const xls = buildWorkbook([['Sheet1', RECIPIENT_ROWS], ['Khac', [['a']]]], 'biff8');
    const direct = XLSX.utils.sheet_to_json(
      XLSX.read(xls, { type: 'buffer' }).Sheets.Sheet1,
      { header: 1, defval: '' }
    );

    const result = await parseLegacySpreadsheet(xls, { output: 'rows' });

    expect(result).toEqual({ sheetName: 'Sheet1', rows: direct });
  });

  it("output 'csv': mọi trang tính, y hệt sheet_to_csv({ blankrows: false })", async () => {
    const xls = buildWorkbook([['Sheet1', RECIPIENT_ROWS], ['Bang gia', [['Goi', 'Gia'], ['Pro', 299000]]]], 'biff8');
    const wb = XLSX.read(xls, { type: 'buffer' });

    const result = await parseLegacySpreadsheet(xls, { output: 'csv' });

    expect(result).toEqual({
      sheets: wb.SheetNames.map((name) => ({
        name,
        csv: XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false }),
      })),
    });
  });

  it('không làm hỏng / chuyển quyền buffer của nơi gọi', async () => {
    const xls = buildWorkbook([['Sheet1', RECIPIENT_ROWS]], 'biff8');
    const before = Buffer.from(xls);

    await parseLegacySpreadsheet(xls);

    expect(xls.length).toBe(before.length);
    expect(xls.equals(before)).toBe(true);
  });

  it('tệp hỏng → reject bằng lỗi của bộ đọc, tiến trình chính vẫn sống', async () => {
    const brokenOle = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(600, 7)]);

    await expect(parseLegacySpreadsheet(brokenOle)).rejects.toThrow(/Major Version/);
  });

  it('buffer rỗng / không phải buffer → INVALID_FILE_BUFFER, không tạo worker', async () => {
    await expect(parseLegacySpreadsheet(Buffer.alloc(0))).rejects.toMatchObject({ code: 'INVALID_FILE_BUFFER' });
    await expect(parseLegacySpreadsheet('abc')).rejects.toMatchObject({ code: 'INVALID_FILE_BUFFER' });
  });

  describe('trần dung lượng', () => {
    it('mặc định dùng lại trần tải tệp chung MAX_UPLOAD_FILE_BYTES', () => {
      expect(() => assertSpreadsheetSize({ length: MAX_UPLOAD_FILE_BYTES })).not.toThrow();
      expect(() => assertSpreadsheetSize({ length: MAX_UPLOAD_FILE_BYTES + 1 })).toThrow(
        expect.objectContaining({ code: 'SPREADSHEET_TOO_LARGE', statusCode: 413 })
      );
    });

    it('chặn trước khi đọc — không tạo worker nào', async () => {
      await expect(
        parseLegacySpreadsheet(Buffer.alloc(11, 1), { maxBytes: 10, workerUrl: fixtureWorker('crashingSpreadsheet.worker.js') })
      ).rejects.toMatchObject({ code: 'SPREADSHEET_TOO_LARGE', statusCode: 413 });
    });
  });

  describe('cô lập', () => {
    it('quá thời gian → terminate() worker và báo lỗi tiếng Việt rõ ràng', async () => {
      const startedAt = Date.now();

      await expect(
        parseLegacySpreadsheet(Buffer.from('xls'), {
          timeoutMs: 300,
          workerUrl: fixtureWorker('hangingSpreadsheet.worker.js'),
        })
      ).rejects.toMatchObject({
        code: 'SPREADSHEET_PARSE_TIMEOUT',
        statusCode: 400,
        message: expect.stringContaining('Đọc tệp bảng tính quá'),
      });
      expect(Date.now() - startedAt).toBeLessThan(5000);
    });

    it('vượt trần bộ nhớ của worker → SPREADSHEET_PARSE_RESOURCE_LIMIT, không làm sập tiến trình', async () => {
      await expect(
        parseLegacySpreadsheet(Buffer.from('xls'), {
          maxOldGenerationSizeMb: 16,
          timeoutMs: 20_000,
          workerUrl: fixtureWorker('memoryHogSpreadsheet.worker.js'),
        })
      ).rejects.toMatchObject({ code: 'SPREADSHEET_PARSE_RESOURCE_LIMIT', statusCode: 400 });
    }, 30_000);

    it('prototype pollution trong worker không lan sang tiến trình chính; ô lạ bị chuẩn hoá', async () => {
      const result = await parseLegacySpreadsheet(Buffer.from('xls'), {
        workerUrl: fixtureWorker('pollutingSpreadsheet.worker.js'),
      });

      expect({}.polluted).toBeUndefined();
      expect(Object.prototype.polluted).toBeUndefined();
      expect(result).toEqual({
        sheetName: 'Sheet1',
        rows: [
          ['Email', 'SĐT'],
          ['a@example.com', '', '', 42, true],
          [],
        ],
      });
    });

    it('worker ném lỗi khi khởi động → reject, không treo', async () => {
      await expect(
        parseLegacySpreadsheet(Buffer.from('xls'), { workerUrl: fixtureWorker('crashingSpreadsheet.worker.js') })
      ).rejects.toThrow('worker giả hỏng khi khởi động');
    });

    it('suất worker được trả lại sau timeout: lượt đọc thật xếp sau vẫn chạy xong', async () => {
      const hanging = { timeoutMs: 300, workerUrl: fixtureWorker('hangingSpreadsheet.worker.js') };
      const xls = buildWorkbook([['Sheet1', RECIPIENT_ROWS]], 'biff8');

      const [first, second, real] = await Promise.allSettled([
        parseLegacySpreadsheet(Buffer.from('a'), hanging),
        parseLegacySpreadsheet(Buffer.from('b'), hanging),
        parseLegacySpreadsheet(xls),
      ]);

      expect(first).toMatchObject({ status: 'rejected', reason: { code: 'SPREADSHEET_PARSE_TIMEOUT' } });
      expect(second).toMatchObject({ status: 'rejected', reason: { code: 'SPREADSHEET_PARSE_TIMEOUT' } });
      expect(real).toMatchObject({ status: 'fulfilled', value: { sheetName: 'Sheet1' } });
    }, 30_000);

    it('hàng chờ đầy → từ chối ngay bằng SPREADSHEET_PARSER_BUSY thay vì treo request', async () => {
      const hanging = { timeoutMs: 200, workerUrl: fixtureWorker('hangingSpreadsheet.worker.js') };
      // 2 worker chạy + 20 lượt chờ = 22 lượt được nhận; lượt thứ 23 phải bị từ chối.
      const jobs = Array.from({ length: 23 }, (_, i) => parseLegacySpreadsheet(Buffer.from(`job-${i}`), hanging));

      const settled = await Promise.allSettled(jobs);
      const codes = settled.map((s) => s.reason?.code);

      expect(codes.filter((c) => c === 'SPREADSHEET_PARSER_BUSY')).toHaveLength(1);
      expect(codes.filter((c) => c === 'SPREADSHEET_PARSE_TIMEOUT')).toHaveLength(22);
      expect(settled[22]).toMatchObject({ status: 'rejected', reason: { code: 'SPREADSHEET_PARSER_BUSY', statusCode: 503 } });
    }, 60_000);
  });
});

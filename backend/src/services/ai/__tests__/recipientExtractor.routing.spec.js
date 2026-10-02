import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import module from 'module';

/**
 * Canh việc CHỌN bộ đọc của recipientExtractor: SheetJS (`xlsx@0.18.5`, còn lỗ hổng khi đọc tệp
 * lạ) chỉ được gọi qua worker cô lập, không bao giờ cho .xlsx đọc được bằng ExcelJS hay cho CSV.
 * Worker được mock ở đây; hành vi worker thật nằm ở legacySpreadsheetParser.util.spec.js.
 */
const mockParseLegacySpreadsheet = jest.fn();
const mockAssertSpreadsheetSize = jest.fn();

jest.unstable_mockModule('../../../utils/legacySpreadsheetParser.util.js', () => ({
  parseLegacySpreadsheet: mockParseLegacySpreadsheet,
  assertSpreadsheetSize: mockAssertSpreadsheetSize,
  default: {
    parseLegacySpreadsheet: mockParseLegacySpreadsheet,
    assertSpreadsheetSize: mockAssertSpreadsheetSize,
  },
}));

const { extractRecipientsFromBuffer } = await import('../recipientExtractor.service.js');

const require = module.createRequire(import.meta.url);
const XLSX = require('xlsx'); // chỉ để dựng tệp mẫu

const ROWS = [['Tên', 'Email', 'SĐT'], ['A', 'a@example.com', '0901234567']];

function buildBook(bookType) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ROWS), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType });
}

function codedError(message, code, statusCode) {
  return Object.assign(new Error(message), { code, statusCode });
}

describe('recipientExtractor — chọn bộ đọc', () => {
  beforeEach(() => {
    mockAssertSpreadsheetSize.mockReset();
    mockParseLegacySpreadsheet.mockReset();
    mockParseLegacySpreadsheet.mockResolvedValue({ sheetName: 'Sheet1', rows: ROWS });
  });

  it('.xlsx đọc bằng ExcelJS — không đụng tới SheetJS', async () => {
    const buf = buildBook('xlsx');

    const result = await extractRecipientsFromBuffer(buf, 'danh-sach.xlsx');

    expect(result.emails).toEqual(['a@example.com']);
    expect(mockParseLegacySpreadsheet).not.toHaveBeenCalled();
    expect(mockAssertSpreadsheetSize).toHaveBeenCalledWith(buf);
  });

  it('.xls (BIFF) đọc qua worker cô lập, chỉ lấy mảng dòng của trang tính đầu', async () => {
    const buf = buildBook('biff8');

    const result = await extractRecipientsFromBuffer(buf, 'danh-sach.xls');

    expect(mockParseLegacySpreadsheet).toHaveBeenCalledTimes(1);
    expect(mockParseLegacySpreadsheet).toHaveBeenCalledWith(buf, { output: 'rows' });
    expect(result.emails).toEqual(['a@example.com']);
    expect(result.phones).toEqual(['0901234567']);
  });

  it('gói ZIP mà ExcelJS không đọc được → thử lại bằng worker (tệp cũ vẫn đọc được)', async () => {
    const brokenZip = Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.alloc(64, 1)]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await extractRecipientsFromBuffer(brokenZip, 'la.xlsx');

    expect(mockParseLegacySpreadsheet).toHaveBeenCalledWith(brokenZip, { output: 'rows' });
    expect(result.emails).toEqual(['a@example.com']);
    warn.mockRestore();
  });

  it('CSV giữ nguyên đường cũ: không qua trần dung lượng bảng tính, không qua worker', async () => {
    const result = await extractRecipientsFromBuffer(Buffer.from('Email\nb@example.com\n'), 'r.csv', 'text/csv');

    expect(result.emails).toEqual(['b@example.com']);
    expect(mockParseLegacySpreadsheet).not.toHaveBeenCalled();
    expect(mockAssertSpreadsheetSize).not.toHaveBeenCalled();
  });

  it('tệp vượt trần dung lượng bị chặn TRƯỚC khi đọc', async () => {
    mockAssertSpreadsheetSize.mockImplementation(() => {
      throw codedError('Tệp bảng tính vượt giới hạn 100MB.', 'SPREADSHEET_TOO_LARGE', 413);
    });

    await expect(extractRecipientsFromBuffer(buildBook('biff8'), 'to.xls')).rejects.toMatchObject({
      code: 'SPREADSHEET_TOO_LARGE',
      statusCode: 413,
    });
    expect(mockParseLegacySpreadsheet).not.toHaveBeenCalled();
  });

  it('worker quá thời gian → lỗi tiếng Việt của worker đi thẳng ra ngoài, không bị bọc lại', async () => {
    mockParseLegacySpreadsheet.mockRejectedValue(codedError(
      'Đọc tệp bảng tính quá 15 giây nên đã dừng.',
      'SPREADSHEET_PARSE_TIMEOUT',
      400
    ));

    await expect(extractRecipientsFromBuffer(buildBook('biff8'), 'cham.xls')).rejects.toMatchObject({
      code: 'SPREADSHEET_PARSE_TIMEOUT',
      statusCode: 400,
      message: 'Đọc tệp bảng tính quá 15 giây nên đã dừng.',
    });
  });

  it('lỗi đọc thường của worker → SPREADSHEET_PARSE_ERROR 400', async () => {
    mockParseLegacySpreadsheet.mockRejectedValue(new Error('Unsupported file'));

    await expect(extractRecipientsFromBuffer(buildBook('biff8'), 'hong.xls')).rejects.toMatchObject({
      code: 'SPREADSHEET_PARSE_ERROR',
      statusCode: 400,
      message: 'Không thể giải nén bảng tính: Unsupported file',
    });
  });

  it('worker không thấy trang tính nào → EMPTY_SPREADSHEET', async () => {
    mockParseLegacySpreadsheet.mockResolvedValue({ sheetName: null, rows: [] });

    await expect(extractRecipientsFromBuffer(buildBook('biff8'), 'rong.xls')).rejects.toMatchObject({
      code: 'EMPTY_SPREADSHEET',
      statusCode: 400,
    });
  });
});

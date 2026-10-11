import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  IMPORT_BATCH_SIZE,
  buildImportRows,
  chunk,
  detectColumns,
  importInBatches,
  normalizeHeader,
  readSpreadsheetFile,
  toBulkItem,
} from '../customerImport.helpers';

describe('customerImport.helpers — nhận diện cột', () => {
  it('bỏ dấu tiếng Việt, hoa/thường, ký tự lạ', () => {
    expect(normalizeHeader('Số điện thoại')).toBe('sodienthoai');
    expect(normalizeHeader(' Họ & Tên ')).toBe('hoten');
    expect(normalizeHeader('E-mail')).toBe('email');
    expect(normalizeHeader(null)).toBe('');
  });

  it('nhận cột tiếng Việt lẫn tiếng Anh, theo thứ tự cột bất kỳ', () => {
    expect(detectColumns(['Ghi chú', 'SĐT', 'Email', 'Họ tên', 'Cột lạ'])).toEqual({
      notes: 0, phone: 1, email: 2, fullName: 3,
    });
    expect(detectColumns(['Name', 'Phone', 'Mail'])).toEqual({ fullName: 0, phone: 1, email: 2 });
  });

  it('buildImportRows: số dòng tính theo FILE (tiêu đề = 1), bỏ dòng trống, đánh dấu dòng thiếu liên hệ', () => {
    const { rows, hasContactColumn } = buildImportRows([
      ['Họ tên', 'Email', 'SĐT'],
      ['An', 'an@example.com', '0912345678'],
      ['', '', ''],
      ['Bình', '', ''],
      ['Chi', '', '0987654321'],
    ]);
    expect(hasContactColumn).toBe(true);
    expect(rows.map((r) => [r.rowNumber, r.skipped])).toEqual([[2, false], [4, true], [5, false]]);
  });

  it('sheet bắt đầu ở dòng 3 → số dòng báo lỗi cộng đúng độ lệch', () => {
    const { rows } = buildImportRows([['Email'], ['a@example.com']], 3);
    expect(rows[0].rowNumber).toBe(4);
  });

  it('không có cột email/SĐT → hasContactColumn=false', () => {
    expect(buildImportRows([['Họ tên'], ['An']]).hasContactColumn).toBe(false);
  });

  it('toBulkItem chỉ giữ trường có giá trị (ô trống không ghi đè dữ liệu cũ)', () => {
    const { rows } = buildImportRows([['Họ tên', 'Email', 'SĐT', 'Ghi chú'], ['An', 'an@example.com', '', '']]);
    expect(toBulkItem(rows[0])).toEqual({ fullName: 'An', email: 'an@example.com' });
  });
});

describe('customerImport.helpers — chia lô ≤ 2.000 và lỗi theo dòng', () => {
  it('chunk chia đúng', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it('2.500 dòng → đúng 2 lần gọi /bulk với 2.000 + 500, không lô nào vượt trần', async () => {
    const items = Array.from({ length: 2500 }, (_, i) => ({ email: `u${i}@example.com` }));
    const rowNumbers = items.map((_, i) => i + 2);
    const bulkFn = vi.fn(async (batch) => ({ data: { data: { inserted: batch.length, updated: 0, skipped: 0, invalid: 0, errors: [] } } }));
    const onProgress = vi.fn();

    const outcome = await importInBatches({ items, rowNumbers, bulkFn, onProgress });

    expect(IMPORT_BATCH_SIZE).toBe(2000);
    expect(bulkFn.mock.calls.map(([batch]) => batch.length)).toEqual([2000, 500]);
    expect(Math.max(...bulkFn.mock.calls.map(([batch]) => batch.length))).toBeLessThanOrEqual(2000);
    expect(outcome.totals).toEqual({ inserted: 2500, updated: 0, skipped: 0, invalid: 0 });
    expect(outcome.failedBatch).toBeNull();
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([{ current: 1, total: 2 }, { current: 2, total: 2 }]);
  });

  it('errors[].index của backend (tính trong từng lô) → số dòng TRONG FILE, kể cả ở lô thứ hai', async () => {
    const items = Array.from({ length: 2005 }, (_, i) => ({ email: `u${i}@example.com` }));
    // dòng 4 và dòng 9 của file bị bỏ qua phía client (thiếu liên hệ) → số dòng không liên tục
    const rowNumbers = items.map((_, i) => (i < 2 ? i + 2 : i + 4));
    const bulkFn = vi
      .fn()
      .mockResolvedValueOnce({ data: { data: { inserted: 1998, updated: 0, skipped: 0, invalid: 2, errors: [
        { index: 0, field: 'email', message: 'Email không hợp lệ' },
        { index: 1999, field: 'phone', message: 'Số điện thoại không hợp lệ' },
      ] } } })
      .mockResolvedValueOnce({ data: { data: { inserted: 4, updated: 0, skipped: 0, invalid: 1, errors: [
        { index: 2, field: 'email', message: 'Email không hợp lệ' },
      ] } } });

    const outcome = await importInBatches({ items, rowNumbers, bulkFn });

    expect(outcome.errors).toEqual([
      { row: rowNumbers[0], field: 'email', message: 'Email không hợp lệ' },
      { row: rowNumbers[1999], field: 'phone', message: 'Số điện thoại không hợp lệ' },
      { row: rowNumbers[2002], field: 'email', message: 'Email không hợp lệ' },
    ]);
    expect(outcome.totals.invalid).toBe(3);
  });

  it('lô lỗi HTTP → dừng ngay, giữ kết quả các lô trước, báo số lô + message', async () => {
    const items = Array.from({ length: 4100 }, (_, i) => ({ email: `u${i}@example.com` }));
    const bulkFn = vi
      .fn()
      .mockResolvedValueOnce({ data: { data: { inserted: 2000, updated: 0, skipped: 0, invalid: 0, errors: [] } } })
      .mockRejectedValueOnce({ response: { data: { message: 'Mỗi lần chỉ nhập tối đa 2000 khách hàng' } } });

    const outcome = await importInBatches({ items, rowNumbers: items.map((_, i) => i + 2), bulkFn });

    expect(bulkFn).toHaveBeenCalledTimes(2);
    expect(outcome.totals.inserted).toBe(2000);
    expect(outcome.failedBatch).toEqual({ batch: 2, message: 'Mỗi lần chỉ nhập tối đa 2000 khách hàng' });
  });
});

describe('customerImport.helpers — đọc file thật bằng thư viện xlsx', () => {
  // jsdom 24 chưa có Blob#text/arrayBuffer (trình duyệt thật có) → gắn tay.
  const makeFile = (name, text, buffer) => Object.assign(new File([text ?? ''], name), {
    text: async () => text,
    arrayBuffer: async () => buffer,
  });

  it('CSV UTF-8: giữ số 0 đầu của SĐT, đọc tiếng Việt, qua buildImportRows ra đúng dòng', async () => {
    const csv = 'Họ tên,Email,Số điện thoại\nNguyễn An,an@example.com,0912345678\nTrần Bình,,0987654321\n';
    const { matrix, firstRowNumber } = await readSpreadsheetFile(makeFile('khach.csv', csv));
    expect(firstRowNumber).toBe(1);
    const { rows } = buildImportRows(matrix, firstRowNumber);
    expect(rows.map((r) => r.fields.phone)).toEqual(['0912345678', '0987654321']);
    expect(rows[0].fields.fullName).toBe('Nguyễn An');
  });

  it('XLSX: SĐT là chữ vẫn nguyên; tiêu đề tiếng Việt nhận diện được', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['Họ tên', 'Email', 'SĐT'], ['Lê Chi', 'chi@example.com', '0901234567']]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const { matrix, firstRowNumber } = await readSpreadsheetFile(makeFile('khach.xlsx', null, buffer));
    const { rows } = buildImportRows(matrix, firstRowNumber);
    expect(rows).toHaveLength(1);
    expect(rows[0].fields).toMatchObject({ fullName: 'Lê Chi', email: 'chi@example.com', phone: '0901234567' });
  });
});

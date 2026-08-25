import module from 'module';
import { extractRecipientsFromBuffer } from '../recipientExtractor.service.js';

const require = module.createRequire(import.meta.url);
const XLSX = require('xlsx');

describe('recipientExtractor.service', () => {
  it('throws error when buffer is invalid or empty', () => {
    expect(() => extractRecipientsFromBuffer(null)).toThrow(
      expect.objectContaining({ code: 'INVALID_FILE_BUFFER', statusCode: 400 })
    );
    expect(() => extractRecipientsFromBuffer(Buffer.from(''))).toThrow(
      expect.objectContaining({ code: 'INVALID_FILE_BUFFER', statusCode: 400 })
    );
  });

  it('extracts emails, phones and names from a CSV buffer with headers', () => {
    const csv = `Họ và tên,Email,Số điện thoại
Nguyen Van A,a@example.com,0901234567
Tran Thi B,b@example.com,0987654321
Le Van C,,0911223344
Pham Thi D,d@example.com,
`;
    const buf = Buffer.from(csv, 'utf-8');
    const result = extractRecipientsFromBuffer(buf, 'recipients.csv', 'text/csv');

    expect(result.emails).toEqual(['a@example.com', 'b@example.com', 'd@example.com']);
    expect(result.phones).toEqual(['0901234567', '0987654321', '0911223344']);
    expect(result.rowCount).toBe(6);
    expect(result.detectedColumns).toEqual({
      email: true,
      phone: true,
      name: true,
    });
    expect(result.sampleRows.length).toBe(4);
    expect(result.sampleRows[0]).toEqual({
      name: 'Nguyen Van A',
      email: 'a@example.com',
      phone: '0901234567',
    });
  });

  it('extracts emails and phones from an Excel XLSX buffer', () => {
    const rows = [
      ['Customer Name', 'Email Address', 'Phone Number'],
      ['Hoang E', 'e@domain.vn', '0912345678'],
      ['Vu F', 'f@domain.vn', '0987112233'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const result = extractRecipientsFromBuffer(buf, 'data.xlsx');
    expect(result.emails).toEqual(['e@domain.vn', 'f@domain.vn']);
    expect(result.phones).toEqual(['0912345678', '0987112233']);
    expect(result.rowCount).toBe(4);
  });

  it('extracts emails and phones from an Excel XLS buffer', () => {
    const rows = [
      ['Tên', 'Thư', 'SDT'],
      ['Do G', 'g@test.com', '0909000111'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'biff8' });

    const result = extractRecipientsFromBuffer(buf, 'data.xls');
    expect(result.emails).toEqual(['g@test.com']);
    expect(result.phones).toEqual(['0909000111']);
    expect(result.rowCount).toBe(2);
  });

  it('throws NO_RECIPIENTS_FOUND if spreadsheet contains no emails or phones', () => {
    const rows = [
      ['Tên', 'Địa chỉ', 'Ghi chú'],
      ['Nguyen A', 'Hà Nội', 'VIP'],
      ['Tran B', 'Đà Nẵng', 'Thường'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    expect(() => extractRecipientsFromBuffer(buf, 'test.xlsx')).toThrow(
      expect.objectContaining({ code: 'NO_RECIPIENTS_FOUND', statusCode: 400 })
    );
  });

  it('throws RECIPIENTS_LIMIT_EXCEEDED when count exceeds 1000', () => {
    const rows = [['Email']];
    for (let i = 0; i < 1005; i++) {
      rows.push([`user${i}@example.com`]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    expect(() => extractRecipientsFromBuffer(buf, 'large.xlsx')).toThrow(
      expect.objectContaining({ code: 'RECIPIENTS_LIMIT_EXCEEDED', statusCode: 400 })
    );
  });
});

import module from 'module';
import { extractRecipientsFromBuffer, extractRecipientsFromGoogleSheet } from '../recipientExtractor.service.js';

const require = module.createRequire(import.meta.url);
const XLSX = require('xlsx');

describe('recipientExtractor.service', () => {
  /**
   * Google Sheets coi số điện thoại gõ trần là SỐ và nuốt số 0 đầu: `0388180856` → `388180856`.
   * Đây là hành vi MẶC ĐỊNH, không phải ca hiếm.
   *
   * Trước bản vá 01/09/2026, những giá trị đó bị `PHONE_RE` loại, và giao diện báo
   * "Google Sheet không có cột số điện thoại" **dù cột `sđt` có thật và có dữ liệu thật**.
   * Phát hiện khi dùng thử luồng tạo chiến dịch Zalo — không bài test nào trong 2054 bài
   * lúc đó bắt được, vì tất cả đều dùng số đã có sẵn số 0.
   */
  it('khôi phục số 0 bị Google Sheets nuốt ở cột có tiêu đề SĐT', () => {
    const csv = 'Họ Tên,Email,sđt\nminh,minh@example.com,388180856\nphuc,phuc@example.com,987654321\n';
    const result = extractRecipientsFromBuffer(Buffer.from(csv, 'utf-8'), 'r.csv', 'text/csv');

    expect(result.phones).toEqual(['0388180856', '0987654321']);
    expect(result.detectedColumns.phone).toBe(true);
  });

  it('KHÔNG nhận nhầm số 9 chữ số đầu 2 (số cố định) hay chuỗi số khác thành SĐT', () => {
    const csv = 'Họ Tên,Email,sđt\na,a@example.com,288180856\nb,b@example.com,12345678\n';
    const result = extractRecipientsFromBuffer(Buffer.from(csv, 'utf-8'), 'r.csv', 'text/csv');

    expect(result.phones).toEqual([]);
  });

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

  /**
   * Regression (bug thật 25/08/2026): người dùng tải lên tệp .xlsx hai dòng, hệ thống chỉ lấy
   * được một email. Nguyên nhân là ô kia gõ `mtruong909@gmail,com` — dấu PHẨY thay vì dấu chấm.
   * Bộ đọc loại đúng, nhưng loại trong IM LẶNG: chỉ đếm vào `skipped` rồi thôi, không nơi nào
   * kể tên dòng bị loại. Người dùng nhìn thấy "đã đọc 1 người nhận" và tưởng bộ đọc tệp hỏng.
   */
  describe('kể tên dòng bị loại', () => {
    const buildXlsx = (rows) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    };

    it('nêu đúng giá trị và số dòng của ô email gõ sai', () => {
      const buf = buildXlsx([
        ['Họ Tên', 'Email'],
        ['minh', 'mtruong909@gmail,com'],
        ['phúc', 'hoangphuc@gmail.com'],
      ]);

      const result = extractRecipientsFromBuffer(buf, 'danh-sach.xlsx');

      expect(result.emails).toEqual(['hoangphuc@gmail.com']);
      expect(result.skipped).toBe(1);
      expect(result.skippedSamples).toEqual([
        { row: 2, value: 'mtruong909@gmail,com', reason: 'email_invalid' },
      ]);
    });

    it('số dòng vẫn đúng khi tệp có dòng trống xen giữa', () => {
      // Bộ đọc lọc bỏ dòng trống trước khi duyệt; nếu lấy chỉ số sau khi lọc thì số dòng báo ra
      // sẽ lệch — báo sai số dòng còn tệ hơn không báo.
      const buf = buildXlsx([
        ['Họ Tên', 'Email'],
        ['a', 'a@example.com'],
        ['', ''],
        ['', ''],
        ['hỏng', 'sai-be-bét'],
      ]);

      const result = extractRecipientsFromBuffer(buf, 'co-dong-trong.xlsx');

      expect(result.skipped).toBe(1);
      expect(result.skippedSamples[0].row).toBe(5); // đúng số dòng trong Excel, không phải 3
    });

    it('phân biệt SĐT sai định dạng với dòng không có gì', () => {
      const buf = buildXlsx([
        ['Họ Tên', 'SĐT'],
        ['a', '0901234567'],
        ['b', '12'],
        ['c', ''],
      ]);

      const result = extractRecipientsFromBuffer(buf, 'sdt.xlsx');

      expect(result.skipped).toBe(2);
      expect(result.skippedSamples).toEqual([
        { row: 3, value: '12', reason: 'phone_invalid' },
        { row: 4, value: null, reason: 'no_contact' },
      ]);
    });

    it('không kể quá 5 dòng, nhưng vẫn đếm đủ', () => {
      const rows = [['Họ Tên', 'Email']];
      for (let i = 0; i < 9; i += 1) rows.push([`x${i}`, `hong-${i}`]);
      rows.push(['ok', 'ok@example.com']);

      const result = extractRecipientsFromBuffer(buildXlsx(rows), 'nhieu-loi.xlsx');

      expect(result.skipped).toBe(9);
      expect(result.skippedSamples).toHaveLength(5);
    });

    it('tệp sạch thì không có dòng bị loại nào', () => {
      const buf = buildXlsx([
        ['Họ Tên', 'Email'],
        ['a', 'a@example.com'],
        ['b', 'b@example.com'],
      ]);

      const result = extractRecipientsFromBuffer(buf, 'sach.xlsx');

      expect(result.skipped).toBe(0);
      expect(result.skippedSamples).toEqual([]);
    });
  });

  /**
   * Sự cố 02/09/2026: sheet 8.156 người nhận bị từ chối chạy vì trần 1.000 vốn
   * dành cho người nhận NHẬP TAY qua trợ lý AI bị áp luôn cho node đọc Sheet.
   * Trần phải truyền được từ ngoài vào, và mặc định của đường đọc Sheet là
   * MAX_SHEET_RECIPIENTS chứ không phải trần nhập tay.
   */
  describe('trần người nhận truyền từ ngoài vào', () => {
    const buildCsvBuffer = (count) => {
      const lines = ['Email'];
      for (let i = 0; i < count; i += 1) lines.push(`user${i}@example.com`);
      return Buffer.from(lines.join('\n'), 'utf-8');
    };

    it('không chặn khi maxRecipients được nâng lên trên số dòng thực tế', () => {
      const buf = buildCsvBuffer(1005);

      const result = extractRecipientsFromBuffer(buf, 'lon.csv', 'text/csv', { maxRecipients: 10000 });

      expect(result.emails).toHaveLength(1005);
    });

    it('báo đúng trần được truyền vào khi vượt ngưỡng', () => {
      const buf = buildCsvBuffer(5);

      expect(() => extractRecipientsFromBuffer(buf, 'nho.csv', 'text/csv', { maxRecipients: 3 })).toThrow(
        expect.objectContaining({ code: 'RECIPIENTS_LIMIT_EXCEEDED', limit: 3, totalCount: 5 })
      );
    });

    it('giữ trần nhập tay 1.000 khi không truyền gì (đường tải tệp lên)', () => {
      const buf = buildCsvBuffer(1005);

      expect(() => extractRecipientsFromBuffer(buf, 'lon.csv', 'text/csv')).toThrow(
        expect.objectContaining({ code: 'RECIPIENTS_LIMIT_EXCEEDED', limit: 1000 })
      );
    });
  });

  describe('extractRecipientsFromGoogleSheet', () => {
    it('throws INVALID_SHEET_URL when url is missing or malformed', async () => {
      await expect(extractRecipientsFromGoogleSheet('')).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_SHEET_URL', statusCode: 400 })
      );
      await expect(extractRecipientsFromGoogleSheet('https://example.com')).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_SPREADSHEET_ID', statusCode: 400 })
      );
    });
  });
});

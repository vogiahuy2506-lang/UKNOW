import { describe, it, expect } from '@jest/globals';
import {
  CSV_BOM,
  CUSTOMER_EXPORT_MAX_ROWS,
  buildCsvLine,
  buildCustomerCsvHeader,
  buildCustomerCsvRow,
  describeEmailStatus,
  escapeCsvCell,
  formatExportDate,
} from '../customerCsv.util.js';

describe('customerCsv.util — file xuất khách', () => {
  it('trần xuất là 10.000 dòng', () => {
    expect(CUSTOMER_EXPORT_MAX_ROWS).toBe(10000);
  });

  it('dòng tiêu đề bắt đầu bằng BOM UTF-8 để Excel đọc đúng tiếng Việt', () => {
    const header = buildCustomerCsvHeader();
    expect(header.charCodeAt(0)).toBe(0xfeff);
    expect(header.startsWith(CSV_BOM)).toBe(true);
    expect(header).toBe(`${CSV_BOM}Họ tên,Email,Số điện thoại,Nguồn dữ liệu,Trạng thái email,Ngày tạo\r\n`);
  });

  describe('escapeCsvCell', () => {
    it('ô thường giữ nguyên; null/undefined thành rỗng', () => {
      expect(escapeCsvCell('Nguyễn An')).toBe('Nguyễn An');
      expect(escapeCsvCell(null)).toBe('');
      expect(escapeCsvCell(undefined)).toBe('');
    });

    it('bọc nháy kép khi có dấu phẩy, nháy kép hoặc xuống dòng; nháy kép được nhân đôi', () => {
      expect(escapeCsvCell('a,b')).toBe('"a,b"');
      expect(escapeCsvCell('nói "xin chào"')).toBe('"nói ""xin chào"""');
      expect(escapeCsvCell('dòng 1\ndòng 2')).toBe('"dòng 1\ndòng 2"');
    });

    it.each([
      ['=HYPERLINK("http://evil","x")'],
      ['+cmd|\' /C calc\'!A0'],
      ['-2+3+cmd'],
      ['@SUM(A1)'],
      ['\t=1+1'],
    ])('chặn CSV injection: ô %p bị chèn dấu nháy đơn đầu ô', (value) => {
      const out = escapeCsvCell(value);
      const raw = out.startsWith('"') ? out.slice(1, -1) : out;
      expect(raw.startsWith("'")).toBe(true);
    });

    it('SĐT dạng số (+84…, có khoảng trắng, dấu chấm) KHÔNG bị chèn nháy để xuất rồi nhập lại vẫn khớp', () => {
      expect(escapeCsvCell('+84912345678')).toBe('+84912345678');
      expect(escapeCsvCell('0912 345 678')).toBe('0912 345 678');
      expect(escapeCsvCell('-5')).toBe('-5');
    });
  });

  it('buildCsvLine nối bằng dấu phẩy, kết thúc CRLF', () => {
    expect(buildCsvLine(['a', 'b,c', null])).toBe('a,"b,c",\r\n');
  });

  describe('describeEmailStatus', () => {
    it('bounce ưu tiên hơn huỷ đăng ký; mặc định là đang nhận', () => {
      expect(describeEmailStatus({ email_hard_bounced: true, email_subscribed: false })).toBe('Bounce');
      expect(describeEmailStatus({ email_hard_bounced: false, email_subscribed: false })).toBe('Đã huỷ nhận');
      expect(describeEmailStatus({ email_hard_bounced: false, email_subscribed: true })).toBe('Đang nhận');
    });
  });

  describe('formatExportDate', () => {
    it('đổi sang giờ Việt Nam (UTC+7), dạng dd/MM/yyyy HH:mm, nửa đêm là 00 chứ không phải 24', () => {
      expect(formatExportDate('2026-10-01T03:05:00.000Z')).toBe('01/10/2026 10:05');
      expect(formatExportDate(new Date('2026-10-01T17:30:00.000Z'))).toBe('02/10/2026 00:30');
    });

    it('rỗng hoặc sai định dạng → chuỗi rỗng', () => {
      expect(formatExportDate(null)).toBe('');
      expect(formatExportDate('không phải ngày')).toBe('');
    });
  });

  it('buildCustomerCsvRow: đủ 6 cột theo đúng thứ tự tiêu đề, nguồn dữ liệu có nhãn tiếng Việt', () => {
    const line = buildCustomerCsvRow({
      full_name: 'Lê, Bình',
      email: 'binh@example.com',
      phone: '0912345678',
      consent_source: 'form_submission',
      email_subscribed: false,
      email_hard_bounced: false,
      created_at: '2026-10-01T03:05:00.000Z',
    });
    expect(line).toBe('"Lê, Bình",binh@example.com,0912345678,Biểu mẫu,Đã huỷ nhận,01/10/2026 10:05\r\n');
  });

  it('nguồn lạ giữ nguyên mã; không có nguồn thì rỗng', () => {
    expect(buildCustomerCsvRow({ consent_source: 'abc', created_at: null })).toContain(',abc,');
    expect(buildCustomerCsvRow({ consent_source: null, created_at: null })).toBe(',,,,Đang nhận,\r\n');
  });
});

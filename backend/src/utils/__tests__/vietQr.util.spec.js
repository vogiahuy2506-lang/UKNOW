import { describe, it, expect } from '@jest/globals';
import { crc16CcittFalse, buildVietQrString, generatePaymentCode, PAYMENT_CODE_LENGTH } from '../vietQr.util.js';
import { parseVietQR } from '../../../../frontend/src/utils/vietqrParser.js';

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-3a mục 3 + §2 "Mẫu VietQR sinh thử".
 * PR-1 mục 1.3: thêm tag 59 (accountName) — dùng assert indirect vì EXPECTED_SAMPLE byte-for-byte
 * phải tính lại khi thêm/bớt tag. Test dưới đây verify từng thuộc tính quan trọng thay vì so cả chuỗi.
 */
describe('vietQr.util — crc16CcittFalse', () => {
  it('vector chuẩn CRC-16/CCITT-FALSE: "123456789" -> "29B1"', () => {
    expect(crc16CcittFalse('123456789')).toBe('29B1');
  });
});

describe('vietQr.util — buildVietQrString', () => {
  it('build(970422, 0123456789, 150000, DL8K3Q2) có header đúng chuẩn, có tag 59, CRC hợp lệ', () => {
    const qr = buildVietQrString({
      bin: '970422',
      accountNumber: '0123456789',
      amount: 150000,
      memo: 'DL8K3Q2',
      accountName: 'NGUYEN VAN A',
    });
    // Header EMVCo + dynamic mode (12)
    expect(qr.startsWith('00020101021238')).toBe(true);
    // GUID Napas
    expect(qr).toContain('0010A000000727');
    // Service code QRIBFTTA
    expect(qr).toContain('0208QRIBFTTA');
    // Currency 704 (VND)
    expect(qr).toContain('5303704');
    // Country VN
    expect(qr).toContain('5802VN');
    // Tag 59 với accountName đúng (length 12, value "NGUYEN VAN A")
    expect(qr).toContain('5912NGUYEN VAN A');
    // Memo trong tag 62-08 (length 11: "08" + "07" + "DL8K3Q2")
    expect(qr).toContain('62110807DL8K3Q2');
    // CRC: 4 ký tự cuối khớp crc16CcittFalse của phần còn lại
    const body = qr.slice(0, -4);
    const crc = qr.slice(-4);
    expect(crc).toBe(crc16CcittFalse(body));
    expect(body.endsWith('6304')).toBe(true);
  });

  it('accountName được cắt (slice) tối đa 25 ký tự theo EMVCo', () => {
    const longName = 'CÔNG TY TNHH GIẢI PHÁP SỐ DIGISO DIGITAL'; // > 25
    const qr = buildVietQrString({
      bin: '970422',
      accountNumber: '0123456789',
      amount: 100000,
      memo: 'TEST',
      accountName: longName,
    });
    // Tìm tag 59: "59" + length 2 chữ số + value
    const idx = qr.indexOf('59', qr.indexOf('5802VN'));
    expect(idx).toBeGreaterThan(-1);
    const len = parseInt(qr.substr(idx + 2, 2), 10);
    expect(len).toBe(25);
  });

  it('accountName rỗng → tag 59 length=00, vẫn sinh chuỗi hợp lệ', () => {
    const qr = buildVietQrString({
      bin: '970422',
      accountNumber: '0123456789',
      amount: 100000,
      memo: 'ABC',
      accountName: '',
    });
    expect(qr).toContain('5900');
    const body = qr.slice(0, -4);
    expect(crc16CcittFalse(body)).toBe(qr.slice(-4));
  });

  it('accountName undefined → tương đương rỗng, không vỡ chuỗi', () => {
    const qr = buildVietQrString({
      bin: '970422',
      accountNumber: '0123456789',
      amount: 100000,
      memo: 'ABC',
    });
    expect(qr).toContain('5900');
  });

  it('khứ hồi: parseVietQR (frontend, không kiểm CRC) đọc lại đúng bin/stk/service/amount/description/merchantName', () => {
    const qr = buildVietQrString({
      bin: '970436',
      accountNumber: '9876543210',
      amount: 2500000,
      memo: 'AB12XY9Z',
      accountName: 'CONG TY ABC',
    });
    const parsed = parseVietQR(qr);
    expect(parsed.valid).toBe(true);
    expect(parsed.bin).toBe('970436');
    expect(parsed.accountNumber).toBe('9876543210');
    expect(parsed.serviceCode).toBe('QRIBFTTA');
    expect(parsed.amount).toBe(2500000);
    expect(parsed.currency).toBe('VND');
    expect(parsed.description).toBe('AB12XY9Z');
    expect(parsed.merchantName).toBe('CONG TY ABC');
  });
});

describe('vietQr.util — generatePaymentCode', () => {
  it(`sinh ${PAYMENT_CODE_LENGTH} ký tự, chỉ trong bảng ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (bỏ 0/O/1/I)`, () => {
    const allowed = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;
    for (let i = 0; i < 1000; i += 1) {
      const code = generatePaymentCode();
      expect(code.length).toBe(PAYMENT_CODE_LENGTH);
      expect(code).toMatch(allowed);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it('1000 lần sinh không trùng nhau quá thường xuyên (không suy biến thành hằng số)', () => {
    const codes = new Set();
    for (let i = 0; i < 1000; i += 1) codes.add(generatePaymentCode());
    // 32^8 khả năng — 1000 lần trùng nhau là gần như không thể nếu không có lỗi logic.
    expect(codes.size).toBeGreaterThan(990);
  });
});

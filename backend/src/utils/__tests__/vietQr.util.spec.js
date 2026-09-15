import { describe, it, expect } from '@jest/globals';
import { crc16CcittFalse, buildVietQrString, generatePaymentCode, PAYMENT_CODE_LENGTH } from '../vietQr.util.js';
import { parseVietQR } from '../../../../frontend/src/utils/vietqrParser.js';

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-3a mục 3 + §2 "Mẫu VietQR sinh thử".
 */
describe('vietQr.util — crc16CcittFalse', () => {
  it('vector chuẩn CRC-16/CCITT-FALSE: "123456789" -> "29B1"', () => {
    expect(crc16CcittFalse('123456789')).toBe('29B1');
  });
});

describe('vietQr.util — buildVietQrString', () => {
  const EXPECTED_SAMPLE =
    '00020101021238540010A00000072701240006970422011001234567890208QRIBFTTA' +
    '530370454061500005802VN62110807DL8K3Q263046B61';

  it('build(970422, 0123456789, 150000, DL8K3Q2) -> ĐÚNG BYTE-FOR-BYTE mẫu ở §2 của plan', () => {
    const qr = buildVietQrString({
      bin: '970422',
      accountNumber: '0123456789',
      amount: 150000,
      memo: 'DL8K3Q2',
    });
    expect(qr).toBe(EXPECTED_SAMPLE);
  });

  it('khứ hồi: parseVietQR (frontend, không kiểm CRC) đọc lại đúng bin/stk/service/amount/description', () => {
    const qr = buildVietQrString({
      bin: '970436',
      accountNumber: '9876543210',
      amount: 2500000,
      memo: 'AB12XY9Z',
    });
    const parsed = parseVietQR(qr);
    expect(parsed.valid).toBe(true);
    expect(parsed.bin).toBe('970436');
    expect(parsed.accountNumber).toBe('9876543210');
    expect(parsed.serviceCode).toBe('QRIBFTTA');
    expect(parsed.amount).toBe(2500000);
    expect(parsed.currency).toBe('VND');
    expect(parsed.description).toBe('AB12XY9Z');
  });

  it('CRC 4 ký tự cuối chuỗi khớp crc16CcittFalse tính trên phần còn lại', () => {
    const qr = buildVietQrString({ bin: '970407', accountNumber: '111222333', amount: 50000, memo: 'XYZ99988' });
    const body = qr.slice(0, -4);
    const crc = qr.slice(-4);
    expect(crc16CcittFalse(body)).toBe(crc);
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

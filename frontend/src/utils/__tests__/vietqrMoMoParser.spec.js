import { describe, it, expect } from 'vitest';
import {
  crc16CcittFalse,
  verifyVietQrChecksum,
  parseVietQR,
  parseAndValidateMoMoQr,
  buildVietQrString,
} from '../vietqrParser';

const tlv = (tag, val) => `${tag}${String(val.length).padStart(2, '0')}${val}`;

function buildTestQr(overrides = {}) {
  const guid = overrides.guid ?? 'A000000727';
  const bin = overrides.bin ?? '971025';
  const account = overrides.account ?? 'PSP2604014212340493';
  const serviceCode = overrides.serviceCode ?? 'QRIBFTTA';
  const refLabel = overrides.refLabel ?? 'MOMOW2W6128717X';

  const sub38_01 = tlv('00', bin) + tlv('01', account);
  const tag38 = tlv('38', tlv('00', guid) + tlv('01', sub38_01) + tlv('02', serviceCode));
  const tag62 = tlv('62', tlv('05', refLabel));
  const body = tlv('00', '01') + tlv('01', '11') + tag38 + tlv('53', '704') + tlv('58', 'VN') + tag62 + '6304';
  const crc = crc16CcittFalse(body);
  return body + crc;
}

describe('PR-3: VietQR MoMo Parser and Validator', () => {
  it('1. Tính đúng CRC-16/CCITT-FALSE với vector chuẩn "123456789" -> "29B1"', () => {
    expect(crc16CcittFalse('123456789')).toBe('29B1');
  });

  it('2. verifyVietQrChecksum xác thực chuỗi chuẩn thành công', () => {
    const validQr = buildTestQr();
    expect(verifyVietQrChecksum(validQr)).toBe(true);
  });

  it('3. Bẫy PR-3: Chuỗi hỏng 1 ký tự CRC hoặc thân chuỗi bị từ chối INVALID_CHECKSUM', () => {
    const validQr = buildTestQr();
    // Thay đổi 1 ký tự trong thân
    const corruptBody = validQr.slice(0, 10) + 'X' + validQr.slice(11);
    expect(verifyVietQrChecksum(corruptBody)).toBe(false);
    expect(parseAndValidateMoMoQr(corruptBody)).toEqual({
      valid: false,
      error: 'INVALID_CHECKSUM',
    });

    // Thay đổi 1 ký tự trong mã CRC 4 ký tự cuối
    const lastChar = validQr.slice(-1);
    const newLastChar = lastChar === 'A' ? 'B' : 'A';
    const corruptCrc = validQr.slice(0, -1) + newLastChar;
    expect(verifyVietQrChecksum(corruptCrc)).toBe(false);
    expect(parseAndValidateMoMoQr(corruptCrc)).toEqual({
      valid: false,
      error: 'INVALID_CHECKSUM',
    });
  });

  it('4. Bẫy PR-3: Chuỗi sai GUID Napas tag 38 (không phải A000000727) bị từ chối INVALID_GUID', () => {
    const wrongGuidQr = buildTestQr({ guid: 'B999999999' });
    const res = parseAndValidateMoMoQr(wrongGuidQr);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('INVALID_GUID');
  });

  it('5. Chuỗi QR MoMo chuẩn VietQR QuickPay: trích xuất đúng BIN 971025, STK PSP..., refLabel', () => {
    const qr = buildTestQr({
      bin: '971025',
      account: 'PSP2604014212340493',
      refLabel: 'MOMOW2W6128717X',
    });
    const res = parseAndValidateMoMoQr(qr);
    expect(res.valid).toBe(true);
    expect(res.momoQrBin).toBe('971025');
    expect(res.momoQrAccount).toBe('PSP2604014212340493');
    expect(res.momoQrRefLabel).toBe('MOMOW2W6128717X');
    expect(res.error).toBeNull();
  });

  it('6. parseVietQR cơ bản vẫn đọc được description và amount khi có', () => {
    const qr = buildTestQr();
    const parsed = parseVietQR(qr);
    expect(parsed.valid).toBe(true);
    expect(parsed.bin).toBe('971025');
    expect(parsed.accountNumber).toBe('PSP2604014212340493');
    expect(parsed.guid).toBe('A000000727');
    expect(parsed.refLabel).toBe('MOMOW2W6128717X');
  });

  describe('PR-4: buildVietQrString ở frontend', () => {
    it('7. Dựng chuỗi VietQR với STK dạng PSP... khớp từng ký tự với backend (mẫu A mục 3.0)', () => {
      const qrStr = buildVietQrString({
        bin: '971025',
        accountNumber: 'PSP2604014212340493',
        amount: 2000,
        memo: 'FAITEST01',
      });
      expect(qrStr).toBe('00020101021238630010A000000727013300069710250119PSP26040142123404930208QRIBFTTA5303704540420005802VN62130809FAITEST01630402BE');
      expect(verifyVietQrChecksum(qrStr)).toBe(true);
    });

    it('8. Dựng chuỗi VietQR với STK dạng SĐT khớp từng ký tự với backend (mẫu 4.0)', () => {
      const qrStr = buildVietQrString({
        bin: '971025',
        accountNumber: '0388180856',
        amount: 2000,
        memo: 'FAITEST02',
      });
      expect(qrStr).toBe('00020101021238540010A00000072701240006971025011003881808560208QRIBFTTA5303704540420005802VN62130809FAITEST0263049DAD');
      expect(verifyVietQrChecksum(qrStr)).toBe(true);
    });
  });
});

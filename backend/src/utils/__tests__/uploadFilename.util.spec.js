import { describe, expect, it } from '@jest/globals';
import { decodeUploadFilename } from '../uploadFilename.util.js';

/** multer 1.x / busboy giải mã tên tệp bằng latin1: mô phỏng đúng đường đó. */
const asMulterSends = (utf8Name) => Buffer.from(utf8Name, 'utf8').toString('latin1');

describe('decodeUploadFilename (A P3-1: "Profile chuyÃªn gia…")', () => {
  it('tên tiếng Việt có dấu bị multer đọc thành mojibake → khôi phục đúng', () => {
    const original = 'Profile chuyên gia Nguyễn Thị Hương - Đà Nẵng.pdf';
    const mojibake = asMulterSends(original);
    expect(mojibake).not.toBe(original);
    expect(mojibake).toContain('Ã');
    expect(decodeUploadFilename(mojibake)).toBe(original);
  });

  it('tên ASCII giữ nguyên', () => {
    expect(decodeUploadFilename('bang-gia-2026.docx')).toBe('bang-gia-2026.docx');
  });

  it('tên ĐÃ là Unicode thật (có ký tự ngoài dải latin1) → giữ nguyên, không chuyển lần hai', () => {
    expect(decodeUploadFilename('Hồ sơ năng lực.pdf')).toBe('Hồ sơ năng lực.pdf');
  });

  it('đã có ký tự ngoài latin1 thì KHÔNG giải mã lại, kể cả khi phần còn lại trông như mojibake (U+0141 sẽ bị cắt thành "A" nếu ép latin1)', () => {
    // "Ã©" (C3 A9 = "é" nếu coi là byte UTF-8) + "Ł" (U+0141, byte thấp 0x41): ép latin1 sẽ ra "éA" hợp lệ — sai.
    const name = `${String.fromCharCode(0xc3, 0xa9, 0x141)}.pdf`;
    expect(decodeUploadFilename(name)).toBe(name);
  });

  it('tên latin1 thật (không phải UTF-8 hợp lệ) như "café.pdf" → giữ nguyên, không biến thành ký tự thay thế', () => {
    const latin1Name = `caf${String.fromCharCode(0xe9)}.pdf`;
    expect(decodeUploadFilename(latin1Name)).toBe(latin1Name);
  });

  it('rỗng / null / undefined → chuỗi rỗng', () => {
    expect(decodeUploadFilename('')).toBe('');
    expect(decodeUploadFilename(null)).toBe('');
    expect(decodeUploadFilename(undefined)).toBe('');
  });
});

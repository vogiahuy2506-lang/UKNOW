import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { validateFile } from '../chatAttachment.service.js';

/**
 * PLAN_TEP_DINH_KEM_LANDING_MOI_DINH_DANG_2026-09-15.md — nghiệm thu ca 1–7.
 *
 * Hai thay đổi được canh ở đây:
 *  - Hạn chế B: quy tắc cũ đòi MIME trình duyệt khai PHẢI khớp đuôi → DOCX gửi từ máy không cài
 *    Office (File.type rỗng → frontend điền application/octet-stream) và CSV trên Windows
 *    (application/vnd.ms-excel) bị từ chối nhầm. Nay tìm quy tắc theo ĐUÔI, magic bytes là chốt thật.
 *  - Hạn chế A: định dạng mới (GIF/HEIC/DOC/XLS) CHỈ mở cho profile 'landing'. Profile mặc định
 *    (chatbot web công khai `persistChatBlob`, ảnh Biểu mẫu `formAsset.service.js`) phải y như cũ.
 */
const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../landing/__tests__/fixtures'
);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const PDF = Buffer.from('%PDF-1.4\n%âãÏÓ\n', 'latin1');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);
const HEIC = fs.readFileSync(path.join(FIXTURES, 'anh-iphone.heic'));
const DOC = fs.readFileSync(path.join(FIXTURES, 'brochure.doc'));

describe('validateFile — MIME khai không còn quyết định (ca 1, 2, 3)', () => {
  it('ca 1: DOCX khai application/octet-stream → nhận, trả MIME chuẩn của DOCX', () => {
    const res = validateFile({ buffer: ZIP, originalName: 'hoso.docx', mimetype: 'application/octet-stream' });
    expect(res).toEqual({
      kind: 'doc',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ext: '.docx',
    });
  });

  it('ca 1b: DOCX không khai MIME (chuỗi rỗng) → vẫn nhận', () => {
    expect(validateFile({ buffer: ZIP, originalName: 'hoso.docx', mimetype: '' }).kind).toBe('doc');
  });

  it('ca 2: CSV khai application/vnd.ms-excel (Windows) → nhận, MIME trả về là text/csv', () => {
    const res = validateFile({ buffer: Buffer.from('ten,gia\nPro,299000\n'), originalName: 'bang-gia.csv', mimetype: 'application/vnd.ms-excel' });
    expect(res.mime).toBe('text/csv');
  });

  it('ca 3: đuôi .pdf nhưng nội dung là PNG → từ chối (magic bytes vẫn là chốt thật)', () => {
    expect(() => validateFile({ buffer: PNG, originalName: 'gia.pdf', mimetype: 'application/pdf' }))
      .toThrow('Nội dung file không khớp định dạng khai báo');
  });

  it('PNG khai octet-stream → nhận (ảnh cũng đi qua đường đuôi + magic)', () => {
    expect(validateFile({ buffer: PNG, originalName: 'logo.png', mimetype: 'application/octet-stream' }).mime).toBe('image/png');
  });
});

describe('validateFile — profile mặc định KHÔNG đổi (ca 4)', () => {
  it('GIF → vẫn từ chối ở chatbot/Biểu mẫu', () => {
    expect(() => validateFile({ buffer: GIF, originalName: 'anh.gif', mimetype: 'image/gif' }))
      .toThrow('Định dạng file không được hỗ trợ');
  });

  it('DOC → vẫn báo "Chỉ nhận .docx"', () => {
    expect(() => validateFile({ buffer: DOC, originalName: 'brochure.doc', mimetype: 'application/msword' }))
      .toThrow('Chỉ nhận .docx');
  });

  it('XLS và HEIC → vẫn từ chối', () => {
    expect(() => validateFile({ buffer: OLE, originalName: 'gia.xls', mimetype: 'application/vnd.ms-excel' }))
      .toThrow('Định dạng file không được hỗ trợ');
    expect(() => validateFile({ buffer: HEIC, originalName: 'anh.heic', mimetype: 'image/heic' }))
      .toThrow('Định dạng file không được hỗ trợ');
  });
});

describe('validateFile — profile landing mở thêm 4 định dạng (ca 5)', () => {
  it.each([
    ['GIF', GIF, 'anh.gif', 'image/gif', 'image', 'image/gif'],
    ['HEIC thật', HEIC, 'anh-iphone.heic', '', 'image', 'image/heic'],
    ['DOC thật', DOC, 'brochure.doc', 'application/octet-stream', 'doc', 'application/msword'],
    ['XLS (magic OLE)', OLE, 'bang-gia.xls', '', 'doc', 'application/vnd.ms-excel'],
    ['PDF vẫn nhận như cũ', PDF, 'brochure.pdf', 'application/pdf', 'doc', 'application/pdf'],
  ])('%s → nhận', (_label, buffer, name, mimetype, kind, mime) => {
    const res = validateFile({ buffer, originalName: name, mimetype, profile: 'landing' });
    expect(res.kind).toBe(kind);
    expect(res.mime).toBe(mime);
  });

  it('.heif dùng chung quy tắc với .heic', () => {
    expect(validateFile({ buffer: HEIC, originalName: 'anh.heif', mimetype: '', profile: 'landing' }).mime).toBe('image/heic');
  });

  it('HEIC đổi tên thành .jpg → từ chối vì nội dung không khớp', () => {
    expect(() => validateFile({ buffer: HEIC, originalName: 'anh.jpg', mimetype: 'image/jpeg', profile: 'landing' }))
      .toThrow('Nội dung file không khớp định dạng khai báo');
  });

  it('đuôi .heic nhưng nội dung không phải ảnh HEIC (thiếu ftyp) → từ chối', () => {
    expect(() => validateFile({ buffer: Buffer.alloc(32, 1), originalName: 'anh.heic', mimetype: 'image/heic', profile: 'landing' }))
      .toThrow('Nội dung file không khớp định dạng khai báo');
  });
});

describe('validateFile — thứ bị cấm vẫn bị cấm ở landing (ca 6, 7)', () => {
  it('ca 6: SVG → từ chối (có thể chứa script)', () => {
    expect(() => validateFile({ buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), originalName: 'logo.svg', mimetype: 'image/svg+xml', profile: 'landing' }))
      .toThrow('Không nhận file SVG');
  });

  it('.ppt cũ → vẫn hướng dẫn lưu thành .pptx', () => {
    expect(() => validateFile({ buffer: OLE, originalName: 'slide.ppt', mimetype: 'application/vnd.ms-powerpoint', profile: 'landing' }))
      .toThrow('Chỉ nhận .pptx');
  });

  it('ca 7: .txt có byte 0x00 trong 8 KB đầu (ảnh đổi tên) → từ chối', () => {
    expect(() => validateFile({ buffer: PNG, originalName: 'ghi-chu.txt', mimetype: 'text/plain', profile: 'landing' }))
      .toThrow('Nội dung file không khớp định dạng khai báo');
  });

  it('.txt khai MIME lạ (text/markdown) → từ chối, chỉ nhận nhóm MIME văn bản', () => {
    expect(() => validateFile({ buffer: Buffer.from('xin chao'), originalName: 'ghi-chu.txt', mimetype: 'text/markdown', profile: 'landing' }))
      .toThrow('Nội dung file không khớp định dạng khai báo');
  });

  it('đuôi lạ (.exe) → từ chối ở cả hai profile', () => {
    expect(() => validateFile({ buffer: Buffer.from('MZ'), originalName: 'virus.exe', mimetype: 'application/octet-stream', profile: 'landing' }))
      .toThrow('Định dạng file không được hỗ trợ');
  });
});

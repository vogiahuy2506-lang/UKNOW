import { describe, expect, it, jest } from '@jest/globals';
import { validateHeaderValue } from 'http';
import {
  UPLOADED_FILE_CSP,
  applyUploadedFileSecurityHeaders,
  buildContentDisposition,
  isInlineSafeMimeType,
  normalizeMimeType,
  resolveFileServePolicy,
} from '../fileServePolicy.util.js';

describe('fileServePolicy.util — chỉ inline loại tệp an toàn', () => {
  it.each([
    ['image/png'],
    ['image/jpeg'],
    ['image/gif'],
    ['image/webp'],
    ['image/avif'],
    ['image/bmp'],
    ['image/x-icon'],
    ['application/pdf'],
    ['text/plain'],
    ['audio/mpeg'],
    ['video/mp4'],
    ['IMAGE/PNG; foo=bar'],
  ])('%s được inline', (type) => {
    expect(isInlineSafeMimeType(type)).toBe(true);
  });

  it.each([
    ['image/svg+xml'],
    ['text/html'],
    ['application/xhtml+xml'],
    ['application/xml'],
    ['text/xml'],
    ['application/javascript'],
    ['text/javascript'],
    ['text/css'],
    ['application/octet-stream'],
    ['application/json'],
    [''],
    ['audio/'],
    ['image/png"\r\nX-Evil: 1'],
  ])('%j KHÔNG được inline', (type) => {
    expect(isInlineSafeMimeType(type)).toBe(false);
  });

  it('normalizeMimeType bỏ tham số, hạ chữ thường, loại giá trị sai cú pháp', () => {
    expect(normalizeMimeType(' Text/Plain; charset=UTF-8 ')).toBe('text/plain');
    expect(normalizeMimeType('not a mime')).toBe('');
    expect(normalizeMimeType(null)).toBe('');
  });

  it('preview ảnh PNG (không khai MIME) → inline, Content-Type suy từ đuôi', () => {
    expect(resolveFileServePolicy({ storageKey: 'uploads/1/a.png', fileName: 'a.png', preview: true })).toEqual({
      contentType: 'image/png',
      inline: true,
      disposition: 'inline',
      isPdf: false,
    });
  });

  it('preview SVG → attachment dù client xin preview', () => {
    const policy = resolveFileServePolicy({ storageKey: 'uploads/1/logo.svg', fileName: 'logo.svg', preview: true });
    expect(policy.inline).toBe(false);
    expect(policy.disposition).toBe('attachment; filename="logo.svg"');
    // Không khai MIME, đuôi ngoài danh sách → để backend tự suy (không ép type).
    expect(policy.contentType).toBe('');
  });

  it('preview SVG có MIME khai báo → attachment, giữ Content-Type khai báo', () => {
    const policy = resolveFileServePolicy({
      mimeType: 'image/svg+xml', storageKey: 'uploads/1/logo.svg', fileName: 'logo.svg', preview: true,
    });
    expect(policy).toMatchObject({ inline: false, contentType: 'image/svg+xml' });
    expect(policy.disposition).toMatch(/^attachment;/);
  });

  it('MIME khai báo text/html cho tệp .png → attachment (không tin đuôi khi đã khai MIME)', () => {
    const policy = resolveFileServePolicy({
      mimeType: 'text/html', storageKey: 'uploads/1/a.png', fileName: 'a.png', preview: true,
    });
    expect(policy).toMatchObject({ inline: false, contentType: 'text/html' });
  });

  it('MIME octet-stream + đuôi .pdf → coi như chưa khai, suy ra PDF inline', () => {
    const policy = resolveFileServePolicy({
      mimeType: 'application/octet-stream', storageKey: 'uploads/1/hd.pdf', fileName: 'hd.pdf', preview: true,
    });
    expect(policy).toEqual({ contentType: 'application/pdf', inline: true, disposition: 'inline', isPdf: true });
  });

  it('text/plain kèm charset utf-8 (cả inline lẫn tải xuống)', () => {
    const policy = resolveFileServePolicy({ storageKey: 'uploads/1/note.txt', preview: true });
    expect(policy).toMatchObject({ inline: true, contentType: 'text/plain; charset=utf-8', isPdf: false });
    const download = resolveFileServePolicy({ mimeType: 'text/plain', storageKey: 'uploads/1/note.txt', fileName: 'note.txt' });
    expect(download).toMatchObject({ inline: false, contentType: 'text/plain; charset=utf-8' });
  });

  it('không preview → luôn attachment kể cả ảnh an toàn', () => {
    const policy = resolveFileServePolicy({ mimeType: 'image/png', storageKey: 'uploads/1/a.png', fileName: 'a.png' });
    expect(policy).toMatchObject({ inline: false, contentType: 'image/png', disposition: 'attachment; filename="a.png"' });
  });

  describe('buildContentDisposition', () => {
    it('tên ASCII giữ nguyên dạng cũ, bỏ dấu nháy kép', () => {
      expect(buildContentDisposition('attachment', 'bao "gia".pdf')).toBe('attachment; filename="bao gia.pdf"');
    });

    it('tên tiếng Việt → fallback ASCII + filename* UTF-8, header hợp lệ với Node', () => {
      const value = buildContentDisposition('attachment', 'Hợp đồng đã ký.pdf');
      expect(value).toBe(
        "attachment; filename=\"Hop dong da ky.pdf\"; filename*=UTF-8''H%E1%BB%A3p%20%C4%91%E1%BB%93ng%20%C4%91%C3%A3%20k%C3%BD.pdf"
      );
      expect(() => validateHeaderValue('Content-Disposition', value)).not.toThrow();
    });

    it('ký tự điều khiển trong tên không phá header', () => {
      const value = buildContentDisposition('attachment', 'a\r\nX-Evil: 1.txt');
      expect(() => validateHeaderValue('Content-Disposition', value)).not.toThrow();
      expect(value).not.toMatch(/[\r\n]/);
    });

    it('tên rỗng → "file"; inline không kèm tên', () => {
      expect(buildContentDisposition('attachment', '')).toBe('attachment; filename="file"');
      expect(buildContentDisposition('inline', 'x.png')).toBe('inline');
    });
  });

  describe('applyUploadedFileSecurityHeaders', () => {
    it('luôn nosniff; CSP sandbox cho loại không phải PDF', () => {
      const res = { setHeader: jest.fn() };
      applyUploadedFileSecurityHeaders(res, { isPdf: false });
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', UPLOADED_FILE_CSP);
      expect(UPLOADED_FILE_CSP).toMatch(/^sandbox;/);
    });

    it('PDF: nosniff nhưng KHÔNG gắn CSP sandbox', () => {
      const res = { setHeader: jest.fn() };
      applyUploadedFileSecurityHeaders(res, { isPdf: true });
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).not.toHaveBeenCalledWith('Content-Security-Policy', expect.anything());
    });
  });
});

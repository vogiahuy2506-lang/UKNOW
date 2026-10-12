import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FORM_FILE_CONFIG,
  FORBIDDEN_FILE_EXTENSIONS,
  FORM_FILE_KIND_EXTS,
  FORM_FILE_KIND_IDS,
  buildAcceptAttribute,
  describeAllowedExtensions,
  formatFileSize,
  getFileExtension,
  makeDefaultFileConfig,
  readFileConfig,
  validateClientFile,
} from '../formFileKinds.util';

/**
 * PR-4b — bản frontend của danh mục loại tệp. Hợp đồng với backend (nhóm, đuôi, danh sách cấm, giới hạn) do
 * backend/src/utils/__tests__/formFileKinds.contract.spec.js giữ; ở đây ghim hành vi thuần của các hàm trợ giúp.
 */

const MB = 1024 * 1024;

describe('danh mục', () => {
  it('9 nhóm đúng thứ tự, mỗi nhóm có đuôi, không đuôi nào nằm trong danh sách cấm', () => {
    expect(FORM_FILE_KIND_IDS).toEqual(['image', 'pdf', 'word', 'excel', 'powerpoint', 'text', 'audio', 'video', 'zip']);
    for (const kind of FORM_FILE_KIND_IDS) {
      expect(FORM_FILE_KIND_EXTS[kind].length).toBeGreaterThan(0);
      for (const ext of FORM_FILE_KIND_EXTS[kind]) expect(FORBIDDEN_FILE_EXTENSIONS).not.toContain(ext);
    }
    for (const ext of ['exe', 'msi', 'bat', 'cmd', 'sh', 'ps1', 'js', 'html', 'svg', 'xml', 'php', 'jar', 'apk', 'dmg', 'scr', 'vbs', 'lnk']) {
      expect(FORBIDDEN_FILE_EXTENSIONS).toContain(ext);
    }
  });

  it('mặc định: Ảnh + PDF, 10 MB, 1 tệp; makeDefaultFileConfig trả bản sao sửa được', () => {
    expect(DEFAULT_FORM_FILE_CONFIG).toEqual({ kinds: ['image', 'pdf'], maxBytes: 10 * MB, maxFiles: 1 });
    const a = makeDefaultFileConfig();
    a.kinds.push('zip');
    expect(makeDefaultFileConfig().kinds).toEqual(['image', 'pdf']);
  });
});

describe('readFileConfig', () => {
  it('giữ cấu hình hợp lệ, xếp nhóm theo thứ tự danh mục, bỏ nhóm lạ', () => {
    expect(readFileConfig({ kinds: ['zip', 'image', 'exe'], maxBytes: 5 * MB, maxFiles: 3 })).toEqual({
      kinds: ['image', 'zip'],
      maxBytes: 5 * MB,
      maxFiles: 3,
    });
  });

  it('thiếu / hỏng → mặc định (không ném lỗi)', () => {
    for (const bad of [undefined, null, 'x', [], {}, { kinds: [] }, { kinds: ['svg'] }, { maxBytes: 'abc', maxFiles: -1 }]) {
      expect(readFileConfig(bad)).toEqual({ kinds: ['image', 'pdf'], maxBytes: 10 * MB, maxFiles: 1 });
    }
  });
});

describe('accept / mô tả đuôi', () => {
  it('buildAcceptAttribute nối đuôi theo nhóm', () => {
    expect(buildAcceptAttribute(['pdf', 'text'])).toBe('.pdf,.txt');
    expect(buildAcceptAttribute(['image'])).toBe('.jpg,.jpeg,.png,.webp,.gif,.heic,.heif');
    expect(buildAcceptAttribute([])).toBe('');
    expect(buildAcceptAttribute(undefined)).toBe('');
  });

  it('describeAllowedExtensions hiển thị cho người dùng', () => {
    expect(describeAllowedExtensions(['pdf', 'word'])).toBe('pdf, doc, docx');
  });
});

describe('validateClientFile', () => {
  const config = { kinds: ['image', 'pdf'], maxBytes: 2 * MB };

  it('đúng loại + đúng cỡ → ok (không phân biệt hoa thường)', () => {
    expect(validateClientFile({ name: 'Anh.PNG', size: 1000 }, config)).toEqual({ ok: true });
    expect(validateClientFile({ name: 'a.pdf', size: 2 * MB }, config)).toEqual({ ok: true });
  });

  it('tệp rỗng, sai loại, quá cỡ, đuôi cấm (kể cả lồng)', () => {
    expect(validateClientFile({ name: 'a.png', size: 0 }, config)).toEqual({ ok: false, reason: 'empty' });
    expect(validateClientFile(null, config)).toEqual({ ok: false, reason: 'empty' });
    expect(validateClientFile({ name: 'a.docx', size: 10 }, config)).toEqual({ ok: false, reason: 'type' });
    expect(validateClientFile({ name: 'README', size: 10 }, config)).toEqual({ ok: false, reason: 'type' });
    expect(validateClientFile({ name: 'a.png', size: 2 * MB + 1 }, config)).toEqual({ ok: false, reason: 'size' });
    expect(validateClientFile({ name: 'virus.exe', size: 10 }, config)).toEqual({ ok: false, reason: 'forbidden' });
    expect(validateClientFile({ name: 'hoadon.exe.pdf', size: 10 }, config)).toEqual({ ok: false, reason: 'forbidden' });
    expect(validateClientFile({ name: 'logo.svg', size: 10 }, config)).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('getFileExtension / formatFileSize', () => {
  it('đuôi cuối, chữ thường', () => {
    expect(getFileExtension('A.B.Pdf')).toBe('pdf');
    expect(getFileExtension('noext')).toBe('');
    expect(getFileExtension('.hidden')).toBe('');
  });

  it('dung lượng dễ đọc theo ngôn ngữ', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(850 * 1024)).toBe('850 KB');
    expect(formatFileSize(10 * MB)).toBe('10 MB');
    expect(formatFileSize(1.5 * 1024 * MB)).toBe('1,5 GB');
    expect(formatFileSize(1.5 * 1024 * MB, 'en')).toBe('1.5 GB');
    expect(formatFileSize(-1)).toBe('');
    expect(formatFileSize('abc')).toBe('');
  });
});

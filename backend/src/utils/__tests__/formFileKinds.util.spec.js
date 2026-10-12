/**
 * PR-4b (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, QĐ7) — danh mục loại tệp khách tải lên biểu mẫu.
 * Ghim: danh mục an toàn (không đuôi nào nằm trong danh sách cấm), chữ ký (magic bytes) TỪNG đuôi, chuẩn hoá `fileConfig`,
 * tên tệp, cờ tính năng. Bảng đuôi/MIME là hằng số nên mỗi phần tử được ghim riêng (it.each), không chỉ đếm.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import {
  CANONICAL_MIME_BY_EXT,
  DEFAULT_FORM_FILE_CONFIG,
  FORBIDDEN_FILE_EXTENSIONS,
  FORM_FILE_KINDS,
  FORM_FILE_KIND_IDS,
  MAX_FORM_FILE_BYTES,
  MAX_FORM_FILE_COUNT,
  MAX_FORM_FILE_NAME_LENGTH,
  MIN_FORM_FILE_BYTES,
  buildAcceptAttribute,
  findForbiddenExtension,
  getFileExtension,
  isDeclaredMimeAcceptable,
  isFormFileUploadEnabled,
  looksLikeExecutable,
  normalizeFormFileConfig,
  resolveFormFileKind,
  sanitizeUploadFileName,
  verifyFileSignature,
} from '../formFileKinds.util.js';

const MB = 1024 * 1024;

describe('danh mục loại tệp', () => {
  it('đúng 9 nhóm theo plan, đúng thứ tự', () => {
    expect([...FORM_FILE_KIND_IDS]).toEqual([
      'image', 'pdf', 'word', 'excel', 'powerpoint', 'text', 'audio', 'video', 'zip',
    ]);
    expect(Object.keys(FORM_FILE_KINDS)).toEqual([...FORM_FILE_KIND_IDS]);
  });

  const EXPECTED_EXTS = {
    image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'],
    pdf: ['pdf'],
    word: ['doc', 'docx'],
    excel: ['xls', 'xlsx', 'csv'],
    powerpoint: ['ppt', 'pptx'],
    text: ['txt'],
    audio: ['mp3', 'm4a', 'wav', 'aac', 'ogg'],
    video: ['mp4', 'mov', 'webm'],
    zip: ['zip'],
  };
  it.each(Object.entries(EXPECTED_EXTS))('nhóm %s có đúng các đuôi %j', (kind, exts) => {
    expect([...FORM_FILE_KINDS[kind].exts]).toEqual(exts);
    for (const ext of exts) {
      expect(CANONICAL_MIME_BY_EXT[ext]).toBeTruthy();
      expect(FORM_FILE_KINDS[kind].mimes).toContain(CANONICAL_MIME_BY_EXT[ext]);
    }
  });

  it('không có đuôi nào ngoài danh mục có MIME chuẩn (không thừa)', () => {
    const all = Object.values(EXPECTED_EXTS).flat().sort();
    expect(Object.keys(CANONICAL_MIME_BY_EXT).sort()).toEqual(all);
  });

  const MUST_BE_FORBIDDEN = [
    'exe', 'msi', 'bat', 'cmd', 'com', 'sh', 'ps1', 'js', 'mjs', 'cjs', 'html', 'htm', 'svg', 'xml', 'xhtml',
    'php', 'jar', 'apk', 'dmg', 'scr', 'vbs', 'lnk',
  ];
  it.each(MUST_BE_FORBIDDEN)('đuôi .%s nằm trong danh sách CẤM tuyệt đối', (ext) => {
    expect(FORBIDDEN_FILE_EXTENSIONS).toContain(ext);
  });

  it('KHÔNG đuôi nào của danh mục an toàn nằm trong danh sách cấm', () => {
    const allowed = Object.values(FORM_FILE_KINDS).flatMap((def) => [...def.exts]);
    const overlap = allowed.filter((ext) => FORBIDDEN_FILE_EXTENSIONS.includes(ext));
    expect(overlap).toEqual([]);
  });

  it('không MIME nào của danh mục là loại chạy được / markup (svg, html, xml, js)', () => {
    const mimes = Object.values(FORM_FILE_KINDS).flatMap((def) => [...def.mimes]);
    for (const mime of mimes) {
      expect(mime).not.toMatch(/svg|html|javascript|ecmascript|x-msdownload|x-sh$|x-executable/i);
      // XML thật (text/xml, application/xml, ...+xml) chứ không phải tên "openxmlformats" của Office.
      expect(mime).not.toMatch(/(^|\/)xml$|\+xml$/i);
    }
  });
});

describe('normalizeFormFileConfig', () => {
  it('vắng cấu hình → mặc định Ảnh + PDF, 10 MB, 1 tệp', () => {
    expect(DEFAULT_FORM_FILE_CONFIG).toEqual({ kinds: ['image', 'pdf'], maxBytes: 10 * MB, maxFiles: 1 });
    expect(normalizeFormFileConfig(undefined)).toEqual({ kinds: ['image', 'pdf'], maxBytes: 10 * MB, maxFiles: 1 });
    expect(normalizeFormFileConfig(null)).toEqual({ kinds: ['image', 'pdf'], maxBytes: 10 * MB, maxFiles: 1 });
    expect(normalizeFormFileConfig({})).toEqual({ kinds: ['image', 'pdf'], maxBytes: 10 * MB, maxFiles: 1 });
  });

  it('giữ giá trị hợp lệ; kinds sắp theo thứ tự danh mục, bỏ trùng, chữ thường', () => {
    expect(normalizeFormFileConfig({ kinds: ['zip', 'IMAGE', 'pdf', 'image'], maxBytes: 5 * MB, maxFiles: 3 })).toEqual({
      kinds: ['image', 'pdf', 'zip'],
      maxBytes: 5 * MB,
      maxFiles: 3,
    });
  });

  it('chấp nhận biên: 1 MB, 1 GB, 1 tệp, 10 tệp; chuỗi số được đổi sang số', () => {
    expect(MIN_FORM_FILE_BYTES).toBe(MB);
    expect(MAX_FORM_FILE_BYTES).toBe(1024 * MB);
    expect(MAX_FORM_FILE_COUNT).toBe(10);
    expect(normalizeFormFileConfig({ maxBytes: MIN_FORM_FILE_BYTES, maxFiles: 1 })).toMatchObject({ maxBytes: MB, maxFiles: 1 });
    expect(normalizeFormFileConfig({ maxBytes: MAX_FORM_FILE_BYTES, maxFiles: 10 })).toMatchObject({ maxBytes: 1024 * MB, maxFiles: 10 });
    expect(normalizeFormFileConfig({ maxBytes: '2097152', maxFiles: '2' })).toMatchObject({ maxBytes: 2 * MB, maxFiles: 2 });
  });

  it.each([
    ['dưới 1 MB', { maxBytes: MB - 1 }],
    ['trên 1 GB', { maxBytes: MAX_FORM_FILE_BYTES + 1 }],
    ['số thập phân', { maxBytes: MB + 0.5 }],
    ['không phải số', { maxBytes: 'lon' }],
    ['0 tệp', { maxFiles: 0 }],
    ['11 tệp', { maxFiles: 11 }],
    ['số tệp thập phân', { maxFiles: 1.5 }],
  ])('từ chối %s bằng 400, không âm thầm sửa', (_name, cfg) => {
    expect(() => normalizeFormFileConfig(cfg)).toThrow(expect.objectContaining({ statusCode: 400, code: 'INVALID_FORM_DEFINITION' }));
  });

  it.each([
    ['nhóm lạ', { kinds: ['image', 'exe'] }],
    ['svg không phải nhóm', { kinds: ['svg'] }],
    ['html không phải nhóm', { kinds: ['html'] }],
    ['rỗng', { kinds: [] }],
    ['không phải mảng', { kinds: 'image' }],
    ['phần tử không phải chuỗi', { kinds: [1] }],
  ])('từ chối kinds: %s', (_name, cfg) => {
    expect(() => normalizeFormFileConfig(cfg)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('từ chối cấu hình không phải đối tượng', () => {
    expect(() => normalizeFormFileConfig('image')).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => normalizeFormFileConfig(['image'])).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('tên tệp / đuôi', () => {
  it('getFileExtension: lấy đuôi cuối, chữ thường; không đuôi → rỗng', () => {
    expect(getFileExtension('Anh.JPG')).toBe('jpg');
    expect(getFileExtension('a.tar.gz')).toBe('gz');
    expect(getFileExtension('README')).toBe('');
    expect(getFileExtension('.bashrc')).toBe('');
    expect(getFileExtension('cuoi.')).toBe('');
  });

  it('findForbiddenExtension bắt cả đuôi lồng ("hoadon.exe.pdf", "anh.php.jpg")', () => {
    expect(findForbiddenExtension('virus.exe')).toBe('exe');
    expect(findForbiddenExtension('hoadon.exe.pdf')).toBe('exe');
    expect(findForbiddenExtension('anh.PHP.jpg')).toBe('php');
    expect(findForbiddenExtension('logo.svg')).toBe('svg');
    expect(findForbiddenExtension('bao-cao-2026.pdf')).toBeNull();
    expect(findForbiddenExtension('exe')).toBeNull(); // tên "exe" không có dấu chấm không phải đuôi
  });

  it('sanitizeUploadFileName: bỏ đường dẫn, ký tự điều khiển/gây rối, giữ tiếng Việt, cắt dài giữ đuôi', () => {
    expect(sanitizeUploadFileName('C:\\Users\\a\\hoso.pdf')).toBe('hoso.pdf');
    expect(sanitizeUploadFileName('../../etc/passwd.txt')).toBe('passwd.txt');
    expect(sanitizeUploadFileName('Hồ sơ  xin việc.docx')).toBe('Hồ sơ xin việc.docx');
    expect(sanitizeUploadFileName('a<b>:c"d|e?.png')).toBe('a_b__c_d_e_.png');
    expect(sanitizeUploadFileName('ten\u0000\u0007moi.png')).toBe('ten moi.png');
    expect(sanitizeUploadFileName('...an.pdf')).toBe('an.pdf');
    expect(sanitizeUploadFileName('')).toBe('');
    expect(sanitizeUploadFileName(undefined)).toBe('');
    const long = sanitizeUploadFileName(`${'a'.repeat(400)}.pdf`);
    expect(long.length).toBeLessThanOrEqual(MAX_FORM_FILE_NAME_LENGTH);
    expect(long.endsWith('.pdf')).toBe(true);
  });
});

describe('resolveFormFileKind', () => {
  it('đuôi thuộc nhóm được phép → ok kèm MIME chuẩn', () => {
    expect(resolveFormFileKind('Anh.JPG', ['image', 'pdf'])).toEqual({ ok: true, kind: 'image', ext: 'jpg', mime: 'image/jpeg' });
    expect(resolveFormFileKind('bao-gia.xlsx', ['excel'])).toMatchObject({ ok: true, kind: 'excel', mime: expect.stringContaining('spreadsheetml') });
    expect(resolveFormFileKind('du-lieu.csv', ['excel'])).toMatchObject({ ok: true, ext: 'csv', mime: 'text/csv' });
  });

  it('đuôi hợp lệ nhưng nhóm chưa được chủ bật → not_allowed', () => {
    expect(resolveFormFileKind('a.pdf', ['image'])).toEqual({ ok: false, reason: 'not_allowed', ext: 'pdf' });
    expect(resolveFormFileKind('a.mp4', ['image', 'pdf'])).toMatchObject({ ok: false, reason: 'not_allowed' });
  });

  it('đuôi cấm → forbidden BẤT KỂ nhóm nào chủ bật', () => {
    for (const name of ['a.exe', 'a.svg', 'a.html', 'a.js', 'a.php', 'a.sh', 'a.exe.pdf']) {
      expect(resolveFormFileKind(name, [...FORM_FILE_KIND_IDS])).toMatchObject({ ok: false, reason: 'forbidden' });
    }
  });

  it('không đuôi → no_extension; đuôi lạ không cấm cũng không nằm trong danh mục → not_allowed', () => {
    expect(resolveFormFileKind('README', [...FORM_FILE_KIND_IDS])).toEqual({ ok: false, reason: 'no_extension' });
    expect(resolveFormFileKind('a.xyz', [...FORM_FILE_KIND_IDS])).toMatchObject({ ok: false, reason: 'not_allowed' });
  });
});

describe('isDeclaredMimeAcceptable', () => {
  it('rỗng / octet-stream được coi là tương thích (trình duyệt hay khai vậy cho .heic, .csv, .m4a); chữ ký mới là chốt', () => {
    expect(isDeclaredMimeAcceptable('', 'heic')).toBe(true);
    expect(isDeclaredMimeAcceptable(undefined, 'csv')).toBe(true);
    expect(isDeclaredMimeAcceptable('application/octet-stream', 'm4a')).toBe(true);
  });

  it('MIME cụ thể phải thuộc nhóm của đuôi', () => {
    expect(isDeclaredMimeAcceptable('image/jpeg', 'jpg')).toBe(true);
    expect(isDeclaredMimeAcceptable('IMAGE/PNG; charset=binary', 'png')).toBe(true);
    expect(isDeclaredMimeAcceptable('application/vnd.ms-excel', 'csv')).toBe(true); // Windows khai csv như vậy
    expect(isDeclaredMimeAcceptable('text/html', 'jpg')).toBe(false);
    expect(isDeclaredMimeAcceptable('image/svg+xml', 'png')).toBe(false);
    expect(isDeclaredMimeAcceptable('application/x-msdownload', 'pdf')).toBe(false);
  });

  it('đuôi ngoài danh mục → không tương thích', () => {
    expect(isDeclaredMimeAcceptable('image/png', 'exe')).toBe(false);
  });
});

describe('buildAcceptAttribute', () => {
  it('nối đuôi của các nhóm, bỏ nhóm lạ', () => {
    expect(buildAcceptAttribute(['pdf', 'text', 'khong-co'])).toBe('.pdf,.txt');
    expect(buildAcceptAttribute(['image'])).toBe('.jpg,.jpeg,.png,.webp,.gif,.heic,.heif');
    expect(buildAcceptAttribute(undefined)).toBe('');
  });
});

// ─── Chữ ký (magic bytes): mỗi đuôi một mẫu đúng ───────────────────────────────────────────────────

const bytes = (...values) => Buffer.from(values);
const ascii = (text) => Buffer.from(text, 'latin1');
const pad = (head, total = 64) => Buffer.concat([head, Buffer.alloc(Math.max(0, total - head.length), 0x20)]);
const ftyp = (brand) => Buffer.concat([bytes(0, 0, 0, 0x18), ascii('ftyp'), ascii(brand), Buffer.alloc(16)]);

const VALID_SAMPLES = {
  jpg: pad(bytes(0xff, 0xd8, 0xff, 0xe0)),
  jpeg: pad(bytes(0xff, 0xd8, 0xff, 0xdb)),
  png: pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
  gif: pad(ascii('GIF89a')),
  webp: pad(Buffer.concat([ascii('RIFF'), bytes(0x10, 0, 0, 0), ascii('WEBPVP8 ')])),
  heic: ftyp('heic'),
  heif: ftyp('mif1'),
  pdf: pad(ascii('%PDF-1.7\n')),
  doc: pad(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)),
  xls: pad(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)),
  ppt: pad(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)),
  docx: pad(bytes(0x50, 0x4b, 0x03, 0x04)),
  xlsx: pad(bytes(0x50, 0x4b, 0x03, 0x04)),
  pptx: pad(bytes(0x50, 0x4b, 0x03, 0x04)),
  zip: pad(bytes(0x50, 0x4b, 0x03, 0x04)),
  csv: ascii('ho_ten,so_dien_thoai\nNguyen Van A,0901234567\n'),
  txt: ascii('Xin chao, day la tep van ban thuan.\n'),
  mp3: pad(ascii('ID3')),
  m4a: ftyp('M4A '),
  wav: pad(Buffer.concat([ascii('RIFF'), bytes(0x24, 0, 0, 0), ascii('WAVEfmt ')])),
  aac: pad(bytes(0xff, 0xf1, 0x50, 0x80)),
  ogg: pad(ascii('OggS')),
  mp4: ftyp('isom'),
  mov: ftyp('qt  '),
  webm: pad(bytes(0x1a, 0x45, 0xdf, 0xa3)),
};

describe('verifyFileSignature — mẫu đúng của từng đuôi trong danh mục', () => {
  it('có mẫu cho MỌI đuôi của danh mục (thêm đuôi mà quên mẫu thì đỏ)', () => {
    const allExts = Object.values(FORM_FILE_KINDS).flatMap((def) => [...def.exts]).sort();
    expect(Object.keys(VALID_SAMPLES).sort()).toEqual(allExts);
  });

  it.each(Object.entries(VALID_SAMPLES))('.%s: chữ ký đúng → ok', (ext, sample) => {
    expect(verifyFileSignature(ext, sample)).toEqual({ ok: true });
  });
});

describe('verifyFileSignature — đổi đuôi / giả mạo bị chặn', () => {
  const EXE = pad(Buffer.concat([ascii('MZ'), bytes(0x90, 0, 3, 0)]));
  const ELF = pad(bytes(0x7f, 0x45, 0x4c, 0x46, 2, 1, 1));
  const MACHO = pad(bytes(0xcf, 0xfa, 0xed, 0xfe));
  const JAVA_CLASS = pad(bytes(0xca, 0xfe, 0xba, 0xbe));

  it.each([
    ['PE (MZ)', EXE],
    ['ELF', ELF],
    ['Mach-O', MACHO],
    ['Java class', JAVA_CLASS],
  ])('tệp thực thi %s đổi sang MỌI đuôi đều bị từ chối với lý do executable', (_name, sample) => {
    expect(looksLikeExecutable(sample)).toBe(true);
    for (const ext of Object.keys(VALID_SAMPLES)) {
      expect(verifyFileSignature(ext, sample)).toEqual({ ok: false, reason: 'executable' });
    }
  });

  it('.exe đổi thành .jpg bị chặn ở bước xác nhận nội dung', () => {
    expect(verifyFileSignature('jpg', EXE)).toEqual({ ok: false, reason: 'executable' });
  });

  it('chữ ký của loại khác với đuôi → mismatch (PNG đặt tên .jpg, PDF đặt tên .png, zip đặt tên .pdf)', () => {
    expect(verifyFileSignature('jpg', VALID_SAMPLES.png)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyFileSignature('png', VALID_SAMPLES.pdf)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyFileSignature('pdf', VALID_SAMPLES.zip)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyFileSignature('mp4', VALID_SAMPLES.mp3)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyFileSignature('docx', VALID_SAMPLES.pdf)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('PDF chỉ cần "%PDF-" trong 1024 byte đầu, nhưng không có thì từ chối', () => {
    const lateHeader = Buffer.concat([Buffer.alloc(900, 0x20), ascii('%PDF-1.4')]);
    expect(verifyFileSignature('pdf', lateHeader)).toEqual({ ok: true });
    expect(verifyFileSignature('pdf', Buffer.alloc(1024, 0x20))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('HEIC phải có thương hiệu ftyp họ HEIF (mp4 "isom" đặt tên .heic bị chặn)', () => {
    expect(verifyFileSignature('heic', ftyp('isom'))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('.txt/.csv: nhị phân (có byte NUL) bị chặn', () => {
    const binary = Buffer.concat([ascii('abc'), bytes(0, 1, 2, 3), ascii('def')]);
    expect(verifyFileSignature('txt', binary)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyFileSignature('csv', binary)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('.txt/.csv: nội dung HTML / SVG / XML / PHP bị chặn dù đặt tên văn bản', () => {
    for (const markup of [
      '<!DOCTYPE html><html><script>alert(1)</script></html>',
      '<html><body>x</body></html>',
      '  \n<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
      '<?xml version="1.0"?><a/>',
      '<?php system($_GET["c"]); ?>',
      '\uFEFF<script>alert(1)</script>',
    ]) {
      expect(verifyFileSignature('txt', Buffer.from(markup, 'utf8'))).toEqual({ ok: false, reason: 'mismatch' });
      expect(verifyFileSignature('csv', Buffer.from(markup, 'utf8'))).toEqual({ ok: false, reason: 'mismatch' });
    }
  });

  it('.txt: UTF-16 có BOM (Notepad Windows) và văn bản tiếng Việt UTF-8 được nhận', () => {
    expect(verifyFileSignature('txt', Buffer.concat([bytes(0xff, 0xfe), Buffer.from('a\u0000b\u0000', 'latin1')]))).toEqual({ ok: true });
    expect(verifyFileSignature('txt', Buffer.from('Họ tên: Nguyễn Văn A\r\n', 'utf8'))).toEqual({ ok: true });
  });

  it('tệp rỗng và đuôi ngoài danh mục', () => {
    expect(verifyFileSignature('jpg', Buffer.alloc(0))).toEqual({ ok: false, reason: 'empty' });
    expect(verifyFileSignature('svg', ascii('<svg/>'))).toEqual({ ok: false, reason: 'unknown_extension' });
    expect(verifyFileSignature('exe', EXE)).toEqual({ ok: false, reason: 'executable' });
  });
});

describe('isFormFileUploadEnabled (cờ FORM_FILE_UPLOAD_ENABLED)', () => {
  const original = process.env.FORM_FILE_UPLOAD_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.FORM_FILE_UPLOAD_ENABLED;
    else process.env.FORM_FILE_UPLOAD_ENABLED = original;
  });

  it('MẶC ĐỊNH TẮT (chưa đặt biến)', () => {
    delete process.env.FORM_FILE_UPLOAD_ENABLED;
    expect(isFormFileUploadEnabled()).toBe(false);
  });

  it('chỉ "true" (không phân biệt hoa thường) mới bật; giá trị khác đều tắt', () => {
    for (const v of ['true', 'TRUE', ' True ']) {
      process.env.FORM_FILE_UPLOAD_ENABLED = v;
      expect(isFormFileUploadEnabled()).toBe(true);
    }
    for (const v of ['', 'false', '1', 'yes', 'on', '0']) {
      process.env.FORM_FILE_UPLOAD_ENABLED = v;
      expect(isFormFileUploadEnabled()).toBe(false);
    }
  });

  it('đọc LÚC GỌI, đổi biến là đổi kết quả ngay (không cache)', () => {
    process.env.FORM_FILE_UPLOAD_ENABLED = 'true';
    expect(isFormFileUploadEnabled()).toBe(true);
    process.env.FORM_FILE_UPLOAD_ENABLED = 'false';
    expect(isFormFileUploadEnabled()).toBe(false);
  });
});

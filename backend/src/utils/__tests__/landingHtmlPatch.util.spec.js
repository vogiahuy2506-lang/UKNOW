import { describe, expect, it } from '@jest/globals';
import { applyHtmlEdits } from '../landingHtmlPatch.util.js';

const catchError = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('Kỳ vọng hàm ném lỗi nhưng không ném');
};

describe('applyHtmlEdits — tầng khớp chính xác', () => {
  it('khớp chính xác 1 lần → thay đúng chỗ, phần còn lại byte-identical', () => {
    const html = '<body>\n  <h1>Chào</h1>\n  <p>Nội dung</p>\n</body>';
    const { html: out, applied } = applyHtmlEdits(html, [{ find: '<h1>Chào</h1>', replace: '<h1>Xin chào</h1>' }]);
    expect(out).toBe('<body>\n  <h1>Xin chào</h1>\n  <p>Nội dung</p>\n</body>');
    expect(applied).toBe(1);
  });

  it('find xuất hiện 2 lần → AMBIGUOUS kèm details.index', () => {
    const html = '<p>a</p><p>b</p><p>a</p>';
    const err = catchError(() => applyHtmlEdits(html, [{ find: '<p>b</p>', replace: '<p>B</p>' }, { find: '<p>a</p>', replace: 'x' }]));
    expect(err.code).toBe('LANDING_PATCH_AMBIGUOUS');
    expect(err.details.index).toBe(1);
  });

  it('đếm cả vị trí CHỒNG LẤN: find "aa" trong "aaa" → AMBIGUOUS (không phải khớp 1 lần)', () => {
    const err = catchError(() => applyHtmlEdits('<p>aaa</p>', [{ find: 'aa', replace: 'b' }]));
    expect(err.code).toBe('LANDING_PATCH_AMBIGUOUS');
    expect(err.details.index).toBe(0);
  });

  it('không khớp → NOT_FOUND, details.index đúng thứ tự edit', () => {
    const html = '<p>a</p><p>b</p>';
    const err = catchError(() =>
      applyHtmlEdits(html, [
        { find: '<p>a</p>', replace: '<p>A</p>' },
        { find: '<p>zzz</p>', replace: 'x' },
      ])
    );
    expect(err.code).toBe('LANDING_PATCH_NOT_FOUND');
    expect(err.details.index).toBe(1);
  });

  it('replace rỗng → xoá đoạn', () => {
    const { html } = applyHtmlEdits('<div><p>bỏ</p><p>giữ</p></div>', [{ find: '<p>bỏ</p>', replace: '' }]);
    expect(html).toBe('<div><p>giữ</p></div>');
  });

  it('thêm nội dung bằng replace = find + mới', () => {
    const { html } = applyHtmlEdits('<div><p>a</p></div>', [{ find: '<p>a</p>', replace: '<p>a</p><p>mới</p>' }]);
    expect(html).toBe('<div><p>a</p><p>mới</p></div>');
  });

  it('2 edit tuần tự: edit 2 tìm đoạn do edit 1 tạo ra → được', () => {
    const { html, applied } = applyHtmlEdits('<h1>Cũ</h1>', [
      { find: '<h1>Cũ</h1>', replace: '<h1>Trung gian</h1>' },
      { find: 'Trung gian', replace: 'Mới' },
    ]);
    expect(html).toBe('<h1>Mới</h1>');
    expect(applied).toBe(2);
  });

  it('replace chứa $&, $1, $$, $` → ra NGUYÊN VĂN (không dùng String.replace)', () => {
    const replace = 'Giá $& hoặc $1 hoặc $$99 hoặc $` hoặc $\'';
    const { html } = applyHtmlEdits('<p>giá</p>', [{ find: '<p>giá</p>', replace }]);
    expect(html).toBe(replace);
  });

  it('không sửa chuỗi đầu vào (hàm thuần)', () => {
    const html = '<p>a</p>';
    const edits = [{ find: '<p>a</p>', replace: '<p>b</p>' }];
    applyHtmlEdits(html, edits);
    expect(html).toBe('<p>a</p>');
    expect(edits).toEqual([{ find: '<p>a</p>', replace: '<p>b</p>' }]);
  });
});

describe('applyHtmlEdits — tầng khớp nới khoảng trắng', () => {
  it('find khác thụt lề/xuống dòng so với gốc → khớp tầng 2, thay đúng đoạn gốc', () => {
    const html = '<section>\n  <div>\n    <p>Chào</p>\n  </div>\n</section>';
    const { html: out } = applyHtmlEdits(html, [{ find: '<div><p>Chào</p></div>', replace: '<div><p>Tạm biệt</p></div>' }]);
    expect(out).toBe('<section>\n  <div><p>Tạm biệt</p></div>\n</section>');
  });

  it('gốc <div>\\n    <p>Chào</p>, find "<div><p>Chào</p>" → khớp tầng 2', () => {
    const { html } = applyHtmlEdits('<div>\n    <p>Chào</p>\n</div>', [{ find: '<div><p>Chào</p>', replace: '<div><p>Hi</p>' }]);
    expect(html).toBe('<div><p>Hi</p>\n</div>');
  });

  it('khoảng trắng giữa các từ: nhiều dấu cách/xuống dòng trong gốc vẫn khớp find một dấu cách', () => {
    const { html } = applyHtmlEdits('<p>Đăng   ký\n  ngay</p>', [{ find: 'Đăng ký ngay', replace: 'Mua ngay' }]);
    expect(html).toBe('<p>Mua ngay</p>');
  });

  it('khớp tầng 2 nhưng ra 2 chỗ → AMBIGUOUS', () => {
    const html = '<ul>\n  <li>\n    <b>x</b>\n  </li>\n  <li>\n    <b>x</b>\n  </li>\n</ul>';
    const err = catchError(() => applyHtmlEdits(html, [{ find: '<li><b>x</b></li>', replace: 'y' }]));
    expect(err.code).toBe('LANDING_PATCH_AMBIGUOUS');
    expect(err.details.index).toBe(0);
  });

  it('tầng 2 không khớp → NOT_FOUND', () => {
    const err = catchError(() => applyHtmlEdits('<div>\n  <p>a</p>\n</div>', [{ find: '<div><p>b</p></div>', replace: 'x' }]));
    expect(err.code).toBe('LANDING_PATCH_NOT_FOUND');
  });

  it('find chứa ký tự regex (. ( [ * ? + | \\) → khớp tầng 2 đúng, không ném SyntaxError', () => {
    const html = '<p>\n  a.b (c) [d] * e ? f + g | h \\ i\n</p>';
    const find = '<p> a.b (c) [d] * e ? f + g | h \\ i </p>';
    const { html: out } = applyHtmlEdits(html, [{ find, replace: '<p>ok</p>' }]);
    expect(out).toBe('<p>ok</p>');
  });

  it('find chứa ký tự regex không khớp gì → NOT_FOUND chứ không phải SyntaxError', () => {
    const err = catchError(() => applyHtmlEdits('<p>abc</p>', [{ find: '<p>(a|b</p>', replace: 'x' }]));
    expect(err.code).toBe('LANDING_PATCH_NOT_FOUND');
  });

  it('ký tự regex trong find không được hiểu là regex: "a.c" không khớp "abc"', () => {
    const err = catchError(() => applyHtmlEdits('<p>\n abc\n</p>', [{ find: '<p> a.c </p>', replace: 'x' }]));
    expect(err.code).toBe('LANDING_PATCH_NOT_FOUND');
  });
});

describe('applyHtmlEdits — đầu vào sai', () => {
  it.each([
    ['không phải mảng (undefined)', undefined],
    ['không phải mảng (object)', { find: 'a', replace: 'b' }],
    ['mảng rỗng', []],
  ])('edits %s → LANDING_PATCH_EMPTY', (_label, edits) => {
    expect(catchError(() => applyHtmlEdits('<p>a</p>', edits)).code).toBe('LANDING_PATCH_EMPTY');
  });

  it.each([
    ['find rỗng', { find: '', replace: 'x' }],
    ['find toàn khoảng trắng', { find: '  \n ', replace: 'x' }],
    ['thiếu find', { replace: 'x' }],
    ['find không phải string', { find: 5, replace: 'x' }],
    ['thiếu replace', { find: '<p>a</p>' }],
    ['replace không phải string', { find: '<p>a</p>', replace: null }],
    ['phần tử null', null],
  ])('%s → LANDING_PATCH_INVALID kèm details.index', (_label, edit) => {
    const err = catchError(() => applyHtmlEdits('<p>a</p>', [{ find: '<p>a</p>', replace: '<p>a</p>' }, edit]));
    expect(err.code).toBe('LANDING_PATCH_INVALID');
    expect(err.details.index).toBe(1);
  });
});

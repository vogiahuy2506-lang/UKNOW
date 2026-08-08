import { _toZcaCookieShapeForTests as toZcaCookieShape } from '../zaloSessionRestore.util.js';

/**
 * zca-js `Zalo.parseCookies` (dist/zalo.js:14-16):
 *   const cookieArr = Array.isArray(cookie) ? cookie : cookie.cookies;
 *   cookieArr.forEach(...)
 *
 * Bất cứ thứ gì không phải mảng và không có `.cookies` đều ném
 * "Cannot read properties of undefined (reading 'forEach')".
 * Bộ test này khoá lại: ta không bao giờ đưa hình dạng đó cho zca-js nữa.
 */

/** Mô phỏng đúng phép truy cập của zca-js. */
function zcaWouldCrash(cookie) {
  try {
    const arr = Array.isArray(cookie) ? cookie : cookie.cookies;
    arr.forEach(() => {});
    return false;
  } catch {
    return true;
  }
}

const COOKIE = [{ key: 'zpsid', value: 'abc', domain: '.zalo.me' }];

describe('toZcaCookieShape', () => {
  it('giữ nguyên mảng cookie', () => {
    expect(toZcaCookieShape(COOKIE)).toEqual(COOKIE);
  });

  it('giữ nguyên { cookies: [...] }', () => {
    const input = { cookies: COOKIE };
    expect(toZcaCookieShape(input)).toEqual(input);
  });

  it('bóc { cookie: [...] } thành mảng', () => {
    expect(toZcaCookieShape({ cookie: COOKIE })).toEqual(COOKIE);
  });

  it('parse được chuỗi JSON hợp lệ', () => {
    expect(toZcaCookieShape(JSON.stringify({ cookies: COOKIE }))).toEqual({ cookies: COOKIE });
  });

  it.each([
    ['chuỗi cookie thô', 'zpsid=abc; zpw_sek=def'],
    ['chuỗi rỗng', '   '],
    ['JSON hỏng', '{not json'],
    ['object rỗng', {}],
    ['mảng rỗng', []],
    ['cookies rỗng', { cookies: [] }],
    ['null', null],
    ['số', 12345],
  ])('loại bỏ %s (zca-js sẽ nổ nếu để lọt)', (_label, input) => {
    expect(toZcaCookieShape(input)).toBeNull();
  });

  it('mọi giá trị được chấp nhận đều KHÔNG làm zca-js nổ', () => {
    const accepted = [COOKIE, { cookies: COOKIE }, { cookie: COOKIE }, JSON.stringify(COOKIE)]
      .map(toZcaCookieShape)
      .filter(Boolean);

    expect(accepted).toHaveLength(4);
    for (const value of accepted) {
      expect(zcaWouldCrash(value)).toBe(false);
    }
  });

  it('chuỗi cookie thô — thứ đang gây lỗi trên production — bị loại trước khi tới zca-js', () => {
    const raw = 'zpsid=abc; zpw_sek=def';
    expect(zcaWouldCrash(raw)).toBe(true); // zca-js sẽ nổ
    expect(toZcaCookieShape(raw)).toBeNull(); // ta chặn từ trước
  });
});

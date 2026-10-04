/**
 * H-33 — gấp dấu tiếng Việt để "nguyen" khớp "Nguyễn". JS và SQL dùng CHUNG một bảng ký tự.
 */
import { describe, it, expect } from '@jest/globals';
import {
  VN_FOLD_FROM,
  VN_FOLD_TO,
  buildFoldedLikePattern,
  escapeLikePattern,
  foldVietnamese,
  sqlFoldVietnamese,
} from '../vietnameseSearchFold.util.js';

describe('foldVietnamese', () => {
  it('bỏ dấu và hạ chữ thường: Nguyễn Văn Đức → nguyen van duc', () => {
    expect(foldVietnamese('Nguyễn Văn Đức')).toBe('nguyen van duc');
    expect(foldVietnamese('PHÒNG RD 2 DIGISO')).toBe('phong rd 2 digiso');
    expect(foldVietnamese('Đức Hải')).toBe('duc hai');
  });

  it('gấp được cả đủ 12 nguyên âm có dấu thanh + mũ/móc', () => {
    expect(foldVietnamese('ẳẵặằắ ểễệềế ỉĩị ổỗộồố ởỡợờớ ửữựừứ ỷỹỵỳý')).toBe('aaaaa eeeee iii ooooo ooooo uuuuu yyyyy');
  });

  it('chữ dựng sẵn và chữ tổ hợp (NFD) cho cùng kết quả', () => {
    const composed = 'Nguyễn';
    const decomposed = composed.normalize('NFD');
    expect(foldVietnamese(decomposed)).toBe(foldVietnamese(composed));
    expect(foldVietnamese(decomposed)).toBe('nguyen');
  });

  it('null / undefined → rỗng; ký tự ngoài bảng giữ nguyên', () => {
    expect(foldVietnamese(null)).toBe('');
    expect(foldVietnamese(undefined)).toBe('');
    expect(foldVietnamese('ABC-123 😀')).toBe('abc-123 😀');
  });
});

describe('bảng SQL translate()', () => {
  it('nguồn và đích cùng độ dài (translate() mà đích ngắn hơn sẽ XOÁ chữ), không chứa dấu nháy', () => {
    expect([...VN_FOLD_FROM].length).toBe([...VN_FOLD_TO].length);
    expect(VN_FOLD_FROM).not.toContain("'");
    expect(VN_FOLD_TO).toMatch(/^[a-z]+$/);
  });

  it('mỗi ký tự trong bảng cho cùng kết quả ở phía JS và phía SQL (dựng lại translate bằng JS)', () => {
    const from = [...VN_FOLD_FROM];
    const to = [...VN_FOLD_TO];
    const sqlTranslate = (str) => [...str].map((ch) => {
      const i = from.indexOf(ch);
      return i === -1 ? ch : to[i];
    }).join('');
    for (const ch of from) {
      expect(sqlTranslate(ch)).toBe(foldVietnamese(ch));
    }
  });

  it('sqlFoldVietnamese bọc biểu thức server viết, không nối input', () => {
    expect(sqlFoldVietnamese('zp.visitor_name')).toMatch(/^translate\(lower\(zp\.visitor_name\), '[^']+', '[^']+'\)$/);
  });
});

describe('buildFoldedLikePattern', () => {
  it('gấp dấu và thoát ký tự đại diện LIKE', () => {
    expect(buildFoldedLikePattern('Nguyễn')).toBe('%nguyen%');
    expect(buildFoldedLikePattern('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
    expect(escapeLikePattern('a%b')).toBe('a\\%b');
  });
});

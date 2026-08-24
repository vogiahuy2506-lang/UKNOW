import { describe, expect, it } from '@jest/globals';
import {
  normalizeCaption,
  listCaptionSlots,
  replaceCaptionWithImage,
  replaceImageSrcByCaption,
} from '../helpCaptionReplace.util.js';
import { stripTags, extractImageSrcs } from '../helpArticleListRepair.util.js';
import { HELP_SEED_ARTICLES } from '../../services/help/helpSeed.data.js';

describe('helpCaptionReplace.normalizeCaption', () => {
  it('giải mã thực thể HTML và bỏ dấu nháy để khoá viết thẳng vẫn khớp', () => {
    expect(normalizeCaption('khoanh đỏ mục &quot;Mua thêm hạn mức&quot;'))
      .toBe(normalizeCaption('khoanh đỏ mục "Mua thêm hạn mức"'));
  });

  it('gom khoảng trắng và không phân biệt hoa thường', () => {
    expect(normalizeCaption('  Thanh   NGANG\ntrên cùng ')).toBe('thanh ngang trên cùng');
  });
});

describe('helpCaptionReplace.listCaptionSlots', () => {
  it('tìm đúng vị trí từng ô, giữ nguyên chữ trong ô', () => {
    const html = '<p>mở đầu</p><p>[ẢNH: màn hình A]</p><p>giữa</p><p>[ẢNH: màn hình B]</p>';
    const slots = listCaptionSlots(html);
    expect(slots.map((s) => s.text)).toEqual(['màn hình A', 'màn hình B']);
    expect(html.slice(slots[0].start, slots[0].end)).toBe('<p>[ẢNH: màn hình A]</p>');
  });

  it('không nhầm đoạn văn thường là ô chú thích', () => {
    expect(listCaptionSlots('<p>Bài này nói về [một thứ] khác</p>')).toEqual([]);
  });

  it('an toàn với đầu vào rỗng', () => {
    expect(listCaptionSlots('')).toEqual([]);
    expect(listCaptionSlots(null)).toEqual([]);
  });
});

describe('helpCaptionReplace.replaceCaptionWithImage', () => {
  const html = '<p>mở đầu</p><p>[ẢNH: thanh ngang trên cùng, khoanh đỏ nút &quot;Nâng cấp&quot;]</p>'
    + '<p>giữa</p><p>[ẢNH: bảng giá với các gói xếp ngang]</p>';

  it('thay đúng ô và giữ nguyên phần còn lại', () => {
    const out = replaceCaptionWithImage(html, 'bảng giá với các gói xếp ngang', '/u/pricing.png');
    expect(out.ok).toBe(true);
    expect(extractImageSrcs(out.html)).toEqual(['/u/pricing.png']);
    expect(out.html).toContain('[ẢNH: thanh ngang trên cùng');   // ô kia còn nguyên
    expect(out.html).toContain('<p>giữa</p>');
  });

  it('lấy chính chú thích làm alt, có thoát ký tự', () => {
    const out = replaceCaptionWithImage(html, 'thanh ngang trên cùng', '/u/top.png');
    expect(out.html).toContain('alt="thanh ngang trên cùng, khoanh đỏ nút &quot;Nâng cấp&quot;"');
  });

  it('khoá viết dấu nháy thẳng vẫn khớp chú thích đã sanitize', () => {
    const out = replaceCaptionWithImage(html, 'khoanh đỏ nút "Nâng cấp"', '/u/top.png');
    expect(out.ok).toBe(true);
  });

  it('từ chối khi khoá khớp nhiều ô — không để máy tự chọn', () => {
    const twin = '<p>[ẢNH: menu bên trái, mục A]</p><p>[ẢNH: menu bên trái, mục B]</p>';
    const out = replaceCaptionWithImage(twin, 'menu bên trái', '/u/x.png');
    expect(out.ok).toBe(false);
    expect(out.matches).toBe(2);
    expect(out.reason).toMatch(/cần khoá riêng hơn/);
  });

  it('từ chối khi không khớp ô nào', () => {
    expect(replaceCaptionWithImage(html, 'màn hình không tồn tại', '/u/x.png').ok).toBe(false);
  });

  it('từ chối khi thiếu khoá hoặc thiếu URL', () => {
    expect(replaceCaptionWithImage(html, '', '/u/x.png').ok).toBe(false);
    expect(replaceCaptionWithImage(html, 'bảng giá', '').ok).toBe(false);
  });

  it('không đổi chữ nào ngoài chính ô bị thay', () => {
    const out = replaceCaptionWithImage(html, 'bảng giá với các gói xếp ngang', '/u/p.png');
    const expected = stripTags(html.replace('<p>[ẢNH: bảng giá với các gói xếp ngang]</p>', ''));
    expect(stripTags(out.html)).toBe(expected);
  });

  it('chạy được trên bài mẫu thật', () => {
    const article = HELP_SEED_ARTICLES.find((a) => a.slug === 'doi-goi');
    const slots = listCaptionSlots(article.body_html);
    expect(slots.length).toBeGreaterThan(0);
    const out = replaceCaptionWithImage(article.body_html, slots[0].text, '/u/real.png');
    expect(out.ok).toBe(true);
    expect(listCaptionSlots(out.html)).toHaveLength(slots.length - 1);
  });
});

describe('helpCaptionReplace.replaceImageSrcByCaption', () => {
  // Ảnh đã chèn thì không còn ô "[ẢNH: …]" để bám vào, nên chụp lại không thay
  // được ảnh cũ. Đã có một ảnh sai nằm trên bài chạy thật đúng vì lý do này.
  const html = '<p>a</p><img src="https://cu.png" alt="mục Lỗi gần đây">'
    + '<p>b</p><img src="https://khac.png" alt="mục Hiệu quả theo kênh">';

  it('đổi src của đúng ảnh khớp alt, giữ nguyên alt và các ảnh khác', () => {
    const out = replaceImageSrcByCaption(html, 'mục Lỗi gần đây', 'https://moi.png');
    expect(out.ok).toBe(true);
    expect(out.oldSrc).toBe('https://cu.png');
    expect(out.html).toContain('src="https://moi.png" alt="mục Lỗi gần đây"');
    expect(out.html).toContain('https://khac.png');
  });

  it('từ chối khi khoá khớp nhiều hơn một ảnh', () => {
    const dup = `${html}<img src="https://c.png" alt="mục Lỗi gần đây lần hai">`;
    const out = replaceImageSrcByCaption(dup, 'mục Lỗi gần đây', 'https://x.png');
    expect(out.ok).toBe(false);
    expect(out.matches).toBe(2);
  });

  it('từ chối khi không ảnh nào khớp, khi thiếu khoá hoặc thiếu URL', () => {
    expect(replaceImageSrcByCaption(html, 'không có thật', 'https://x.png').ok).toBe(false);
    expect(replaceImageSrcByCaption(html, '', 'https://x.png').ok).toBe(false);
    expect(replaceImageSrcByCaption(html, 'mục Lỗi gần đây', '').ok).toBe(false);
  });

  it('từ chối thẻ img khớp alt nhưng không có src', () => {
    const out = replaceImageSrcByCaption('<img alt="mục Lỗi gần đây">', 'mục Lỗi gần đây', 'https://x.png');
    expect(out.ok).toBe(false);
  });

  it('khớp được khi alt trong DB đang ở dạng thực thể HTML', () => {
    const enc = '<img src="https://cu.png" alt="khoanh đỏ nút &quot;Áp dụng&quot;">';
    expect(replaceImageSrcByCaption(enc, 'khoanh đỏ nút "Áp dụng"', 'https://m.png').ok).toBe(true);
  });
});

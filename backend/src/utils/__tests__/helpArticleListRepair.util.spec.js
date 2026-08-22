import { describe, expect, it } from '@jest/globals';
import {
  repairSplitOrderedLists,
  repairBareSlugLinks,
  repairHelpArticleHtml,
  countOrderedLists,
  countBareSlugLinks,
  stripTags,
  extractImageSrcs,
} from '../helpArticleListRepair.util.js';

describe('helpArticleListRepair.repairSplitOrderedLists', () => {
  it('gộp hai <ol> bị một chú thích chen giữa, đưa chú thích vào <li> trước đó', () => {
    const html = '<ol><li>Bước một</li></ol><p>[ẢNH: a]</p><ol><li>Bước hai</li></ol>';
    expect(repairSplitOrderedLists(html)).toBe(
      '<ol><li>Bước một<p>[ẢNH: a]</p></li><li>Bước hai</li></ol>',
    );
  });

  it('gộp được chuỗi 3 khối <ol> trở lên (vòng lặp chạy tới khi hết)', () => {
    const html = '<ol><li>A</li></ol><p>x</p><ol><li>B</li></ol><p>y</p><ol><li>C</li></ol>';
    const out = repairSplitOrderedLists(html);
    expect(countOrderedLists(out)).toBe(1);
    expect(out).toBe('<ol><li>A<p>x</p></li><li>B<p>y</p></li><li>C</li></ol>');
  });

  it('giữ nguyên ảnh admin đã chèn — chỉ di chuyển, không dựng lại nội dung', () => {
    const html = '<ol><li>Bước một</li></ol><p><img src="/uploads/a.png" alt=""></p><ol><li>Bước hai</li></ol>';
    const out = repairSplitOrderedLists(html);
    expect(out).toContain('<img src="/uploads/a.png" alt="">');
    expect(countOrderedLists(out)).toBe(1);
  });

  // TipTap cấu hình Image `inline: false` nên ảnh admin chèn là node CẤP KHỐI,
  // không bọc trong <p>. Bỏ sót dạng này thì đúng những bài đã chèn ảnh — thứ
  // người dùng quan tâm nhất — lại là những bài không được vá.
  it('gộp được khi ảnh là <img> cấp khối (dạng trình soạn thảo thật sự ghi ra)', () => {
    const html = '<ol><li>Bước một</li></ol><img src="/uploads/a.png" alt="x"><ol><li>Bước hai</li></ol>';
    const out = repairSplitOrderedLists(html);
    expect(countOrderedLists(out)).toBe(1);
    expect(out).toBe('<ol><li>Bước một<img src="/uploads/a.png" alt="x"></li><li>Bước hai</li></ol>');
  });

  it('gộp được khi ảnh nằm trong <figure>', () => {
    const html = '<ol><li>A</li></ol><figure><img src="/u/b.png"><figcaption>chú</figcaption></figure><ol><li>B</li></ol>';
    expect(countOrderedLists(repairSplitOrderedLists(html))).toBe(1);
  });

  it('gộp được khi trộn <p> và <img> cấp khối liền nhau', () => {
    const html = '<ol><li>A</li></ol><p>ghi chú</p><img src="/u/c.png"><ol><li>B</li></ol>';
    const out = repairSplitOrderedLists(html);
    expect(countOrderedLists(out)).toBe(1);
    expect(extractImageSrcs(out)).toEqual(['/u/c.png']);
  });

  it('gộp được nhiều đoạn <p> liền nhau giữa hai mục', () => {
    const html = '<ol><li>A</li></ol><p>ghi chú 1</p><p>ghi chú 2</p><ol><li>B</li></ol>';
    expect(repairSplitOrderedLists(html)).toBe(
      '<ol><li>A<p>ghi chú 1</p><p>ghi chú 2</p></li><li>B</li></ol>',
    );
  });

  it('KHÔNG gộp khi giữa hai danh sách có tiêu đề — đó là hai danh sách riêng thật sự', () => {
    const html = '<ol><li>A</li></ol><h2>Phần mới</h2><ol><li>B</li></ol>';
    expect(repairSplitOrderedLists(html)).toBe(html);
    expect(countOrderedLists(repairSplitOrderedLists(html))).toBe(2);
  });

  it('không đụng tới <ul> đứng độc lập và HTML không có gì để vá', () => {
    const html = '<ul><li>A</li></ul><p>ghi chú</p><ul><li>B</li></ul>';
    expect(repairSplitOrderedLists(html)).toBe(html);
    expect(repairSplitOrderedLists('<p>chỉ là đoạn văn</p>')).toBe('<p>chỉ là đoạn văn</p>');
  });

  it('không đổi một chữ nào trong nội dung', () => {
    const html = '<ol><li>Bước một</li></ol><p>[ẢNH: a]</p><ol><li>Bước hai</li></ol>';
    expect(stripTags(repairSplitOrderedLists(html))).toBe(stripTags(html));
  });

  it('an toàn với đầu vào rỗng / không phải chuỗi', () => {
    expect(repairSplitOrderedLists('')).toBe('');
    expect(repairSplitOrderedLists(null)).toBeNull();
    expect(repairSplitOrderedLists(undefined)).toBeUndefined();
  });
});

describe('helpArticleListRepair.repairBareSlugLinks', () => {
  it('nở slug trần thành /huong-dan/<slug>', () => {
    expect(repairBareSlugLinks('<a href="quick-send">Gửi nhanh</a>'))
      .toBe('<a href="/huong-dan/quick-send">Gửi nhanh</a>');
  });

  it('không đụng đường dẫn tuyệt đối, neo, hay link ngoài', () => {
    const untouched = [
      '<a href="/app/campaigns">Chiến dịch</a>',
      '<a href="#muc-2">Mục 2</a>',
      '<a href="https://a.com/x-y" target="_blank">Ngoài</a>',
      '<a href="mailto:a@b.com">Thư</a>',
      '<a href="/huong-dan/quick-send">Đã đúng sẵn</a>',
    ];
    for (const html of untouched) expect(repairBareSlugLinks(html)).toBe(html);
  });

  it('giữ nguyên các thuộc tính khác của thẻ <a>', () => {
    expect(repairBareSlugLinks('<a href="doi-goi" rel="noopener">X</a>'))
      .toBe('<a href="/huong-dan/doi-goi" rel="noopener">X</a>');
  });

  it('countBareSlugLinks đếm đúng và về 0 sau khi vá', () => {
    const html = '<a href="a-b">1</a><a href="/app/x">2</a><a href="c">3</a>';
    expect(countBareSlugLinks(html)).toBe(2);
    expect(countBareSlugLinks(repairBareSlugLinks(html))).toBe(0);
  });

  it('an toàn với đầu vào rỗng / không phải chuỗi', () => {
    expect(repairBareSlugLinks('')).toBe('');
    expect(repairBareSlugLinks(null)).toBeNull();
  });
});

describe('helpArticleListRepair.extractImageSrcs', () => {
  // stripTags mù với ảnh (<img> không có chữ), nên chốt "không mất ảnh" phải
  // dựa vào danh sách src chứ không dựa vào so sánh chữ.
  it('lấy đúng src theo thứ tự, cả <img> cấp khối lẫn trong <p>', () => {
    const html = '<p><img src="/u/1.png"></p><img src="/u/2.png" alt="x"><p>chữ</p>';
    expect(extractImageSrcs(html)).toEqual(['/u/1.png', '/u/2.png']);
  });

  it('chứng minh vì sao cần nó: mất ảnh KHÔNG làm đổi chuỗi chữ', () => {
    const withImg = '<ol><li>A<img src="/u/a.png"></li></ol>';
    const lostImg = '<ol><li>A</li></ol>';
    expect(stripTags(withImg)).toBe(stripTags(lostImg));      // chốt cũ không thấy gì
    expect(extractImageSrcs(withImg)).not.toEqual(extractImageSrcs(lostImg)); // chốt mới bắt được
  });

  it('trả mảng rỗng khi không có ảnh / đầu vào rỗng', () => {
    expect(extractImageSrcs('<p>chữ</p>')).toEqual([]);
    expect(extractImageSrcs('')).toEqual([]);
    expect(extractImageSrcs(null)).toEqual([]);
  });
});

describe('helpArticleListRepair.repairHelpArticleHtml', () => {
  it('vá cả danh sách lẫn link trong một lượt, không đổi chữ', () => {
    const html = '<ol><li>Xem <a href="quick-send">Gửi nhanh</a></li></ol>'
      + '<p>[ẢNH: a]</p><ol><li>Bước hai</li></ol>';
    const out = repairHelpArticleHtml(html);
    expect(countOrderedLists(out)).toBe(1);
    expect(countBareSlugLinks(out)).toBe(0);
    expect(out).toContain('href="/huong-dan/quick-send"');
    expect(stripTags(out)).toBe(stripTags(html));
  });
});

import { describe, expect, it } from '@jest/globals';
import {
  repairSplitOrderedLists,
  countOrderedLists,
  stripTags,
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

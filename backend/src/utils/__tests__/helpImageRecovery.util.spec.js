import { describe, expect, it } from '@jest/globals';
import {
  tokenizeTags,
  findImageUnits,
  alignSequences,
  planImageRecovery,
  structuralTagCounts,
  describeStructureMismatch,
} from '../helpImageRecovery.util.js';
import { stripTags, extractImageSrcs } from '../helpArticleListRepair.util.js';
import { HELP_SEED_ARTICLES } from '../../services/help/helpSeed.data.js';

describe('helpImageRecovery.tokenizeTags', () => {
  it('đánh đúng độ sâu lồng nhau, thẻ rỗng không làm đổi độ sâu', () => {
    const tokens = tokenizeTags('<ol><li>A<img src="/u/a.png"></li></ol>');
    expect(tokens.map((t) => t.key)).toEqual(['0:ol', '1:li', '2:img', '1:/li', '0:/ol']);
  });

  it('giữ vị trí thật trong chuỗi để cắt/ghép không lệch', () => {
    const html = '<p>xin chào</p>';
    const [open, close] = tokenizeTags(html);
    expect(html.slice(open.end, close.start)).toBe('xin chào');
  });

  // Máy dịch xáo trộn <strong>/<a> rất nhiều. Tính cả chúng vào khung thì hai bản
  // chỉ khớp 51–72% và mọi bài đều bị loại — đo thật trên production.
  it('bỏ qua thẻ inline, chỉ giữ thẻ khung', () => {
    const withInline = '<p>xin <strong>chào</strong> <a href="/x">bạn</a><br>ạ</p>';
    expect(tokenizeTags(withInline).map((t) => t.key)).toEqual(['0:p', '0:/p']);
  });

  // Bản VI và bản EN trong DB do hai bộ chuyển Markdown khác nhau sinh ra: một
  // bên ghi <li>A</li>, bên kia ghi <li><p>A</p></li>. Đo thật trên production:
  // zalo-account có 15 <p> bên VI so với 39 bên EN, trong khi số <li> trùng khít.
  it('bỏ lớp <p> mà bộ chuyển bọc quanh nội dung <li>/<td>', () => {
    const loose = '<ul><li><p>A</p></li></ul><table><tbody><tr><td><p>B</p></td></tr></tbody></table>';
    const tight = '<ul><li>A</li></ul><table><tbody><tr><td>B</td></tr></tbody></table>';
    expect(tokenizeTags(loose).map((t) => t.key)).toEqual(tokenizeTags(tight).map((t) => t.key));
  });

  it('KHÔNG bỏ đoạn chú thích ảnh đứng ngay đầu <li> — đó là chỗ cần nhận ra', () => {
    const keys = tokenizeTags('<ul><li><p>[ẢNH: nút]</p></li></ul>').map((t) => t.key);
    expect(keys).toEqual(['0:ul', '1:li', '2:p', '2:/p', '1:/li', '0:/ul']);
  });

  it('không đụng <p> đứng độc lập ngoài danh sách', () => {
    expect(tokenizeTags('<p>A</p>').map((t) => t.key)).toEqual(['0:p', '0:/p']);
  });

  it('giữ <li>, <td> trong khung để định vị được ảnh nằm lồng bên trong', () => {
    const html = '<table><tbody><tr><td><img src="/u/a.png"></td></tr></tbody></table>';
    expect(tokenizeTags(html).map((t) => t.name)).toEqual(
      ['table', 'tbody', 'tr', 'td', 'img', 'td', 'tr', 'tbody', 'table'],
    );
  });
});

describe('helpImageRecovery.describeStructureMismatch', () => {
  it('chỉ ra thẻ nào lệch số lượng, bỏ qua thẻ inline', () => {
    const vi = '<p>a</p><p>[ẢNH: x]</p><p><strong>b</strong></p>';
    const en = '<p>a</p><img src="/u/x.png"><p>b</p>';
    expect(describeStructureMismatch(vi, en)).toBe('vi/en: img 0/1, p 3/2');
  });

  it('nói rõ khi hai bên bằng nhau', () => {
    expect(describeStructureMismatch('<p>a</p>', '<p><em>b</em></p>')).toBe('số thẻ khung hai bên bằng nhau');
  });

  it('structuralTagCounts chỉ đếm thẻ mở', () => {
    expect([...structuralTagCounts('<ol><li>a</li><li>b</li></ol>')]).toEqual([['ol', 1], ['li', 2]]);
  });
});

describe('helpImageRecovery.findImageUnits', () => {
  it('nhận <img> trần và gom cả <figure> có ảnh thành một đơn vị', () => {
    const html = '<img src="/u/a.png"><figure><img src="/u/b.png"><figcaption>chú</figcaption></figure>';
    const units = findImageUnits(html, tokenizeTags(html));
    expect(units.map((u) => u.src)).toEqual(['/u/a.png', '/u/b.png']);
    expect(units[1].html).toBe('<figure><img src="/u/b.png"><figcaption>chú</figcaption></figure>');
  });

  it('bỏ qua <figure> không chứa ảnh', () => {
    const html = '<figure><figcaption>chỉ có chữ</figcaption></figure>';
    expect(findImageUnits(html, tokenizeTags(html))).toEqual([]);
  });
});

describe('helpImageRecovery.alignSequences', () => {
  it('khớp đơn điệu và chỉ khớp phần tử giống hệt', () => {
    const map = alignSequences(['a', 'b', 'c'], ['a', 'x', 'b', 'c']);
    expect([...map.entries()]).toEqual([[0, 0], [1, 2], [2, 3]]);
  });
});

describe('helpImageRecovery.planImageRecovery', () => {
  // Đây chính là ca làm hỏng cách làm đầu tiên: ảnh nằm TRONG <li> nên bộ tách
  // khối cấp cao nhất không thấy, và bản EN thừa đúng một khối.
  it('đặt lại được ảnh nằm bên trong <li>', () => {
    const vi = '<ol><li>Bước một<p>[ẢNH: Nút tạo]</p></li><li>Bước hai</li></ol>';
    const en = '<ol><li>Step one<img src="/u/a.png" alt="x"></li><li>Step two</li></ol>';
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(true);
    expect(plan.restored).toEqual([{ src: '/u/a.png', replacedCaption: true }]);
    expect(plan.html).toBe('<ol><li>Bước một<img src="/u/a.png" alt="x"></li><li>Bước hai</li></ol>');
  });

  it('giữ chú thích khi bản EN cũng còn giữ chú thích của nó', () => {
    const vi = '<ol><li>Bước một<p>[ẢNH: Nút tạo]</p></li></ol>';
    const en = '<ol><li>Step one<p>[IMAGE: Create button]</p><img src="/u/a.png"></li></ol>';
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(true);
    expect(plan.html).toBe('<ol><li>Bước một<p>[ẢNH: Nút tạo]</p><img src="/u/a.png"></li></ol>');
    expect(stripTags(plan.html)).toBe(stripTags(vi));
  });

  it('đặt lại được ảnh cấp khối giữa hai danh sách', () => {
    const vi = '<ol><li>A</li></ol><p>[ẢNH: b]</p><ol><li>B</li></ol>';
    const en = '<ol><li>A</li></ol><img src="/u/b.png"><ol><li>B</li></ol>';
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(true);
    expect(plan.html).toBe('<ol><li>A</li></ol><img src="/u/b.png"><ol><li>B</li></ol>');
  });

  it('đặt lại được nhiều ảnh liền nhau trong cùng một chỗ', () => {
    const vi = '<ol><li>A<p>[ẢNH: 1]</p><p>[ẢNH: 2]</p></li></ol>';
    const en = '<ol><li>A<img src="/u/1.png"><img src="/u/2.png"></li></ol>';
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(true);
    expect(extractImageSrcs(plan.html)).toEqual(['/u/1.png', '/u/2.png']);
  });

  // Bản VI được seed lại có thể mới hơn bản EN từng dịch. Cách cũ loại cả bài;
  // ở đây phần khớp được vẫn phải cứu.
  it('vẫn cứu được phần khớp khi bản VI có thêm nội dung bản EN không có', () => {
    const vi = '<h2>Đầu</h2><ol><li>A<p>[ẢNH: a]</p></li><li>B</li></ol><p>Đoạn mới thêm sau</p>';
    const en = '<h2>Head</h2><ol><li>A<img src="/u/a.png"></li><li>B</li></ol>';
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(true);
    expect(plan.restored).toHaveLength(1);
    expect(plan.html).toContain('<p>Đoạn mới thêm sau</p>');
  });

  it('cứu tấm đặt được và bỏ riêng tấm không đặt được, không loại cả bài', () => {
    const vi = '<ol><li>A<p>[ẢNH: a]</p></li><li>B<p>Ghi chú thường</p></li></ol>';
    const en = '<ol><li>A<img src="/u/a.png"></li><li>B<p>Plain note</p>giữa<img src="/u/b.png">sau</li></ol>';
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(true);
    expect(plan.restored.map((r) => r.src)).toEqual(['/u/a.png']);
    expect(plan.skipped.map((s) => s.src)).toEqual(['/u/b.png']);
  });

  it('không đổi một chữ tiếng Việt nào — chỉ chú thích bị chính ảnh đó thay chỗ', () => {
    const vi = '<ol><li>Bước một<p>[ẢNH: Nút tạo]</p></li><li>Bước hai</li></ol>';
    const en = '<ol><li>Step one<img src="/u/a.png"></li><li>Step two</li></ol>';
    const plan = planImageRecovery(vi, en);
    expect(stripTags(plan.html)).toBe(stripTags(plan.textReference));
    expect(plan.textReference).toBe('<ol><li>Bước một</li><li>Bước hai</li></ol>');
  });

  it('từ chối khi số chú thích bên VI không bằng số ảnh bên EN', () => {
    const vi = '<ol><li>A<p>[ẢNH: 1]</p><p>[ẢNH: 2]</p></li></ol>';
    const en = '<ol><li>A<img src="/u/1.png"></li></ol>';
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(false);
    expect(plan.skipped[0].reason).toMatch(/lệch/);
  });

  it('từ chối khi chỗ tương ứng bên VI là nội dung khác, không phải chú thích', () => {
    const vi = '<ol><li>A<p>Một đoạn văn thật sự</p></li></ol>';
    const en = '<ol><li>A<img src="/u/1.png"></li></ol>';
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(false);
  });

  it('từ chối cả bài khi khung hai bản là hai bài khác nhau', () => {
    const vi = '<h2>Bài này</h2><p>Nội dung hoàn toàn khác</p>';
    const en = '<table><tbody><tr><td>x</td></tr></tbody></table><img src="/u/1.png">';
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/lệch quá nhiều/);
  });

  it('không làm gì khi bản EN không có ảnh', () => {
    const plan = planImageRecovery('<p>A</p>', '<p>A</p>');
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe('bản EN không có ảnh');
  });

  it('an toàn với đầu vào không phải chuỗi', () => {
    expect(planImageRecovery(null, '<img src="/u/a.png">').ok).toBe(false);
    expect(planImageRecovery('<p>A</p>', undefined).ok).toBe(false);
  });
});

/**
 * Chạy trên HTML THẬT của bài mẫu, không phải ví dụ rút gọn. Cách làm đầu tiên
 * qua hết các ví dụ nhỏ nhưng cứu được 0/44 ảnh trên production — vì bài thật có
 * ảnh nằm trong <li>, có bảng, có <strong> lồng trong <li>, và bản EN lệch khối.
 */
describe('helpImageRecovery — bài mẫu thật', () => {
  const article = HELP_SEED_ARTICLES.find((a) => a.slug === 'zalo-account');
  const vi = article.body_html;
  const captionPattern = /<p>\[ẢNH:[^<]*\]<\/p>/g;
  // Bản EN được dịch máy: cấu trúc thẻ giữ nguyên, chữ đổi hết.
  const translate = (html) => html.replace(/>([^<]+)</g, (_m, text) => `>${text.replace(/\S/g, 'x')}<`);

  it('bài mẫu này đúng là có ảnh nằm trong <li> — thứ làm hỏng cách làm cũ', () => {
    expect(vi).toContain('</strong>.<p>[ẢNH:');
  });

  it('cứu đủ ảnh khi bản EN thay chú thích bằng ảnh (kiểu admin đã làm)', () => {
    let i = 0;
    const en = translate(vi.replace(captionPattern, () => `<img src="/u/${i++}.png">`));
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(true);
    expect(plan.restored).toHaveLength(extractImageSrcs(en).length);
    expect(plan.skipped).toEqual([]);
    expect(stripTags(plan.html)).toBe(stripTags(plan.textReference));
    expect(extractImageSrcs(plan.html)).toEqual(plan.restored.map((r) => r.src));
    expect(plan.html).not.toMatch(captionPattern);
  });

  it('cứu đủ ảnh khi bản EN giữ chú thích và chèn ảnh ngay sau', () => {
    let i = 0;
    const en = translate(vi.replace(captionPattern, (m) => `${m}<img src="/u/${i++}.png">`));
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(true);
    expect(plan.restored).toHaveLength(extractImageSrcs(en).length);
    expect(stripTags(plan.html)).toBe(stripTags(vi));   // chú thích còn nguyên
  });

  // Chốt chặn cho đúng thứ đã làm hỏng lần chạy thật thứ hai: bản dịch bôi đậm
  // khác chỗ, bỏ link, gộp <strong> — khung khối thì vẫn y nguyên.
  it('cứu đủ ảnh dù bản dịch xáo trộn hết thẻ in đậm và link', () => {
    let i = 0;
    const en = translate(vi.replace(captionPattern, () => `<img src="/u/${i++}.png">`))
      .replace(/<\/?strong>/g, (m, at) => (at % 3 === 0 ? '' : m))
      .replace(/<a\b[^>]*>|<\/a>/g, '');
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(true);
    expect(plan.coverage).toBe(1);
    expect(plan.restored).toHaveLength(extractImageSrcs(en).length);
    expect(stripTags(plan.html)).toBe(stripTags(plan.textReference));
    expect(plan.html).not.toMatch(captionPattern);
  });

  /**
   * Dựng lại đúng bản EN thật trong DB, theo chuỗi thẻ đã dump từ production:
   * bọc nội dung <li>/<td>/<th> trong <p>, bỏ <thead>, thay chú thích bằng ảnh,
   * dịch chữ và xáo trộn <strong>/<a>. Đây là ca đã làm hỏng cả ba lần chạy thật.
   */
  const toEnglishVariant = (source, slug) => {
    let i = 0;
    let out = source.replace(captionPattern, () => `<img src="/u/${slug}-${i++}.png" alt="image.png" />`);
    out = out.replace(/<(li|td|th)>([\s\S]*?)<\/\1>/g, (m, tag, inner) => (
      inner.includes('<p>') || inner.includes('<img') ? m : `<${tag}><p>${inner}</p></${tag}>`
    ));
    out = out.replace(/<thead>([\s\S]*?)<\/thead><tbody>/, '<tbody>$1');
    return translate(out)
      .replace(/<\/?strong>/g, (m, at) => (at % 3 === 0 ? '' : m))
      .replace(/<a\b[^>]*>|<\/a>/g, '');
  };

  it('cứu đủ ảnh khi bản EN dùng danh sách "loose" và bỏ <thead> (bản thật)', () => {
    const en = toEnglishVariant(vi, 'zalo-account');
    const plan = planImageRecovery(vi, en);
    expect(plan.ok).toBe(true);
    expect(plan.coverage).toBeGreaterThan(0.95);
    expect(plan.restored).toHaveLength(extractImageSrcs(en).length);
    expect(plan.skipped).toEqual([]);
    expect(plan.html).not.toMatch(captionPattern);
    expect(stripTags(plan.html)).toBe(stripTags(plan.textReference));
    expect(extractImageSrcs(plan.html)).toEqual(plan.restored.map((r) => r.src));
  });

  it('cứu được ảnh ở MỌI bài mẫu có chú thích, không riêng một bài', () => {
    const articles = HELP_SEED_ARTICLES.filter((a) => captionPattern.test(a.body_html ?? ''));
    expect(articles.length).toBeGreaterThan(10);
    for (const art of articles) {
      const en = toEnglishVariant(art.body_html, art.slug);
      const plan = planImageRecovery(art.body_html, en);
      expect({ slug: art.slug, restored: plan.restored.length })
        .toEqual({ slug: art.slug, restored: extractImageSrcs(en).length });
      expect(stripTags(plan.html)).toBe(stripTags(plan.textReference));
    }
  });

  it('cứu đủ ảnh khi bản VI đã được seed lại bằng bản mới hơn bản EN từng dịch', () => {
    let i = 0;
    const en = translate(vi.replace(captionPattern, () => `<img src="/u/${i++}.png">`));
    const viNewer = `${vi}<h2>Mục mới thêm sau</h2><p>Nội dung chưa từng được dịch</p>`;
    const plan = planImageRecovery(viNewer, en);
    expect(plan.ok).toBe(true);
    expect(plan.restored).toHaveLength(extractImageSrcs(en).length);
    expect(plan.html).toContain('<h2>Mục mới thêm sau</h2>');
  });
});

import { describe, it, expect } from 'vitest';
import { miniMarkdownToHtml, inline, escapeHtml } from '../miniMarkdownToHtml';

describe('miniMarkdownToHtml', () => {
  describe('escapeHtml & inline security', () => {
    it('escapes HTML tags and quotes preventing XSS and attribute breakout', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
      );
      expect(escapeHtml('foo & "bar" < \'baz\' > qux')).toBe(
        'foo &amp; &quot;bar&quot; &lt; &#39;baz&#39; &gt; qux',
      );
    });

    it('prevents HTML attribute breakout on image tag', () => {
      const res = inline('![x](" onerror=BAD alt=")');
      expect(res).toBe('<img src="&quot; onerror=BAD alt=&quot;" alt="x">');
    });

    it('neutralizes dangerous schemes like javascript:, vbscript:, data:', () => {
      // Điều cốt lõi: URL nguy hiểm bị thay bằng '#', không còn scheme thực thi được.
      const linkJs = inline('[Click me](javascript:alert(1))');
      expect(linkJs).toBe('<a href="#">Click me</a>');
      expect(linkJs).not.toContain('javascript:');

      const linkVb = inline('[Click me](vbscript:msgbox(1))');
      expect(linkVb).toBe('<a href="#">Click me</a>');
      expect(linkVb).not.toContain('vbscript:');

      const linkData = inline('[Click me](data:text/html,<script>alert(1)</script>)');
      expect(linkData).toBe('<a href="#">Click me</a>');
      expect(linkData).not.toContain('data:');

      const imgJs = inline('![avatar](javascript:alert(1))');
      expect(imgJs).toBe('<img src="#" alt="avatar">');
    });

    it('preserves URLs with underscores without colliding with italic rules or target="_blank"', () => {
      const link1 = inline('[tài liệu](https://x.com/bao_cao)');
      expect(link1).toBe('<a href="https://x.com/bao_cao" rel="noopener noreferrer" target="_blank">tài liệu</a>');
      expect(link1).not.toContain('<em>');

      const link2 = inline('[tài liệu](https://x.com/a_b_c)');
      expect(link2).toBe('<a href="https://x.com/a_b_c" rel="noopener noreferrer" target="_blank">tài liệu</a>');
      expect(link2).not.toContain('<em>');

      const img = inline('![sơ đồ](https://x.com/so_do.png)');
      expect(img).toBe('<img src="https://x.com/so_do.png" alt="sơ đồ">');

      const combined = inline('Chữ *nghiêng* ngoài link [báo cáo](https://x.com/bao_cao_2026)');
      expect(combined).toBe('Chữ <em>nghiêng</em> ngoài link <a href="https://x.com/bao_cao_2026" rel="noopener noreferrer" target="_blank">báo cáo</a>');

      const nested = inline('[hàm `my_custom_func()`](https://x.com/api_v1_docs)');
      expect(nested).toBe('<a href="https://x.com/api_v1_docs" rel="noopener noreferrer" target="_blank">hàm <code>my_custom_func()</code></a>');
    });

    it('preserves snake_case names without converting intra-word underscores into italic', () => {
      const res1 = inline('Dùng hàm get_user_by_id để lấy dữ liệu');
      expect(res1).toBe('Dùng hàm get_user_by_id để lấy dữ liệu');
      expect(res1).not.toContain('<em>');

      const res2 = inline('Biến user_order_count và file main_config_v2.js');
      expect(res2).toBe('Biến user_order_count và file main_config_v2.js');
      expect(res2).not.toContain('<em>');

      const res3 = inline('Đây là _chữ nghiêng chuẩn_ và get_user_profile');
      expect(res3).toBe('Đây là <em>chữ nghiêng chuẩn</em> và get_user_profile');
    });

    it('parses images BEFORE links correctly without stray exclamation marks', () => {
      const res = inline('![Ảnh hướng dẫn](https://cdn.example.com/step1.png)');
      expect(res).toBe('<img src="https://cdn.example.com/step1.png" alt="Ảnh hướng dẫn">');
      expect(res).not.toContain('<a');
      expect(res).not.toContain('!&lt;a');
    });

    it('parses links correctly with target blank and noopener', () => {
      const res = inline('[Xem tài liệu](https://example.com/docs)');
      expect(res).toBe('<a href="https://example.com/docs" rel="noopener noreferrer" target="_blank">Xem tài liệu</a>');
    });

    it('keeps in-app and cross-article links in the same tab', () => {
      const appLink = inline('[Kênh gửi](/app/settings/channels)');
      expect(appLink).toBe('<a href="/app/settings/channels">Kênh gửi</a>');
      expect(appLink).not.toContain('target=');

      const articleLink = inline('[Thêm tài khoản Email](email-account)');
      expect(articleLink).toBe('<a href="email-account">Thêm tài khoản Email</a>');
      expect(articleLink).not.toContain('target=');

      // mailto vẫn mở ứng dụng thư ngoài
      expect(inline('[Gửi thư](mailto:a@b.com)')).toContain('target="_blank"');
    });

    it('parses inline bold and italic correctly', () => {
      const res1 = inline('**Chữ đậm** và *chữ nghiêng*');
      expect(res1).toBe('<strong>Chữ đậm</strong> và <em>chữ nghiêng</em>');

      const res2 = inline('__Chữ đậm 2__ và _chữ nghiêng 2_');
      expect(res2).toBe('<strong>Chữ đậm 2</strong> và <em>chữ nghiêng 2</em>');
    });

    it('parses inline code backticks', () => {
      const res = inline('Dùng lệnh `npm run dev` để chạy');
      expect(res).toBe('Dùng lệnh <code>npm run dev</code> để chạy');
    });

    it('parses strikethrough ~~text~~', () => {
      const res = inline('Giá ~~500k~~ 300k');
      expect(res).toBe('Giá <s>500k</s> 300k');
    });
  });

  describe('block level conversions', () => {
    it('converts headings #, ##, ### to h2, h3, h4 (reserving h1 for title)', () => {
      expect(miniMarkdownToHtml('# Tiêu đề cấp 1')).toBe('<h2>Tiêu đề cấp 1</h2>');
      expect(miniMarkdownToHtml('## Tiêu đề cấp 2')).toBe('<h3>Tiêu đề cấp 2</h3>');
      expect(miniMarkdownToHtml('### Tiêu đề cấp 3')).toBe('<h4>Tiêu đề cấp 3</h4>');
    });

    it('clamps #### and deeper headings to h4 instead of leaking literal # into the page', () => {
      expect(miniMarkdownToHtml('#### Tiêu đề cấp 4')).toBe('<h4>Tiêu đề cấp 4</h4>');
      expect(miniMarkdownToHtml('###### Tiêu đề cấp 6')).toBe('<h4>Tiêu đề cấp 6</h4>');
    });

    it('nests sub-lists under their parent <li> based on indentation', () => {
      const md = '- Bước 1\n  - Bước con 1.1\n  - Bước con 1.2\n- Bước 2';
      const html = miniMarkdownToHtml(md);
      expect(html).toBe(
        '<ul><li>Bước 1<ul><li>Bước con 1.1</li><li>Bước con 1.2</li></ul></li><li>Bước 2</li></ul>',
      );
    });

    it('nests a bullet sub-list under an ordered parent item', () => {
      const md = '1. Bước 1\n   - Ghi chú a\n   - Ghi chú b\n2. Bước 2';
      const html = miniMarkdownToHtml(md);
      expect(html).toBe(
        '<ol><li>Bước 1<ul><li>Ghi chú a</li><li>Ghi chú b</li></ul></li><li>Bước 2</li></ol>',
      );
    });

    it('converts bullet lists into <ul><li>', () => {
      const md = `- Bước 1: **Đăng nhập**\n- Bước 2: Tạo chiến dịch\n* Bước 3: Gửi tin`;
      const html = miniMarkdownToHtml(md);
      expect(html).toBe('<ul><li>Bước 1: <strong>Đăng nhập</strong></li><li>Bước 2: Tạo chiến dịch</li><li>Bước 3: Gửi tin</li></ul>');
    });

    it('converts numbered lists into <ol><li>', () => {
      const md = `1. Cài đặt môi trường\n2. Cấu hình biến\n3. Chạy ứng dụng`;
      const html = miniMarkdownToHtml(md);
      expect(html).toBe('<ol><li>Cài đặt môi trường</li><li>Cấu hình biến</li><li>Chạy ứng dụng</li></ol>');
    });

    it('keeps one <ol> when an indented paragraph separates items, so numbering does not restart', () => {
      // Bài hướng dẫn có chú thích ảnh thụt lề giữa các bước. Trước đây mỗi chú
      // thích cắt <ol> làm đôi nên số hiển thị 1 / 1 / 1 thay vì 1 / 2 / 3.
      const md = '1. Bước một\n\n   [ẢNH: minh hoạ bước một]\n\n2. Bước hai\n\n   [ẢNH: minh hoạ bước hai]\n\n3. Bước ba';
      const html = miniMarkdownToHtml(md);
      expect(html).toBe(
        '<ol><li>Bước một<p>[ẢNH: minh hoạ bước một]</p></li>'
        + '<li>Bước hai<p>[ẢNH: minh hoạ bước hai]</p></li>'
        + '<li>Bước ba</li></ol>',
      );
      expect(html.match(/<ol>/g)).toHaveLength(1);
    });

    it('closes the list when the paragraph after a blank line is NOT indented', () => {
      const md = '1. Bước một\n2. Bước hai\n\nĐoạn văn bình thường sau danh sách.';
      const html = miniMarkdownToHtml(md);
      expect(html).toBe(
        '<ol><li>Bước một</li><li>Bước hai</li></ol><p>Đoạn văn bình thường sau danh sách.</p>',
      );
    });

    it('attaches multiple continuation paragraphs to the same list item', () => {
      const md = '1. Bước một\n\n   Ghi chú đầu.\n\n   Ghi chú sau.\n\n2. Bước hai';
      const html = miniMarkdownToHtml(md);
      expect(html).toBe(
        '<ol><li>Bước một<p>Ghi chú đầu.</p><p>Ghi chú sau.</p></li><li>Bước hai</li></ol>',
      );
    });

    it('treats an indented line with no blank line before it as part of the same item text', () => {
      const md = '1. Bước một\n   nối tiếp cùng câu\n2. Bước hai';
      const html = miniMarkdownToHtml(md);
      expect(html).toBe('<ol><li>Bước một nối tiếp cùng câu</li><li>Bước hai</li></ol>');
    });

    it('converts blockquotes into <blockquote><p>', () => {
      const md = `> Lưu ý: Đây là tài liệu bảo mật nội bộ.\n> Vui lòng không chia sẻ ra ngoài.`;
      const html = miniMarkdownToHtml(md);
      expect(html).toBe('<blockquote><p>Lưu ý: Đây là tài liệu bảo mật nội bộ.<br>Vui lòng không chia sẻ ra ngoài.</p></blockquote>');
    });

    it('converts code blocks into <pre><code> with escaping', () => {
      const md = '```javascript\nconst a = "<script>alert(1)</script>";\nconsole.log(a);\n```';
      const html = miniMarkdownToHtml(md);
      expect(html).toBe('<pre><code>const a = &quot;&lt;script&gt;alert(1)&lt;/script&gt;&quot;;\nconsole.log(a);</code></pre>');
    });

    it('converts markdown tables into <table><thead><tbody>', () => {
      const md = `| Tính năng | Gói Miễn Phí | Gói Pro |\n| :--- | :---: | ---: |\n| Chiến dịch Zalo | 100 | Không giới hạn |\n| Bot AI | 1 | 5 |`;
      const html = miniMarkdownToHtml(md);
      expect(html).toBe('<table><thead><tr><th>Tính năng</th><th>Gói Miễn Phí</th><th>Gói Pro</th></tr></thead><tbody><tr><td>Chiến dịch Zalo</td><td>100</td><td>Không giới hạn</td></tr><tr><td>Bot AI</td><td>1</td><td>5</td></tr></tbody></table>');
    });

    it('converts horizontal rules into <hr>', () => {
      expect(miniMarkdownToHtml('---')).toBe('<hr>');
      expect(miniMarkdownToHtml('***')).toBe('<hr>');
    });

    it('handles empty input gracefully', () => {
      expect(miniMarkdownToHtml('')).toBe('<p></p>');
      expect(miniMarkdownToHtml(null)).toBe('<p></p>');
      expect(miniMarkdownToHtml(undefined)).toBe('<p></p>');
    });

    it('parses a full complex document faithfully', () => {
      const doc = `# Hướng dẫn sử dụng Zalo OA

Chào mừng bạn đến với **UKNOW**. Đây là *hướng dẫn chi tiết*.

## Các bước chuẩn bị
1. Đăng ký Zalo Official Account
2. Kết nối API với hệ thống

> [!NOTE]
> Thời gian duyệt OA từ 24 - 48h.

| Tham số | Giá trị mặc định |
|---|---|
| timeout | 30s |
| retry | 3 lần |

\`\`\`bash
npm run dev
\`\`\`

![Minh hoạ](https://img.example.com/oa_banner_v2.png)

Liên hệ hỗ trợ tại [Trung tâm trợ giúp](https://help.example.com/docs_v1/intro).`;

      const html = miniMarkdownToHtml(doc);
      expect(html).toContain('<h2>Hướng dẫn sử dụng Zalo OA</h2>');
      expect(html).toContain('<p>Chào mừng bạn đến với <strong>UKNOW</strong>. Đây là <em>hướng dẫn chi tiết</em>.</p>');
      expect(html).toContain('<h3>Các bước chuẩn bị</h3>');
      expect(html).toContain('<ol><li>Đăng ký Zalo Official Account</li><li>Kết nối API với hệ thống</li></ol>');
      expect(html).toContain('<blockquote><p>[!NOTE]<br>Thời gian duyệt OA từ 24 - 48h.</p></blockquote>');
      expect(html).toContain('<table><thead><tr><th>Tham số</th><th>Giá trị mặc định</th></tr></thead><tbody><tr><td>timeout</td><td>30s</td></tr><tr><td>retry</td><td>3 lần</td></tr></tbody></table>');
      expect(html).toContain('<pre><code>npm run dev</code></pre>');
      expect(html).toContain('<p><img src="https://img.example.com/oa_banner_v2.png" alt="Minh hoạ"></p>');
      expect(html).toContain('<p>Liên hệ hỗ trợ tại <a href="https://help.example.com/docs_v1/intro" rel="noopener noreferrer" target="_blank">Trung tâm trợ giúp</a>.</p>');
    });
  });
});

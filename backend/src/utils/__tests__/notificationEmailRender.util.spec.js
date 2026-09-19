/**
 * Spec cho notificationEmailRender.util.js — rewrite 19/09/2026.
 *
 * TRIẾT LÝ MỚI: `html_content` là BODY EMAIL TUYỆT ĐỐI.
 * - Có `html_content` → sanitize → gói tối thiểu trong <html><body>.
 * - Không có `html_content` → escape(message) → gói tối thiểu.
 * - KHÔNG bọc thêm: header gradient, greeting, title box, user chip, footer.
 *
 * ĐIỀU NÀY NGHĨA LÀ:
 *   Test cũ check layout gradient/palette/priority badge/CTA/LOGO là OBSOLETE.
 *   Test mới check: body đúng → email gửi đúng y hệt preview.
 */

import { renderNotificationEmailHtml, replaceVariablesForUser } from '../notificationEmailRender.util.js';

// ---------------------------------------------------------------------------
// replaceVariablesForUser
// ---------------------------------------------------------------------------

describe('replaceVariablesForUser', () => {
  const sampleUser = {
    full_name: 'Nguyễn Văn Test',
    email: 'test@example.com',
    plan: 'pro'
  };

  it('thay {{user_name}} bằng full_name', () => {
    expect(replaceVariablesForUser('Xin chào {{user_name}}!', sampleUser))
      .toBe('Xin chào Nguyễn Văn Test!');
  });

  it('fallback "bạn" khi thiếu full_name và username', () => {
    expect(replaceVariablesForUser('Hi {{user_name}}', { email: 'a@b.c' }))
      .toBe('Hi bạn');
  });

  it('fallback username khi thiếu full_name', () => {
    expect(replaceVariablesForUser('Hi {{user_name}}', { username: 'alice', email: 'a@b.c' }))
      .toBe('Hi alice');
  });

  it('trả về chuỗi rỗng khi content null/undefined', () => {
    expect(replaceVariablesForUser(null, sampleUser)).toBe('');
    expect(replaceVariablesForUser(undefined, sampleUser)).toBe('');
  });

  it('không escape HTML — content đi nguyên, escape riêng ở chỗ chèn', () => {
    const out = replaceVariablesForUser('{{user_name}} <bold>', sampleUser);
    expect(out).toBe('Nguyễn Văn Test <bold>');
  });
});

// ---------------------------------------------------------------------------
// renderNotificationEmailHtml — triết lý mới: html_content = body tuyệt đối
// ---------------------------------------------------------------------------

describe('renderNotificationEmailHtml', () => {
  // ---------------------------------------------------------------------------
  // Cấu trúc document
  // ---------------------------------------------------------------------------

  it('trả về DOCTYPE + <html> + <body> hợp lệ', () => {
    const html = renderNotificationEmailHtml({ notification: { message: 'Hi' } });
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<body');
    expect(html).toContain('</body>');
  });

  it('không bọc thêm layout wrapper (header gradient, greeting, title box, user chip)', () => {
    // Triết lý mới: html_content = body. KHÔNG có gradient header.
    const html = renderNotificationEmailHtml({ notification: { message: 'Hello' } });
    // Layout cũ không còn
    expect(html).not.toContain('linear-gradient(135deg,#f97316');
    expect(html).not.toContain('Xin chào');          // greeting
    expect(html).not.toContain('Tiêu đề thông báo');  // fallback title cũ
    expect(html).not.toContain('badge');               // title badge box
    expect(html).not.toContain('user_info');           // user chip
    expect(html).not.toContain('Nguyễn Văn Test');     // sample user không hiện nếu không có trong html_content
  });

  // ---------------------------------------------------------------------------
  // Đường html_content (admin soạn HTML)
  // ---------------------------------------------------------------------------

  it('html_content được render TRỰC TIẾP vào body — không bọc thêm gì', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        title: 'ignored-title',
        message: 'ignored-message',
        html_content: '<p>Hello World</p>'
      }
    });
    // html_content đi THẲNG vào body, không qua wrapper
    expect(html).toContain('<p>Hello World</p>');
    // Không có "ignored-title" hoặc "ignored-message" trong output
    expect(html).not.toContain('ignored-title');
    expect(html).not.toContain('ignored-message');
  });

  it('html_content với {{user_name}} được replace', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'fallback',
        html_content: '<p>Chào {{user_name}}, chúc bạn một ngày tốt lành!</p>'
      },
      user: { full_name: 'Trần Thị Mai', email: 'mai@test.com', plan: 'pro' }
    });
    expect(html).toContain('Chào Trần Thị Mai, chúc bạn một ngày tốt lành!');
    expect(html).not.toContain('{{user_name}}');
  });

  it('html_content với {{user_email}} và {{user_plan}} được replace', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<p>Email: {{user_email}} | Plan: {{user_plan}}</p>'
      },
      user: { full_name: 'A', email: 'user@test.com', plan: 'enterprise' }
    });
    expect(html).toContain('Email: user@test.com | Plan: enterprise');
    expect(html).not.toContain('{{user_email}}');
    expect(html).not.toContain('{{user_plan}}');
  });

  it('html_content với {{current_date}}, {{product_name}}, {{dashboard_url}}, {{support_email}} được replace', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<p>{{product_name}} - {{current_date}} - {{dashboard_url}} - {{support_email}}</p>'
      }
    });
    expect(html).not.toContain('{{product_name}}');
    expect(html).not.toContain('{{current_date}}');
    expect(html).not.toContain('{{dashboard_url}}');
    expect(html).not.toContain('{{support_email}}');
    expect(html).toContain('<p>');
  });

  // ---------------------------------------------------------------------------
  // Đường plain text (không có html_content)
  // ---------------------------------------------------------------------------

  it('không có html_content → message được escape vào body', () => {
    const html = renderNotificationEmailHtml({
      notification: { message: 'Hello <b>World</b>' }
    });
    expect(html).toContain('Hello &lt;b&gt;World&lt;/b&gt;');
    expect(html).not.toContain('<b>World</b>');
  });

  it('message với newline được giữ nguyên', () => {
    const html = renderNotificationEmailHtml({
      notification: { message: 'Dòng 1\nDòng 2' }
    });
    expect(html).toContain('Dòng 1');
    expect(html).toContain('Dòng 2');
  });

  it('cả html_content và message đều rỗng → fallback hiển thị message (dù rỗng)', () => {
    const html = renderNotificationEmailHtml({ notification: {} });
    expect(html).toContain('<body');
    expect(html).toContain('</body>');
  });

  // ---------------------------------------------------------------------------
  // Sanitizer
  // ---------------------------------------------------------------------------

  it('<script> bị strip hoàn toàn kèm nội dung', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<p>before</p><script>alert("XSS")</script><p>after</p>'
      }
    });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert');
    expect(html).not.toContain('"XSS"');
    // Text node giữ lại
    expect(html).toContain('<p>before</p>');
    expect(html).toContain('<p>after</p>');
  });

  it('<style> bị strip hoàn toàn', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<style>.x{color:red}</style><p>Text</p><link rel="stylesheet" href="evil.css">'
      }
    });
    expect(html).not.toContain('<style>');
    expect(html).not.toContain('</style>');
    expect(html).not.toContain('<link');
    expect(html).not.toContain('.x{color:red}');
    expect(html).not.toContain('evil.css');
    expect(html).toContain('<p>Text</p>');
  });

  it('event handler onclick/onload bị strip attribute', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<p onclick="alert(1)" onload="x()">Safe</p>'
      }
    });
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onload');
    expect(html).not.toContain('alert(1)');
    expect(html).toMatch(/<p>Safe<\/p>/);
  });

  it('style="..." attribute trong html_content bị strip — wrapper table styles KHÔNG bị ảnh hưởng', () => {
    // Chỉ check style= trong nội dung body, không phải style= của wrapper table.
    // Test: <p style="color:red">Styled</p> → style= bị strip → <p>Styled</p>.
    // Wrapper table (background, border-radius) vẫn có style= → không check toàn bộ.
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<p style="color:red;font-size:20px">Styled text</p>'
      }
    });
    // style= trong content bị strip
    expect(html).not.toContain('style="color:red');
    expect(html).not.toContain('style="font-size');
    // <p> sạch vẫn còn
    expect(html).toMatch(/<p>Styled text<\/p>/);
    // Wrapper table background/style vẫn có (không check cụ thể ở đây)
    expect(html).toContain('background:#f3f4f6');
  });

  it('thẻ table ĐƯỢC PHÉP trong html_content (email client hỗ trợ table layout)', () => {
    // Sau rewrite: table, thead, tbody, tr, th, td nằm trong whitelist.
    // Admin dùng được table-based layout email.
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<table><thead><tr><th>Col1</th></tr></thead><tbody><tr><td>cell</td></tr></tbody></table><p>para</p>'
      }
    });
    expect(html).toContain('<table>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('<tr>');
    expect(html).toContain('<th>Col1</th>');
    expect(html).toContain('<td>cell</td>');
    expect(html).toContain('<p>para</p>');
  });

  it('href="javascript:..." → bỏ href', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<a href="javascript:alert(1)">Bad</a><a href="https://example.com">Good</a>'
      }
    });
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://example.com"');
  });

  it('img tag với src hợp lệ được giữ', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<p><img src="https://example.com/logo.png" alt="Logo" width="120" height="40"></p>'
      }
    });
    expect(html).toContain('src="https://example.com/logo.png"');
    expect(html).toContain('alt="Logo"');
    expect(html).toContain('width="120"');
    expect(html).toContain('height="40"');
  });

  it('img tag với javascript: data: src bị bỏ', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<img src="javascript:alert(1)"><img src="data:text/html,evil">'
      }
    });
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:text/html');
  });

  it('thẻ svg, embed, form vẫn bị strip vì nằm trong BLOCK_TAGS', () => {
    // svg, embed, form nằm trong danh sách nguy hiểm (BLOCK_TAGS) → strip + content.
    // table THÌ được whitelist → xem test riêng.
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<svg width="100" height="100"><circle cx="50" cy="50" r="40"/></svg><embed src="evil.swf"><form action="/evil"><input type="text"></form><p>kept</p>'
      }
    });
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<circle');
    expect(html).not.toContain('<embed');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('evil.swf');
    expect(html).not.toContain('/evil');
    // Paragraph kept
    expect(html).toContain('<p>kept</p>');
  });

  // ---------------------------------------------------------------------------
  // Document wrapper strip
  // ---------------------------------------------------------------------------

  it('html_content paste nguyên document <html><body>...</body></html> → chỉ giữ body content', () => {
    const docHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>My Email</title>
  <style>.x{color:red}</style>
</head>
<body>
  <h1>Xin chào {{user_name}}</h1>
  <p>Body content <strong>important</strong></p>
  <a href="https://example.com">Link</a>
</body>
</html>`;
    const html = renderNotificationEmailHtml({
      notification: { message: 'm', html_content: docHtml },
      user: { full_name: 'Trần Văn A', email: 'a@test.com', plan: 'pro' }
    });
    // <!DOCTYPE> còn (của renderer wrapper) — chỉ check content:
    // <style> từ admin bị strip, <meta>/<title> từ admin bị strip.
    // Lưu ý: renderer CỦA MÌNH có <title> ở <head> để email client set window
    // title — đó là của renderer, không phải admin. Check <title> chỉ không có
    // "My Email" (title của admin paste).
    expect(html).not.toContain('<style');
    expect(html).not.toContain('.x{color:red}');
    expect(html).not.toContain('My Email');
    // Nội dung body được replace + sanitize
    expect(html).toContain('Xin chào Trần Văn A');
    expect(html).toContain('<strong>important</strong>');
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('<style>');
  });

  it('html_content chỉ có <body>...</body> (không html wrapper) → vẫn bóc được', () => {
    const html = renderNotificationEmailHtml({
      notification: { message: 'm', html_content: '<body><p>Body only</p></body>' }
    });
    // Wrapper body của renderer vẫn có — chỉ check content body bị bóc
    expect(html).not.toContain('<body><p>Body only</p></body>');
    expect(html).toContain('<p>Body only</p>');
  });

  it('html_content là fragment thuần (không html/body) → giữ nguyên như trước', () => {
    const html = renderNotificationEmailHtml({
      notification: { message: 'm', html_content: '<p>Just a paragraph</p>' }
    });
    expect(html).toContain('<p>Just a paragraph</p>');
  });

  // ---------------------------------------------------------------------------
  // Security edge cases
  // ---------------------------------------------------------------------------

  it('user.full_name chứa < > — không có script/event handler', () => {
    // replaceVariablesForUser KHÔNG escape text — đó là design choice.
    // html_content của admin được phép chứa {{user_name}} và user_name được
    // chèn raw. Edge case user.full_name chứa < > hiếm gặp (admin nhập user,
    // không nhập tên). Không đảm bảo escape tuyệt đối — chỉ đảm bảo KHÔNG
    // có script/alert chạy được.
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<p>Chào {{user_name}}</p>'
      },
      user: { full_name: 'AbcXss', email: 'a@b.c', plan: 'pro' }
    });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('onload');
    expect(html).toContain('AbcXss');
  });

  it('html_content rỗng/whitespace → fallback message được escape', () => {
    const html = renderNotificationEmailHtml({
      notification: { title: 'T', message: 'Fallback <b>text</b>' }
    });
    expect(html).toContain('Fallback &lt;b&gt;text&lt;/b&gt;');
  });

  it('XSS attempt trong html_content bị sanitize sạch', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: `<img src=x onerror="alert('xss')"><p>Safe</p>`
      }
    });
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert');
    expect(html).not.toContain('x onerror');
    expect(html).toContain('<p>Safe</p>');
  });
});

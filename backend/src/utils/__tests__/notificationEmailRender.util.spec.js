/**
 * Spec cho notificationEmailRender.util.js — push 40e3a671 + push tiếp theo.
 *
 * TRIẾT LÝ MỚI NHẤT:
 *  - `html_content` là BODY EMAIL TUYỆT ĐỐI.
 *  - Renderer KHÔNG bọc layout, KHÔNG footer, chỉ:
 *      <!DOCTYPE html><html><head charset+viewport+title><body margin:0 + font>
 *      + ${bodyHtml}
 *      </body></html>
 *  - Admin soạn gì → user nhận đúng y (WYSIWYG email).
 *
 * SANITIZER MỚI NHẤT:
 *  - GIỮ inline CSS (style="...") — email client render inline CSS.
 *  - GIỮ <style> block — admin paste template HTML có thể cần.
 *  - CHỈ strip thẻ thực sự nguy hiểm: <script>, <iframe>, <object>, <embed>,
 *    <form>, <slot> + on*= handler + javascript: scheme.
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
// renderNotificationEmailHtml
// ---------------------------------------------------------------------------

describe('renderNotificationEmailHtml', () => {
  // ---------------------------------------------------------------------------
  // Document structure
  // ---------------------------------------------------------------------------

  it('trả về DOCTYPE + html + body hợp lệ', () => {
    const html = renderNotificationEmailHtml({ notification: { message: 'Hi' } });
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<body');
    expect(html).toContain('</body>');
  });

  it('KHÔNG bọc layout wrapper, KHÔNG footer cố định, KHÔNG background table', () => {
    // Triết lý mới nhất: html_content là body tuyệt đối, không có wrapper.
    // Lưu ý: <title> của renderer chứa "Founder AI" — không check chuỗi này.
    const html = renderNotificationEmailHtml({ notification: { message: 'Hello' } });
    expect(html).not.toContain('info@digiso.vn');
    expect(html).not.toContain('linear-gradient');
    expect(html).not.toContain('border-radius');
    expect(html).not.toContain('<td align="center"');
    expect(html).not.toContain('box-shadow');
    // Không có SUPPORT_EMAIL / FRONTEND_URL footer
    expect(html).not.toContain('founderai.vn');
  });

  it('body chỉ có bodyHtml nằm giữa <body>...</body> — không có thẻ wrapper khác ngoài head/title', () => {
    const html = renderNotificationEmailHtml({ notification: { message: 'Xin chào bạn' } });
    // Body content là message (escaped trong <p>)
    expect(html).toMatch(/<body[^>]*>[\s\S]*<p[^>]*>Xin chào bạn<\/p>[\s\S]*<\/body>/);
  });

  // ---------------------------------------------------------------------------
  // Đường html_content (admin soạn HTML)
  // ---------------------------------------------------------------------------

  it('html_content đi thẳng vào body — không có wrapper gì ngoài <html><body>', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        title: 'ignored-title',
        message: 'ignored-message',
        html_content: '<p>Hello World</p>'
      }
    });
    expect(html).toContain('<p>Hello World</p>');
    expect(html).not.toContain('ignored-title');
    expect(html).not.toContain('ignored-message');
  });

  it('html_content với {{user_name}} được replace', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'fallback',
        html_content: '<p>Chào {{user_name}}!</p>'
      },
      user: { full_name: 'Trần Thị Mai', email: 'mai@test.com', plan: 'pro' }
    });
    expect(html).toContain('Chào Trần Thị Mai!');
    expect(html).not.toContain('{{user_name}}');
  });

  // ---------------------------------------------------------------------------
  // Đường plain text
  // ---------------------------------------------------------------------------

  it('không có html_content + message text thuần → message được escape và wrap trong <p>', () => {
    const html = renderNotificationEmailHtml({
      notification: { message: 'Hello World' }
    });
    expect(html).toContain('<p style="margin:0 0 12px;">Hello World</p>');
  });

  it('message rỗng + html_content rỗng → fallback <p></p>', () => {
    const html = renderNotificationEmailHtml({ notification: {} });
    expect(html).toMatch(/<body[^>]*>[\s\S]*<p[^>]*><\/p>[\s\S]*<\/body>/);
  });

  // ---------------------------------------------------------------------------
  // Sanitizer: GIỮ style + <style>, strip thẻ nguy hiểm thực sự
  // ---------------------------------------------------------------------------

  it('<style> block được GIỮ (email client có thể dùng)', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<style>.x{color:red}</style><p class="x">Styled</p>'
      }
    });
    expect(html).toContain('<style>.x{color:red}</style>');
    expect(html).toContain('class="x"');
  });

  it('inline style="" được GIỮ nguyên si', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<p style="color:red;font-size:20px;margin:0">Styled</p>'
      }
    });
    expect(html).toContain('style="color:red;font-size:20px;margin:0"');
  });

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
    expect(html).toContain('<p>before</p>');
    expect(html).toContain('<p>after</p>');
  });

  it('<iframe>, <object>, <embed>, <form> bị strip (phishing protection)', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<iframe src="evil.com"></iframe><object data="x"></object><embed src="y"><form action="/evil"><input></form><p>kept</p>'
      }
    });
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<object');
    expect(html).not.toContain('<embed');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('evil.com');
    expect(html).not.toContain('<input>');
    expect(html).toContain('<p>kept</p>');
  });

  it('event handler onclick/onload/onerror/onmouseover bị strip', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<p onclick="alert(1)" onload="x()" onmouseover="y()">Click</p>'
      }
    });
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onload');
    expect(html).not.toContain('onmouseover');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('Click');
  });

  it('href="javascript:..." → bỏ href, giữ <a>', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<a href="javascript:alert(1)">Bad</a><a href="https://example.com">Good</a>'
      }
    });
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://example.com"');
  });

  it('img src=http(s)/data:image giữ; javascript: src bị loại', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<img src="https://example.com/x.png" alt="OK"><img src="javascript:alert(1)"><img src="data:text/html,evil">'
      }
    });
    expect(html).toContain('src="https://example.com/x.png"');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:text/html');
  });

  it('thẻ table được whitelist', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<table style="width:100%"><tr><td style="padding:10px">cell</td></tr></table><p>kept</p>'
      }
    });
    expect(html).toContain('<table');
    expect(html).toContain('style="width:100%"');
    expect(html).toContain('<td');
    expect(html).toContain('style="padding:10px"');
  });

  it('thẻ div/span/p giữ style + class + id (admin dùng cho layout)', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: '<div id="wrapper" class="container" style="max-width:600px"><p class="heading" style="font-size:20px">Hi</p><span style="color:red">red</span></div>'
      }
    });
    expect(html).toContain('id="wrapper"');
    expect(html).toContain('class="container"');
    expect(html).toContain('style="max-width:600px"');
    expect(html).toContain('class="heading"');
    expect(html).toContain('style="font-size:20px"');
    expect(html).toContain('style="color:red"');
  });

  // ---------------------------------------------------------------------------
  // Document wrapper strip
  // ---------------------------------------------------------------------------

  it('html_content paste nguyên document <html><head><body>...</body></html> → body content', () => {
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
    // Admin's <title>"My Email" bị strip — không còn trong output.
    // Renderer cũng có <title>Founder AI Platform</title> trong wrapper.
    expect(html).not.toContain('My Email');
    // Nội dung body được replace + sanitize
    expect(html).toContain('Xin chào Trần Văn A');
    expect(html).toContain('<strong>important</strong>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('<style>');
    expect(html).toContain('.x{color:red}');
  });

  it('html_content fragment thuần (không html/body) → giữ nguyên', () => {
    const html = renderNotificationEmailHtml({
      notification: { message: 'm', html_content: '<p>Just a paragraph</p>' }
    });
    expect(html).toContain('<p>Just a paragraph</p>');
  });

  // ---------------------------------------------------------------------------
  // Variable replace
  // ---------------------------------------------------------------------------

  it('{{current_date}}, {{product_name}}, {{dashboard_url}}, {{support_email}} được replace', () => {
    const html = renderNotificationEmailHtml({
      notification: { message: 'm', html_content: '<p>{{product_name}} - {{current_date}} - {{dashboard_url}} - {{support_email}}</p>' }
    });
    expect(html).not.toContain('{{');
    expect(html).toContain('<p>');
  });

  // ---------------------------------------------------------------------------
  // Security edge cases
  // ---------------------------------------------------------------------------

  it('XSS img onerror bị strip event handler — img src giữ hợp lệ', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'm',
        html_content: `<img src="https://example.com/x.png" onerror="alert('xss')"><p>Safe</p>`
      }
    });
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert');
    expect(html).toContain('src="https://example.com/x.png"');
    expect(html).toContain('<p>Safe</p>');
  });

  it('html_content rỗng/whitespace → fallback message được escape', () => {
    const html = renderNotificationEmailHtml({
      notification: { title: 'T', message: 'Fallback text only' }
    });
    expect(html).toContain('Fallback text only');
  });

  // ---------------------------------------------------------------------------
  // BACKWARD COMPAT (19/09): notification cũ lưu HTML trong `message` do FE
  // buildPayload cũ. Renderer tự detect và route qua html pipeline.
  // ---------------------------------------------------------------------------

  it('BACKWARD: message chứa HTML tag (html_content null) → render như html_content', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        title: 'Old notif',
        message: '<h1>Old HTML in message</h1><p>Body</p>',
        html_content: null
      }
    });
    expect(html).toContain('<h1>Old HTML in message</h1>');
    expect(html).toContain('<p>Body</p>');
    // KHÔNG escape (vì đi qua sanitize pipeline, không qua escapeHtml)
    expect(html).not.toContain('&lt;h1&gt;');
  });

  it('BACKWARD: message có <script> vẫn bị strip', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: '<p>ok</p><script>alert(1)</script>',
        html_content: null
      }
    });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert');
    expect(html).toContain('<p>ok</p>');
  });

  it('BACKWARD: message text thuần (không có HTML tag) → escape + wrap <p>', () => {
    const html = renderNotificationEmailHtml({
      notification: {
        message: 'Just plain text with <symbol>',
        html_content: null
      }
    });
    // Regex yêu cầu có thẻ đóng hoặc mở — '<symbol>' không có </symbol> và
    // 'symbol' không phải HTML element recognized nên KHÔNG trigger backward.
    // → escape bình thường.
    expect(html).toContain('Just plain text with &lt;symbol&gt;');
  });

  it('html_content=string rỗng → coi như null, fallback message', () => {
    const html = renderNotificationEmailHtml({
      notification: { message: 'fallback only', html_content: '   ' }
    });
    expect(html).toContain('fallback only');
  });
});

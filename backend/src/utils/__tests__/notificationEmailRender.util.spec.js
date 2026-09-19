import { renderNotificationEmailHtml, replaceVariablesForUser } from '../notificationEmailRender.util.js';

describe('notificationEmailRender.util', () => {
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

    it('không escape HTML — content đi qua, escape riêng ở chỗ chèn', () => {
      // replaceVariables KHÔNG escape — renderer escape ở chỗ chèn title/message
      const out = replaceVariablesForUser('{{user_name}} <bold>', sampleUser);
      expect(out).toBe('Nguyễn Văn Test <bold>');
    });
  });

  describe('renderNotificationEmailHtml', () => {
    const baseNotif = {
      type: 'promotion',
      priority: 'normal',
      title: '🎁 Ưu đãi giới hạn chỉ trong tuần này',
      message: 'Nhập mã WELCOME10 để được giảm 10% cho đơn đầu tiên.'
    };

    it('render HTML đầy đủ với DOCTYPE + html + body', () => {
      const html = renderNotificationEmailHtml({ notification: baseNotif });
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('<html lang="vi">');
      expect(html).toContain('</html>');
      expect(html).toContain('gradient(135deg,#f97316 0%,#ea580c 100%)');
    });

    it('escape HTML trong title để chèn an toàn (không lộ thẻ)', () => {
      const html = renderNotificationEmailHtml({
        notification: { ...baseNotif, title: '<h1>XSS attempt</h1>' }
      });
      // Title bị escape — không còn thẻ <h1>
      expect(html).not.toContain('<h1>XSS attempt</h1>');
      expect(html).toContain('&lt;h1&gt;XSS attempt&lt;/h1&gt;');
    });

    it('escape HTML trong message (multi-line preserved qua white-space:pre-wrap)', () => {
      const html = renderNotificationEmailHtml({
        notification: { ...baseNotif, message: '<script>alert(1)</script>\nLine 2' }
      });
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('white-space:pre-wrap');
    });

    it('badge priority "urgent" hiển thị khi priority=urgent', () => {
      const html = renderNotificationEmailHtml({
        notification: { ...baseNotif, priority: 'urgent' }
      });
      expect(html).toContain('Ưu tiên cao');
      expect(html).toContain('background:#dc2626');
    });

    it('badge priority "high" hiển thị khi priority=high (không phải urgent)', () => {
      const html = renderNotificationEmailHtml({
        notification: { ...baseNotif, priority: 'high' }
      });
      expect(html).toContain('Ưu tiên');
      expect(html).toContain('background:#f59e0b');
    });

    it('KHÔNG có badge priority khi priority=normal', () => {
      const html = renderNotificationEmailHtml({
        notification: { ...baseNotif, priority: 'normal' }
      });
      expect(html).not.toContain('Ưu tiên cao');
      expect(html).not.toContain('Ưu tiên</span>');
    });

    it('CTA "Khám phá ưu đãi →" chỉ hiển thị với type=promotion', () => {
      const htmlPromo = renderNotificationEmailHtml({ notification: baseNotif });
      expect(htmlPromo).toContain('Khám phá ưu đãi');

      const htmlAnno = renderNotificationEmailHtml({
        notification: { ...baseNotif, type: 'announcement' }
      });
      expect(htmlAnno).not.toContain('Khám phá ưu đãi');
    });

    it('palette đổi theo type — promotion = orange, maintenance = red', () => {
      const promoHtml = renderNotificationEmailHtml({ notification: baseNotif });
      expect(promoHtml).toContain('#fff7ed'); // bg orange-ish

      const maintHtml = renderNotificationEmailHtml({
        notification: { ...baseNotif, type: 'maintenance' }
      });
      expect(maintHtml).toContain('#fef2f2'); // bg red-ish
    });

    it('user.full_name hiển thị trong greeting + user info chip', () => {
      const html = renderNotificationEmailHtml({
        notification: baseNotif,
        user: { full_name: 'Trần Thị B', email: 'b@example.com', plan: 'enterprise' }
      });
      // 1) Greeting chứa tên user (escape an toàn — chỉ escape < > & ' ")
      expect(html).toMatch(/Xin chào\s+<strong style="color:#f97316;">Trần Thị B<\/strong>/);
      // 2) User info chip hiển thị tên + email
      expect(html).toContain('Trần Thị B</p>');
      expect(html).toContain('b@example.com</p>');
    });

    it('fallback sample user khi user=null', () => {
      const html = renderNotificationEmailHtml({ notification: baseNotif, user: null });
      expect(html).toContain('Nguyễn Văn Test');
      expect(html).toContain('test@example.com');
    });

    it('locale=en đổi label + greeting sang tiếng Anh', () => {
      const html = renderNotificationEmailHtml({ notification: baseNotif, locale: 'en' });
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('Hello');
      expect(html).toContain('Promotion');
    });

    it('device=mobile đổi max-width', () => {
      const mobileHtml = renderNotificationEmailHtml({ notification: baseNotif, device: 'mobile' });
      const desktopHtml = renderNotificationEmailHtml({ notification: baseNotif, device: 'desktop' });
      expect(mobileHtml).toContain('max-width: 375px');
      expect(desktopHtml).toContain('max-width: 680px');
    });

    it('replace {{user_name}} trong title bằng user.full_name thật (không phải sample)', () => {
      const html = renderNotificationEmailHtml({
        notification: { ...baseNotif, title: 'Hi {{user_name}}' },
        user: { full_name: 'Lê Văn C', email: 'c@example.com' }
      });
      expect(html).toContain('Hi Lê Văn C');
      // Đảm bảo KHÔNG render sample user khi user thật có
      expect(html).not.toContain('Hi Nguyễn Văn Test');
    });

    it('render với notification rỗng vẫn cho HTML hợp lệ (placeholder title/message)', () => {
      const html = renderNotificationEmailHtml({ notification: {} });
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('Tiêu đề thông báo'); // fallback VI
      expect(html).toContain('Nội dung thông báo sẽ hiển thị ở đây...');
    });

    it('html_content có <style> bị strip (CSS injection vào email client)', () => {
      // Admin paste template có <style> → email nhận trước đây hiển thị raw. Sau
      // sanitize phải MẤT toàn bộ khối <style>...content...</style> + thẻ tự đóng.
      const html = renderNotificationEmailHtml({
        notification: {
          type: 'announcement',
          title: 'T',
          message: 'plain',
          html_content: '<style>.x{color:red}</style><p>Safely kept paragraph</p><link rel="stylesheet" href="evil.css">'
        }
      });
      expect(html).not.toContain('<style>');
      expect(html).not.toContain('</style>');
      expect(html).not.toContain('<link');
      expect(html).not.toContain('.x{color:red}');
      expect(html).not.toContain('evil.css');
      // Paragraph được phép ở lại (whitelist) không chứa class.
      expect(html).toContain('<p>Safely kept paragraph</p>');
    });

    it('html_content có <script> bị strip hoàn toàn cả nội dung', () => {
      const html = renderNotificationEmailHtml({
        notification: {
          type: 'announcement',
          title: 'T',
          message: 'plain',
          html_content: '<p>before</p><script>alert("XSS")</script><p>after</p>'
        }
      });
      expect(html).not.toContain('<script');
      expect(html).not.toContain('alert');
      expect(html).not.toContain('"XSS"');
      // Paragraph được giữ.
      expect(html).toContain('<p>before</p>');
      expect(html).toContain('<p>after</p>');
    });

    it('html_content có event handler onclick/onload bị strip attribute', () => {
      const html = renderNotificationEmailHtml({
        notification: {
          type: 'announcement',
          title: 'T',
          message: 'plain',
          html_content: '<p onclick="alert(1)" onload="x()" data-foo="1">Safe text</p>'
        }
      });
      expect(html).not.toContain('onclick');
      expect(html).not.toContain('onload');
      expect(html).not.toContain('alert(1)');
      expect(html).not.toContain('data-foo');
      // Text + `<p>` tag sạch vẫn còn
      expect(html).toContain('Safe text');
      expect(html).toMatch(/<p>Safe text<\/p>/);
    });

    it('html_content có style= attribute bị strip (CSS injection)', () => {
      // style="..." trong html_content bị SANITIZER strip. NHƯNG style="..." do
      // renderer chèn vào layout email (header gradient/box) là cố ý — phải
      // còn. Kiểm tra: javascript: scheme trong style phải MẤT.
      const html = renderNotificationEmailHtml({
        notification: {
          type: 'promotion',
          title: 'T',
          message: 'm',
          html_content: '<h2 style="background:url(javascript:alert(1))">Hi</h2>'
        }
      });
      // javascript: trong style không lọt vào output
      expect(html).not.toContain('javascript:');
      // <h2> còn (whitelisted), style bị strip
      expect(html).toMatch(/<h2>Hi<\/h2>/);
      // Layout email (header, gradient) vẫn có style= do renderer hardcode
      expect(html).toContain('linear-gradient');
    });

    it('html_content có <a href="javascript:"> → bỏ href nguy hiểm, thẻ a vô hại', () => {
      // Behavior: javascript:/data: → href rỗng, GIỮ thẻ <a> (để link text hiển thị).
      // User không click được vì không có href → an toàn. Layout vẫn đẹp.
      const html = renderNotificationEmailHtml({
        notification: {
          type: 'announcement',
          title: 'T',
          message: 'm',
          html_content: '<a href="javascript:alert(1)">Bad JS</a><a href="data:text/html,evil">Bad Data</a>'
        }
      });
      expect(html).not.toContain('javascript:');
      expect(html).not.toContain('data:text/html');
      // Thẻ a không href → vô hại, text hiển thị
      expect(html).toContain('Bad JS');
      expect(html).toContain('Bad Data');
      // Chuỗi xấu nằm trong attribute, không có trong body markup
      expect(html).not.toContain('alert(1)');
    });

    it('thẻ không whitelist (table, svg) bị xóa, text bên trong vẫn còn', () => {
      const html = renderNotificationEmailHtml({
        notification: {
          type: 'announcement',
          title: 'T',
          message: 'm',
          html_content: '<table><tr><td>cell-text</td></tr></table><p>paragraph</p>'
        }
      });
      expect(html).not.toContain('<table');
      expect(html).not.toContain('<tr>');
      expect(html).not.toContain('<td>');
      // Text bên trong table cell giữ lại (sanitize chỉ xóa thẻ, giữ text node)
      expect(html).toContain('cell-text');
      expect(html).toContain('<p>paragraph</p>');
    });

    it('LOGO url trong header layout KHÔNG bị ảnh hưởng (chèn trực tiếp vào template, không đi qua sanitizer)', () => {
      const html = renderNotificationEmailHtml({
        notification: { type: 'announcement', title: 'T', message: 'm' }
      });
      // Logo <img> nằm trong header gradient (do renderer hardcode), KHÔNG phải từ html_content
      expect(html).toContain('<img src="/logo.png"');
    });

    it('replace {{user_name}} rồi sanitize — tên user không thể mở tag', () => {
      // Edge case: user.full_name chứa `<` (vd nhập "Abc<Xss") — sau khi replace
      // {{user_name}} thành chuỗi đó, sanitize phải khóa nó lại, không open tag.
      const html = renderNotificationEmailHtml({
        notification: {
          type: 'announcement',
          title: 'Hello',
          message: 'm',
          html_content: '<p>Hi {{user_name}}!</p>'
        },
        user: { full_name: 'Abc<Xss>' }
      });
      // Chỉ dòng chứa `<Xss>` raw → sanitize escape thành `&lt;` chứ không open tag.
      // (User name đã được replace vào text trước sanitize.)
      // Phương án an toàn: KHÔNG có `<Xss>` raw HTML tag. Có thể có escaped.
      expect(html).not.toContain('<Xss>');
      expect(html).not.toContain('Abc<Xss>' + '!');
    });

    it('html_content rỗng/whitespace → fallback message (escape)', () => {
      const html = renderNotificationEmailHtml({
        notification: {
          type: 'announcement',
          title: 'T',
          message: 'plain & <safe>',
          html_content: '   ' // whitespace only → coi như rỗng
        }
      });
      // html_content rỗng → message được escape
      expect(html).toContain('plain &amp; &lt;safe&gt;');
    });
  });
});

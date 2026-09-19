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
  });
});

import { describe, expect, it } from '@jest/globals';
import {
  buildWelcomeEmail,
  getDefaultWelcomeEmailTemplate,
} from '../systemEmail.util.js';

describe('system welcome email template', () => {
  it('mẫu mặc định công khai các biến cần thiết để super admin chỉnh sửa', () => {
    const template = getDefaultWelcomeEmailTemplate();
    expect(template.subject).toContain('Chào mừng');
    expect(template.bodyHtml).toContain('{{user_name}}');
    expect(template.bodyHtml).toContain('{{plan_section}}');
    expect(template.bodyHtml).toContain('{{login_url}}');
  });

  it('render biến tùy chỉnh và escape dữ liệu thành viên trong HTML', () => {
    const result = buildWelcomeEmail({
      fullName: '<img src=x onerror=alert(1)>',
      email: 'member@example.com',
      planName: 'Dùng thử',
      loginUrl: 'https://founderai.biz/login?from=a&to=b',
      template: {
        subject: 'Chào {{user_name}}',
        bodyHtml: '<p>{{user_name}}</p><a href="{{login_url}}">Vào app</a>{{plan_section}}',
      },
    });

    expect(result.subject).toBe('Chào <img src=x onerror=alert(1)>');
    expect(result.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(result.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(result.html).toContain('https://founderai.biz/login?from=a&amp;to=b');
    expect(result.html).toContain('Dùng thử');
    expect(result.html).not.toContain('{{plan_section}}');
  });

  it('ẩn toàn bộ khối gói khi đăng ký không được cấp gói', () => {
    const result = buildWelcomeEmail({
      fullName: 'Minh',
      email: 'minh@example.com',
      planName: null,
      loginUrl: 'https://founderai.biz/login',
    });
    expect(result.html).not.toContain('Gói của bạn');
    expect(result.html).not.toContain('{{plan_section}}');
  });

  it('mẫu mặc định sau khi được lưu tùy chỉnh vẫn render được khối gói', () => {
    const result = buildWelcomeEmail({
      fullName: 'Minh',
      email: 'minh@example.com',
      planName: 'Dùng thử',
      loginUrl: 'https://founderai.biz/login',
      template: getDefaultWelcomeEmailTemplate(),
    });
    expect(result.html).toContain('Gói của bạn');
    expect(result.html).toContain('Dùng thử');
    expect(result.html).not.toContain('{{user_name}}');
  });
});

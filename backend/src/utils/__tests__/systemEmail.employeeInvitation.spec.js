import { describe, expect, it } from '@jest/globals';
import {
  getDefaultEmployeeInvitationTemplate,
  buildEmployeeInvitationEmail,
} from '../systemEmail.util.js';

describe('system employee invitation email template', () => {
  it('mẫu mặc định và email render chứa chữ đăng ký tài khoản mới, không chứa chữ cũ', () => {
    const template = getDefaultEmployeeInvitationTemplate();

    // Mẫu mặc định
    expect(template.bodyHtml).toContain('Đăng ký tài khoản →');
    expect(template.bodyHtml).toContain('nhấn nút trên để hoàn tất đăng ký tài khoản');
    expect(template.bodyHtml).toContain('Link đăng ký có hiệu lực');
    expect(template.bodyHtml).not.toContain('Kích hoạt tài khoản');
    expect(template.bodyHtml).not.toContain('Sau khi vào hệ thống');

    // Email render từ mẫu mặc định
    const result = buildEmployeeInvitationEmail({
      ownerName: 'Admin Nhóm',
      email: 'nhanvien@example.com',
      activationUrl: 'https://founderai.biz/register?invite=tok123',
      expiryHours: 48,
    });

    expect(result.html).toContain('Đăng ký tài khoản');
    expect(result.html).not.toContain('Kích hoạt tài khoản');
    expect(result.html).not.toContain('Sau khi vào hệ thống');
  });

  it('render biến tùy chỉnh trong thư mời nhân viên', () => {
    const result = buildEmployeeInvitationEmail({
      ownerName: 'Công ty ABC',
      email: 'nhanvien.moi@example.com',
      activationUrl: 'https://founderai.biz/register?invite=sample_token',
      expiryHours: 72,
      template: {
        subject: 'Mời bạn gia nhập {{owner_name}}',
        bodyHtml: '<p>Xin chào {{user_email}} từ {{owner_name}}, vào {{activation_url}}, hạn {{expiry_hours}} giờ.</p>',
      },
    });

    expect(result.subject).toBe('Mời bạn gia nhập Công ty ABC');
    expect(result.html).toContain('Xin chào nhanvien.moi@example.com từ Công ty ABC');
    expect(result.html).toContain('https://founderai.biz/register?invite=sample_token');
    expect(result.html).toContain('hạn 72 giờ');
  });
});

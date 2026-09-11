import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFind = jest.fn();
const mockSave = jest.fn();
const mockDelete = jest.fn();
const mockBuildWelcomeEmail = jest.fn();
const mockSendSystemEmail = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/systemEmailTemplate.repository.js', () => ({
  findWelcomeEmailTemplate: mockFind,
  saveWelcomeEmailTemplate: mockSave,
  deleteWelcomeEmailTemplate: mockDelete,
}));

jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  getDefaultWelcomeEmailTemplate: jest.fn(() => ({
    subject: 'Mặc định',
    bodyHtml: '<p>Xin chào {{user_name}}</p>',
  })),
  buildWelcomeEmail: mockBuildWelcomeEmail,
  sendSystemEmail: mockSendSystemEmail,
}));

const {
  getWelcomeEmailTemplate,
  normalizeWelcomeEmailTemplate,
  previewWelcomeEmailTemplate,
  resetWelcomeEmailTemplate,
  sendWelcomeEmail,
  updateWelcomeEmailTemplate,
} = await import('../welcomeEmailTemplate.service.js');

describe('welcomeEmailTemplate.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildWelcomeEmail.mockReturnValue({ subject: 'Đã render', html: '<p>Rendered</p>' });
    mockSendSystemEmail.mockResolvedValue({ messageId: 'mail-1' });
  });

  it('trả mẫu mặc định khi super admin chưa tùy chỉnh', async () => {
    mockFind.mockResolvedValue(null);

    await expect(getWelcomeEmailTemplate()).resolves.toEqual({
      subject: 'Mặc định',
      bodyHtml: '<p>Xin chào {{user_name}}</p>',
      isCustomized: false,
      updatedBy: null,
      updatedAt: null,
    });
  });

  it('chuẩn hóa tiêu đề, loại script và từ chối biến lạ', () => {
    expect(normalizeWelcomeEmailTemplate({
      subject: '  Chào mừng\r\nthành viên  ',
      bodyHtml: '<p>Chào {{user_name}}</p><script>alert(1)</script>',
    })).toEqual({
      subject: 'Chào mừng thành viên',
      bodyHtml: '<p>Chào {{user_name}}</p>',
    });

    expect(() => normalizeWelcomeEmailTemplate({
      subject: 'Chào mừng',
      bodyHtml: '<p>{{password}}</p>',
    })).toThrow('Biến không được hỗ trợ: password');
  });

  it('lưu bản tùy chỉnh cùng người cập / reset về mặc định', async () => {
    mockSave.mockResolvedValue({
      subject: 'Chào {{user_name}}',
      body_html: '<p>Nội dung</p>',
      updated_by: 42,
      updated_at: '2026-09-11T06:00:00.000Z',
    });

    await expect(updateWelcomeEmailTemplate({
      subject: 'Chào {{user_name}}',
      bodyHtml: '<p>Nội dung</p>',
    }, 42)).resolves.toMatchObject({
      subject: 'Chào {{user_name}}',
      isCustomized: true,
      updatedBy: 42,
    });
    expect(mockSave).toHaveBeenCalledWith({
      subject: 'Chào {{user_name}}',
      bodyHtml: '<p>Nội dung</p>',
      updatedBy: 42,
    });

    await expect(resetWelcomeEmailTemplate()).resolves.toMatchObject({ isCustomized: false });
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('xem trước bằng dữ liệu mẫu mà không lưu', () => {
    expect(previewWelcomeEmailTemplate({
      subject: 'Chào {{user_name}}',
      bodyHtml: '<p>{{user_email}}</p>',
    })).toEqual({ subject: 'Đã render', html: '<p>Rendered</p>' });
    expect(mockBuildWelcomeEmail).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'Nguyễn Minh Anh',
      email: 'minhanh@example.com',
      template: {
        subject: 'Chào {{user_name}}',
        bodyHtml: '<p>{{user_email}}</p>',
      },
    }));
  });

  it('dùng bản tùy chỉnh khi gửi và fallback mặc định nếu đọc DB lỗi', async () => {
    mockFind.mockResolvedValueOnce({
      subject: 'Tùy chỉnh',
      body_html: '<p>Custom</p>',
    });
    await sendWelcomeEmail({
      to: 'member@example.com',
      fullName: 'Member',
      planName: 'Trial',
      loginUrl: 'https://example.com/login',
    });
    expect(mockBuildWelcomeEmail).toHaveBeenLastCalledWith(expect.objectContaining({
      template: { subject: 'Tùy chỉnh', bodyHtml: '<p>Custom</p>' },
    }));
    expect(mockSendSystemEmail).toHaveBeenLastCalledWith({
      to: 'member@example.com',
      subject: 'Đã render',
      html: '<p>Rendered</p>',
    });

    mockFind.mockRejectedValueOnce(new Error('relation missing'));
    await expect(sendWelcomeEmail({
      to: 'fallback@example.com',
      loginUrl: 'https://example.com/login',
    })).resolves.toEqual({ messageId: 'mail-1' });
    expect(mockBuildWelcomeEmail).toHaveBeenLastCalledWith(expect.objectContaining({ template: null }));
  });
});


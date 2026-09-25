import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFind = jest.fn();
const mockSave = jest.fn();
const mockDelete = jest.fn();
const mockBuildWelcomeEmail = jest.fn();
const mockBuildRenewalReminderEmail = jest.fn();
const mockBuildPlanExpiredEmail = jest.fn();
const mockBuildEmployeeInvitationEmail = jest.fn();
const mockSendSystemEmail = jest.fn();

// PR-2b (13/09/2026, PLAN_CANH_BAO_SAP_HET_HAN_GOI mục 4.2) — repository đã tổng quát hoá,
// 3 hàm đổi tên + nhận templateKey làm tham số đầu (findSystemEmailTemplate/saveSystemEmailTemplate/
// deleteSystemEmailTemplate, không còn hàm riêng cho welcome).
jest.unstable_mockModule('../../../repositories/admin/systemEmailTemplate.repository.js', () => ({
  findSystemEmailTemplate: mockFind,
  saveSystemEmailTemplate: mockSave,
  deleteSystemEmailTemplate: mockDelete,
}));

jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  getDefaultWelcomeEmailTemplate: jest.fn(() => ({
    subject: 'Mặc định',
    bodyHtml: '<p>Xin chào {{user_name}}</p>',
  })),
  getDefaultPlanExpiringEmailTemplate: jest.fn(() => ({
    subject: 'Mặc định sắp hết hạn',
    bodyHtml: '<p>Còn {{days_left}} ngày</p>',
  })),
  getDefaultPlanExpiredEmailTemplate: jest.fn(() => ({
    subject: 'Mặc định đã hết hạn',
    bodyHtml: '<p>Gói {{plan_name}} đã hết hạn</p>',
  })),
  getDefaultEmployeeInvitationTemplate: jest.fn(() => ({
    subject: 'Mặc định lời mời tham gia',
    bodyHtml: '<p>Lời mời từ {{owner_name}}</p>',
  })),
  buildWelcomeEmail: mockBuildWelcomeEmail,
  buildRenewalReminderEmail: mockBuildRenewalReminderEmail,
  buildPlanExpiredEmail: mockBuildPlanExpiredEmail,
  buildEmployeeInvitationEmail: mockBuildEmployeeInvitationEmail,
  sendSystemEmail: mockSendSystemEmail,
}));

const {
  getSystemEmailTemplate,
  getWelcomeEmailTemplate,
  loadCustomSystemEmailTemplate,
  normalizeSystemEmailTemplate,
  normalizeWelcomeEmailTemplate,
  previewSystemEmailTemplate,
  previewWelcomeEmailTemplate,
  resetSystemEmailTemplate,
  resetWelcomeEmailTemplate,
  sendWelcomeEmail,
  SYSTEM_EMAIL_TEMPLATE_KEYS,
  updateSystemEmailTemplate,
  updateWelcomeEmailTemplate,
} = await import('../welcomeEmailTemplate.service.js');

describe('welcomeEmailTemplate.service — backward-compat "welcome" (KHÔNG đổi hành vi)', () => {
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
    expect(mockFind).toHaveBeenCalledWith('welcome');
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
    // saveSystemEmailTemplate(templateKey, data) — templateKey 'welcome' phải đi kèm tự động.
    expect(mockSave).toHaveBeenCalledWith('welcome', {
      subject: 'Chào {{user_name}}',
      bodyHtml: '<p>Nội dung</p>',
      updatedBy: 42,
    });

    await expect(resetWelcomeEmailTemplate()).resolves.toMatchObject({ isCustomized: false });
    expect(mockDelete).toHaveBeenCalledWith('welcome');
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

  // Rủi ro lớn nhất của PR-2b: sendWelcomeEmail được auth.controller.js:227/:586 gọi thẳng trong
  // luồng đăng ký. Chữ ký và hành vi (fallback khi DB lỗi) PHẢI giữ nguyên tuyệt đối.
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
    expect(mockFind).toHaveBeenCalledWith('welcome');
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

describe('welcomeEmailTemplate.service — tổng quát hoá đa khoá (PR-2b việc 6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildRenewalReminderEmail.mockReturnValue({ subject: 'Renewal rendered', html: '<p>Renewal</p>' });
    mockBuildPlanExpiredEmail.mockReturnValue({ subject: 'Expired rendered', html: '<p>Expired</p>' });
    mockBuildEmployeeInvitationEmail.mockReturnValue({ subject: 'Invitation rendered', html: '<p>Invitation</p>' });
  });

  it('SYSTEM_EMAIL_TEMPLATE_KEYS đúng 4 khoá — welcome, plan_expiring, plan_expired, employee_invitation', () => {
    expect(SYSTEM_EMAIL_TEMPLATE_KEYS).toEqual(['welcome', 'plan_expiring', 'plan_expired', 'employee_invitation']);
  });

  it('getSystemEmailTemplate("plan_expiring") trả mẫu mặc định riêng khi chưa tùy chỉnh', async () => {
    mockFind.mockResolvedValue(null);
    await expect(getSystemEmailTemplate('plan_expiring')).resolves.toEqual({
      subject: 'Mặc định sắp hết hạn',
      bodyHtml: '<p>Còn {{days_left}} ngày</p>',
      isCustomized: false,
      updatedBy: null,
      updatedAt: null,
    });
    expect(mockFind).toHaveBeenCalledWith('plan_expiring');
  });

  it('getSystemEmailTemplate("plan_expired") trả mẫu mặc định riêng — không lẫn với plan_expiring', async () => {
    mockFind.mockResolvedValue(null);
    await expect(getSystemEmailTemplate('plan_expired')).resolves.toMatchObject({
      subject: 'Mặc định đã hết hạn',
      isCustomized: false,
    });
  });

  it('updateSystemEmailTemplate lưu đúng templateKey, resetSystemEmailTemplate xoá đúng khoá', async () => {
    mockSave.mockResolvedValue({
      subject: 'Còn {{days_left}} ngày nữa thôi',
      body_html: '<p>{{user_name}} ơi</p>',
      updated_by: 7,
      updated_at: '2026-09-13T00:00:00.000Z',
    });

    await updateSystemEmailTemplate('plan_expiring', {
      subject: 'Còn {{days_left}} ngày nữa thôi',
      bodyHtml: '<p>{{user_name}} ơi</p>',
    }, 7);
    expect(mockSave).toHaveBeenCalledWith('plan_expiring', {
      subject: 'Còn {{days_left}} ngày nữa thôi',
      bodyHtml: '<p>{{user_name}} ơi</p>',
      updatedBy: 7,
    });

    await resetSystemEmailTemplate('plan_expired');
    expect(mockDelete).toHaveBeenCalledWith('plan_expired');
  });

  // Chốt "mỗi khoá một danh sách biến RIÊNG" — biến hợp lệ của welcome (docs_url) không được
  // lẫn sang plan_expiring, và ngược lại (days_left của plan_expiring không lọt vào welcome).
  it('danh sách biến độc lập theo khoá — biến của khoá này bị từ chối ở khoá khác', () => {
    expect(() => normalizeSystemEmailTemplate('plan_expiring', {
      subject: 'Chào',
      bodyHtml: '<p>{{docs_url}}</p>', // hợp lệ cho welcome, KHÔNG hợp lệ cho plan_expiring
    })).toThrow('Biến không được hỗ trợ: docs_url');

    expect(() => normalizeWelcomeEmailTemplate({
      subject: 'Chào',
      bodyHtml: '<p>{{days_left}}</p>', // hợp lệ cho plan_expiring, KHÔNG hợp lệ cho welcome
    })).toThrow('Biến không được hỗ trợ: days_left');

    // Nhưng biến đúng khoá thì qua được — không phải mọi biến đều bị chặn.
    expect(() => normalizeSystemEmailTemplate('plan_expiring', {
      subject: 'Chào',
      bodyHtml: '<p>{{days_left}} — {{grace_days}}</p>',
    })).not.toThrow();
  });

  it('previewSystemEmailTemplate("plan_expiring") gọi buildRenewalReminderEmail với dữ liệu mẫu', () => {
    const result = previewSystemEmailTemplate('plan_expiring', {
      subject: 'Còn {{days_left}} ngày',
      bodyHtml: '<p>{{plan_name}}</p>',
    });
    expect(result).toEqual({ subject: 'Renewal rendered', html: '<p>Renewal</p>' });
    expect(mockBuildRenewalReminderEmail).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'Nguyễn Minh Anh',
      planName: 'Chuyên nghiệp',
      daysLeft: 3,
      template: { subject: 'Còn {{days_left}} ngày', bodyHtml: '<p>{{plan_name}}</p>' },
    }));
  });

  it('previewSystemEmailTemplate("plan_expired") gọi buildPlanExpiredEmail với dữ liệu mẫu', () => {
    const result = previewSystemEmailTemplate('plan_expired', {
      subject: 'Đã hết hạn',
      bodyHtml: '<p>{{plan_name}}</p>',
    });
    expect(result).toEqual({ subject: 'Expired rendered', html: '<p>Expired</p>' });
    expect(mockBuildPlanExpiredEmail).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'Nguyễn Minh Anh',
      planName: 'Chuyên nghiệp',
      template: { subject: 'Đã hết hạn', bodyHtml: '<p>{{plan_name}}</p>' },
    }));
  });

  it('previewSystemEmailTemplate("employee_invitation") gọi buildEmployeeInvitationEmail với dữ liệu mẫu', () => {
    const result = previewSystemEmailTemplate('employee_invitation', {
      subject: 'Mời tham gia {{owner_name}}',
      bodyHtml: '<p>Kích hoạt tại {{activation_url}} trong {{expiry_hours}} giờ</p>',
    });
    expect(result).toEqual({ subject: 'Invitation rendered', html: '<p>Invitation</p>' });
    expect(mockBuildEmployeeInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({
      template: {
        subject: 'Mời tham gia {{owner_name}}',
        bodyHtml: '<p>Kích hoạt tại {{activation_url}} trong {{expiry_hours}} giờ</p>',
      },
      ownerName: 'Admin Nhóm',
      email: 'nhanvien.moi@example.com',
      expiryHours: 48,
    }));
  });

  it('getSystemEmailTemplate("employee_invitation") trả mẫu mặc định riêng khi chưa tùy chỉnh', async () => {
    mockFind.mockResolvedValue(null);
    await expect(getSystemEmailTemplate('employee_invitation')).resolves.toEqual({
      subject: 'Mặc định lời mời tham gia',
      bodyHtml: '<p>Lời mời từ {{owner_name}}</p>',
      isCustomized: false,
      updatedBy: null,
      updatedAt: null,
    });
    expect(mockFind).toHaveBeenCalledWith('employee_invitation');
  });

  it('normalizeSystemEmailTemplate("employee_invitation") chấp nhận biến hợp lệ và từ chối biến không thuộc whitelist', () => {
    expect(() => normalizeSystemEmailTemplate('employee_invitation', {
      subject: '[{{sender_name}}] Lời mời từ {{owner_name}}',
      bodyHtml: '<p>Email {{user_email}}, link {{activation_url}}, hết hạn {{expiry_hours}} giờ, hỗ trợ {{support_email}}</p>',
    })).not.toThrow();

    expect(() => normalizeSystemEmailTemplate('employee_invitation', {
      subject: 'Lời mời',
      bodyHtml: '<p>{{days_left}}</p>',
    })).toThrow('Biến không được hỗ trợ: days_left');
  });

  // Đây là hàm scheduler.js/subscriptionExpiry.service.js sẽ gọi trước khi gửi thư thật —
  // chốt hành vi fallback (lỗi/không có bản tùy chỉnh → null, KHÔNG throw) độc lập khỏi
  // sendWelcomeEmail. Đột biến: bỏ nhánh catch ở loadCustomSystemEmailTemplate → ca dưới đỏ vì
  // promise reject thay vì resolve null.
  it('loadCustomSystemEmailTemplate: có bản tùy chỉnh → trả về đã chuẩn hoá; lỗi/không có → null, không throw', async () => {
    mockFind.mockResolvedValueOnce({ subject: 'Còn {{days_left}} ngày', body_html: '<p>{{plan_name}}</p>' });
    await expect(loadCustomSystemEmailTemplate('plan_expiring')).resolves.toEqual({
      subject: 'Còn {{days_left}} ngày',
      bodyHtml: '<p>{{plan_name}}</p>',
    });

    mockFind.mockResolvedValueOnce(null);
    await expect(loadCustomSystemEmailTemplate('plan_expired')).resolves.toBeNull();

    mockFind.mockRejectedValueOnce(new Error('relation missing'));
    await expect(loadCustomSystemEmailTemplate('plan_expiring')).resolves.toBeNull();
  });

  // Nghiệm thu bắt buộc thêm (mục 4, "Mẫu trong DB có biến lạ {{khong_ton_tai}} → không nổ,
  // không rò chuỗi thô ra thư"). Hàng trong DB không đi qua validate lúc lưu (vd dữ liệu cũ
  // trước migration 206, hoặc sửa tay) có thể chứa biến ngoài whitelist —
  // normalizeSystemEmailTemplate() throw đúng lúc load lại, try/catch của
  // loadCustomSystemEmailTemplate bắt được và trả null — KHÔNG để lọt bản có biến lạ ra
  // buildXxxEmail() (nơi mới thật sự ghép chuỗi gửi đi).
  it('mẫu trong DB có biến lạ (ngoài whitelist của khoá) → coi như lỗi, trả null, không throw', async () => {
    mockFind.mockResolvedValueOnce({
      subject: 'Chào {{khong_ton_tai}}',
      body_html: '<p>{{khong_ton_tai}}</p>',
    });
    await expect(loadCustomSystemEmailTemplate('plan_expiring')).resolves.toBeNull();
  });
});

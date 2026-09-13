import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminWelcomeEmailPage from './AdminWelcomeEmailPage';

const {
  mockGetTemplate,
  mockPreviewTemplate,
  mockResetTemplate,
  mockUpdateTemplate,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockGetTemplate: vi.fn(),
  mockPreviewTemplate: vi.fn(),
  mockResetTemplate: vi.fn(),
  mockUpdateTemplate: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: mockToastSuccess,
    error: vi.fn(),
  },
}));

vi.mock('../../features/admin/services/adminSystemEmailTemplateApi.service', () => ({
  default: {
    getTemplate: mockGetTemplate,
    previewTemplate: mockPreviewTemplate,
    resetTemplate: mockResetTemplate,
    updateTemplate: mockUpdateTemplate,
  },
}));

function response(data) {
  return { data: { data } };
}

const welcomeTemplate = {
  subject: 'Chào mừng đến với Founder AI!',
  bodyHtml: '<p>Xin chào {{user_name}}</p>',
  isCustomized: false,
  updatedAt: null,
  variables: ['user_name', 'user_email', 'login_url'],
};

const planExpiringTemplate = {
  subject: 'Còn {{days_left}} ngày là hết hạn gói {{plan_name}}',
  bodyHtml: '<p>{{user_name}} ơi, còn {{days_left}} ngày.</p>',
  isCustomized: false,
  updatedAt: null,
  variables: ['user_name', 'plan_name', 'days_left'],
};

// PR-2b (13/09/2026, PLAN_CANH_BAO_SAP_HET_HAN_GOI mục 4.2, mục 5 ca 14) — trang này giờ sửa
// được cả 3 mẫu thư (welcome/plan_expiring/plan_expired) qua bộ chọn mẫu, không chỉ welcome.
describe('AdminWelcomeEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTemplate.mockImplementation((key) => Promise.resolve(
      response(key === 'plan_expiring' ? planExpiringTemplate : welcomeTemplate)
    ));
    mockPreviewTemplate.mockImplementation((_key, template) => Promise.resolve(response({
      subject: `Preview: ${template.subject}`,
      html: `<html><body>${template.bodyHtml}</body></html>`,
    })));
    mockUpdateTemplate.mockImplementation((_key, template) => Promise.resolve(response({
      ...template,
      isCustomized: true,
      updatedAt: '2026-09-11T06:00:00.000Z',
    })));
    mockResetTemplate.mockImplementation(() => Promise.resolve(response(welcomeTemplate)));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('nêu đúng vị trí, cho sửa/preview/lưu và khôi phục mẫu mặc định (mẫu welcome)', async () => {
    render(
      <I18nProvider>
        <AdminWelcomeEmailPage />
      </I18nProvider>
    );

    expect(await screen.findByText('Email chào mừng thành viên')).toBeInTheDocument();
    expect(screen.getByText(/Quản trị hệ thống → AI & thông báo → Email chào mừng/)).toBeInTheDocument();
    expect(mockGetTemplate).toHaveBeenCalledWith('welcome');
    expect(mockPreviewTemplate).toHaveBeenCalledWith('welcome', {
      subject: welcomeTemplate.subject,
      bodyHtml: welcomeTemplate.bodyHtml,
    });

    fireEvent.change(screen.getByLabelText('Tiêu đề email'), {
      target: { value: 'Chào {{user_name}}' },
    });
    const body = screen.getByLabelText('Nội dung HTML');
    fireEvent.change(body, { target: { value: '<p>Nội dung mới</p>' } });
    fireEvent.click(screen.getByRole('button', { name: '{{user_email}}' }));
    expect(body.value).toContain('{{user_email}}');

    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật xem trước' }));
    await waitFor(() => expect(mockPreviewTemplate).toHaveBeenLastCalledWith('welcome', {
      subject: 'Chào {{user_name}}',
      bodyHtml: expect.stringContaining('{{user_email}}'),
    }));
    expect(screen.getByTitle('Bản xem trước email chào mừng')).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('Nội dung mới')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(mockUpdateTemplate).toHaveBeenCalledWith('welcome', {
      subject: 'Chào {{user_name}}',
      bodyHtml: expect.stringContaining('{{user_email}}'),
    }));
    expect(await screen.findByText('Đang dùng bản tùy chỉnh')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục mặc định' }));
    await waitFor(() => expect(mockResetTemplate).toHaveBeenCalledWith('welcome'));
    expect(screen.getByDisplayValue(welcomeTemplate.subject)).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith('Đã khôi phục mẫu email mặc định');
  });

  // Ca 14 của mục 5: super admin sửa mẫu plan_expiring, bấm xem trước → thấy chữ mới,
  // {{days_left}} được thay (giả lập qua mockPreviewTemplate — phần thay biến thật đã có ca
  // riêng ở backend adminSystemEmailTemplates.test.js).
  it('ca 14 — chọn mẫu plan_expiring: tải đúng mẫu, đổi tiêu đề trang, preview theo đúng khoá', async () => {
    render(
      <I18nProvider>
        <AdminWelcomeEmailPage />
      </I18nProvider>
    );
    await screen.findByText('Email chào mừng thành viên');

    fireEvent.click(screen.getByRole('button', { name: 'Email nhắc sắp hết hạn gói' }));

    expect(await screen.findByText('Email nhắc sắp hết hạn gói', { selector: 'h1' })).toBeInTheDocument();
    await waitFor(() => expect(mockGetTemplate).toHaveBeenCalledWith('plan_expiring'));
    expect(screen.getByDisplayValue(planExpiringTemplate.subject)).toBeInTheDocument();
    await waitFor(() => expect(mockPreviewTemplate).toHaveBeenLastCalledWith('plan_expiring', {
      subject: planExpiringTemplate.subject,
      bodyHtml: planExpiringTemplate.bodyHtml,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    // Chưa sửa gì nên nút Lưu vẫn disabled — không gọi updateTemplate.
    expect(mockUpdateTemplate).not.toHaveBeenCalled();
  });

  it('có nội dung chưa lưu mà đổi mẫu khác → hỏi xác nhận; từ chối thì giữ nguyên mẫu và không mất nội dung đang sửa', async () => {
    window.confirm.mockReturnValue(false);
    render(
      <I18nProvider>
        <AdminWelcomeEmailPage />
      </I18nProvider>
    );
    await screen.findByText('Email chào mừng thành viên');

    fireEvent.change(screen.getByLabelText('Tiêu đề email'), {
      target: { value: 'Bản đang sửa, chưa lưu' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Email nhắc sắp hết hạn gói' }));

    expect(window.confirm).toHaveBeenCalledWith('Nội dung đang sửa chưa được lưu. Chuyển mẫu khác sẽ bỏ các thay đổi này?');
    // Bị từ chối → vẫn ở mẫu welcome, nội dung đang sửa còn nguyên, KHÔNG gọi lại getTemplate.
    expect(screen.getByDisplayValue('Bản đang sửa, chưa lưu')).toBeInTheDocument();
    expect(mockGetTemplate).toHaveBeenCalledTimes(1);
  });
});

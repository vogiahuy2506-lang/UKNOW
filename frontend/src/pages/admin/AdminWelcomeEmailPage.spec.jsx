import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminWelcomeEmailPage from './AdminWelcomeEmailPage';

const {
  mockGet,
  mockPreview,
  mockReset,
  mockUpdate,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPreview: vi.fn(),
  mockReset: vi.fn(),
  mockUpdate: vi.fn(),
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
    getWelcomeTemplate: mockGet,
    previewWelcomeTemplate: mockPreview,
    resetWelcomeTemplate: mockReset,
    updateWelcomeTemplate: mockUpdate,
  },
}));

function response(data) {
  return { data: { data } };
}

const defaultTemplate = {
  subject: 'Chào mừng đến với Founder AI!',
  bodyHtml: '<p>Xin chào {{user_name}}</p>',
  isCustomized: false,
  updatedAt: null,
  variables: ['user_name', 'user_email', 'login_url'],
};

describe('AdminWelcomeEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(response(defaultTemplate));
    mockPreview.mockImplementation((template) => Promise.resolve(response({
      subject: `Preview: ${template.subject}`,
      html: `<html><body>${template.bodyHtml}</body></html>`,
    })));
    mockUpdate.mockImplementation((template) => Promise.resolve(response({
      ...template,
      isCustomized: true,
      updatedAt: '2026-09-11T06:00:00.000Z',
    })));
    mockReset.mockResolvedValue(response(defaultTemplate));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('nêu đúng vị trí, cho sửa/preview/lưu và khôi phục mẫu mặc định', async () => {
    render(
      <I18nProvider>
        <AdminWelcomeEmailPage />
      </I18nProvider>
    );

    expect(await screen.findByText('Email chào mừng thành viên')).toBeInTheDocument();
    expect(screen.getByText(/Quản trị hệ thống → AI & thông báo → Email chào mừng/)).toBeInTheDocument();
    expect(mockPreview).toHaveBeenCalledWith({
      subject: defaultTemplate.subject,
      bodyHtml: defaultTemplate.bodyHtml,
    });

    fireEvent.change(screen.getByLabelText('Tiêu đề email'), {
      target: { value: 'Chào {{user_name}}' },
    });
    const body = screen.getByLabelText('Nội dung HTML');
    fireEvent.change(body, { target: { value: '<p>Nội dung mới</p>' } });
    fireEvent.click(screen.getByRole('button', { name: '{{user_email}}' }));
    expect(body.value).toContain('{{user_email}}');

    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật xem trước' }));
    await waitFor(() => expect(mockPreview).toHaveBeenLastCalledWith({
      subject: 'Chào {{user_name}}',
      bodyHtml: expect.stringContaining('{{user_email}}'),
    }));
    expect(screen.getByTitle('Bản xem trước email chào mừng')).toHaveAttribute(
      'srcdoc',
      expect.stringContaining('Nội dung mới')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({
      subject: 'Chào {{user_name}}',
      bodyHtml: expect.stringContaining('{{user_email}}'),
    }));
    expect(await screen.findByText('Đang dùng bản tùy chỉnh')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Khôi phục mặc định' }));
    await waitFor(() => expect(mockReset).toHaveBeenCalledTimes(1));
    expect(screen.getByDisplayValue(defaultTemplate.subject)).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith('Đã khôi phục mẫu email mặc định');
  });
});

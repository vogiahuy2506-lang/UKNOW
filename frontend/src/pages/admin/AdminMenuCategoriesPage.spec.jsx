import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import AdminMenuCategoriesPage from './AdminMenuCategoriesPage';

const {
  mockGetLayout,
  mockUpdateLayout,
  mockGetAppLayout,
  mockUpdateAppLayout,
} = vi.hoisted(() => ({
  mockGetLayout: vi.fn(),
  mockUpdateLayout: vi.fn(),
  mockGetAppLayout: vi.fn(),
  mockUpdateAppLayout: vi.fn(),
}));

vi.mock('../../features/admin/services/adminMenuApi.service', () => ({
  ADMIN_MENU_LAYOUT_UPDATED_EVENT: 'founder-admin-menu-layout-updated',
  default: {
    getLayout: mockGetLayout,
    updateLayout: mockUpdateLayout,
    getAppLayout: mockGetAppLayout,
    updateAppLayout: mockUpdateAppLayout,
  },
}));

describe('AdminMenuCategoriesPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetLayout.mockResolvedValue({ data: { data: { categories: [] } } });
    mockUpdateLayout.mockImplementation((categories) => Promise.resolve({
      data: { data: { categories } },
    }));
    mockGetAppLayout.mockResolvedValue({ data: { data: { categories: [] } } });
    mockUpdateAppLayout.mockImplementation((categories) => Promise.resolve({
      data: { data: { categories } },
    }));
  });

  it('cho phép tạo chuyên mục, chuyển tab, đổi thứ tự và lưu toàn bộ bố cục', async () => {
    const updateEvent = vi.fn();
    window.addEventListener('founder-admin-menu-layout-updated', updateEvent);

    render(
      <I18nProvider>
        <AdminMenuCategoriesPage />
      </I18nProvider>
    );

    expect(await screen.findByText('Chuyên mục menu quản trị')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Tên chuyên mục tiếng Việt'), {
      target: { value: 'Ưu tiên' },
    });
    fireEvent.change(screen.getByPlaceholderText('Tên tiếng Anh (không bắt buộc)'), {
      target: { value: 'Priority' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }));

    const dashboardSelect = screen.getByRole('combobox', { name: 'Chuyên mục của Tổng quan' });
    const priorityOption = Array.from(dashboardSelect.options)
      .find((option) => option.textContent === 'Ưu tiên');
    fireEvent.change(dashboardSelect, { target: { value: priorityOption.value } });

    fireEvent.click(screen.getAllByRole('button', { name: 'Đưa chuyên mục xuống' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(mockUpdateLayout).toHaveBeenCalledTimes(1));
    const savedCategories = mockUpdateLayout.mock.calls[0][0];
    expect(savedCategories[0].id).toBe('business');
    expect(savedCategories.find((category) => category.nameVi === 'Ưu tiên')).toMatchObject({
      nameEn: 'Priority',
      itemKeys: ['dashboard'],
    });
    await waitFor(() => expect(updateEvent).toHaveBeenCalledTimes(1));

    window.removeEventListener('founder-admin-menu-layout-updated', updateEvent);
  });

  it('chuyển sang tab Menu Ứng dụng (/app), hiển thị catalog app_user và lưu không phát sự kiện live', async () => {
    const updateEvent = vi.fn();
    window.addEventListener('founder-admin-menu-layout-updated', updateEvent);

    render(
      <I18nProvider>
        <AdminMenuCategoriesPage />
      </I18nProvider>
    );

    expect(await screen.findByText('Chuyên mục menu quản trị')).toBeInTheDocument();

    const appTab = screen.getByRole('button', { name: 'Menu Ứng dụng (/app)' });
    fireEvent.click(appTab);

    await waitFor(() => expect(mockGetAppLayout).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('combobox', { name: 'Chuyên mục của Gửi nhanh' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Tên chuyên mục tiếng Việt'), {
      target: { value: 'Marketing Tự Động' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo mới' }));

    const quickSendSelect = screen.getByRole('combobox', { name: 'Chuyên mục của Gửi nhanh' });
    const mktOption = Array.from(quickSendSelect.options)
      .find((option) => option.textContent === 'Marketing Tự Động');
    fireEvent.change(quickSendSelect, { target: { value: mktOption.value } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(mockUpdateAppLayout).toHaveBeenCalledTimes(1));
    const savedCategories = mockUpdateAppLayout.mock.calls[0][0];
    expect(savedCategories.find((c) => c.nameVi === 'Marketing Tự Động')).toMatchObject({
      itemKeys: ['quick_send'],
    });

    // Không phát sự kiện live cho scope app_user
    expect(updateEvent).not.toHaveBeenCalled();
    window.removeEventListener('founder-admin-menu-layout-updated', updateEvent);
  });
});

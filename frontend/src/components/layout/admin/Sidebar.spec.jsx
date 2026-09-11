import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../i18n';
import Sidebar from './Sidebar';

const { mockGetLayout } = vi.hoisted(() => ({
  mockGetLayout: vi.fn(),
}));

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { role: 'admin', username: 'superadmin' },
    activeContext: { type: 'self' },
  }),
}));

vi.mock('../../../hooks/useScrollPersistence', () => ({
  useScrollPersistence: vi.fn(),
}));

vi.mock('../../../features/admin/services/adminMenuApi.service', () => ({
  ADMIN_MENU_LAYOUT_UPDATED_EVENT: 'founder-admin-menu-layout-updated',
  default: { getLayout: mockGetLayout },
}));

describe('Sidebar super admin menu layout', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetLayout.mockResolvedValue({
      data: {
        data: {
          categories: [{
            id: 'priority',
            nameVi: 'Ưu tiên',
            nameEn: 'Priority',
            itemKeys: ['orders', 'dashboard'],
          }],
        },
      },
    });
  });

  it('đọc cấu hình đã lưu và hiển thị tab theo đúng thứ tự', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <I18nProvider>
          <Sidebar isOpen isMobile={false} onToggle={vi.fn()} />
        </I18nProvider>
      </MemoryRouter>
    );

    const categoryButton = await screen.findByRole('button', { name: 'Ưu tiên' });
    fireEvent.click(categoryButton);

    await waitFor(() => {
      const links = screen.getAllByRole('link');
      expect(links[0]).toHaveAttribute('href', '/admin/orders');
      expect(links[1]).toHaveAttribute('href', '/admin');
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('founder-admin-menu-layout-updated', {
        detail: {
          categories: [{
            id: 'operations',
            nameVi: 'Vận hành',
            nameEn: 'Operations',
            itemKeys: ['dashboard', 'orders'],
          }],
        },
      }));
    });

    expect(screen.getByRole('button', { name: 'Vận hành' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đơn hàng' })).not.toBeInTheDocument();
  });
});

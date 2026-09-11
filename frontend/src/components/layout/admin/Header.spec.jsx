import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Header from './Header';

vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { role: 'user', fullName: 'Test User', email: 'test@example.com', memberships: [] },
    activeContext: { type: 'self' },
    logout: vi.fn(),
    switchContext: vi.fn(),
  }),
}));

vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    t: (key) => ({
      'header.docs': 'Hướng dẫn',
      'header.courses': 'Khóa học',
      'header.home': 'Trang chủ',
      'header.contact': 'Liên hệ',
      'header.upgrade': 'Nâng cấp',
    }[key] || key),
    locale: 'vi',
    changeLocale: vi.fn(),
  }),
}));

vi.mock('../../../contexts/useMarketplaceModal', () => ({
  useMarketplaceModal: () => ({ showMarketplace: vi.fn() }),
}));

vi.mock('../../../features/auth/components/AccountProfileModal', () => ({ default: () => null }));
vi.mock('../../../features/auth/components/ChangePasswordModal', () => ({ default: () => null }));

describe('Header help menu', () => {
  it('hiển thị menu con Khóa học với đúng liên kết ngoài', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Header />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hướng dẫn' }));

    const courseLink = screen.getByRole('menuitem', { name: 'Khóa học' });
    expect(courseLink).toHaveAttribute('href', 'https://khoahoc.founderai.biz/');
    expect(courseLink).toHaveAttribute('target', '_blank');
    expect(courseLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

/**
 * Khoá đúng một dòng mà bản vá /huong-dan treo vào: `MainLayout` phải render nội dung lồng trực
 * tiếp (`children`) thay cho `<Outlet />` khi được truyền. Đột biến xoá `children ??` không làm
 * đỏ spec của HelpDocsRoute (spec đó mock MainLayout), nên phải có ca riêng ở đây — nếu không,
 * trang hướng dẫn trong khung app sẽ mất sidebar tài liệu mà test vẫn xanh.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MainLayout from '../MainLayout';
import { useAuthStore } from '../../stores/authStore';

vi.mock('../../components/layout/admin/Sidebar', () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock('../../components/layout/admin/Header', () => ({ default: () => <div data-testid="header" /> }));
vi.mock('../../features/ai/AiChatbot', () => ({ default: () => null }));
vi.mock('../../components/layout/CreditWarningBanner', () => ({ default: () => null }));
vi.mock('../../features/auth/components/TrialWelcomeModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/PlanExpiryModal', () => ({ default: () => null }));
vi.mock('../../features/auth/hooks/usePostAuthGates', () => ({ usePostAuthGates: () => ({ anyGateOpen: false }) }));
vi.mock('../../hooks/useIsMobile', () => ({ default: () => false }));
vi.mock('../../i18n', () => ({ useI18n: () => ({ t: (key) => key }) }));

const renderAt = (element) => render(
  <MemoryRouter initialEntries={['/huong-dan']}>
    <Routes>
      <Route path="/huong-dan" element={element}>
        <Route index element={<div data-testid="noi-dung-route-con" />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

describe('MainLayout — nội dung lồng trực tiếp', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      activeContext: { type: 'self' },
      user: { id: 1, role: 'user', username: 'chu', fullName: 'Chủ tài khoản' },
      billingStatus: null,
      fetchAiCredits: async () => {},
    });
  });

  it('có children: render children, KHÔNG render route con qua Outlet', () => {
    renderAt(<MainLayout><div data-testid="noi-dung-long" /></MainLayout>);

    expect(screen.getByTestId('noi-dung-long')).toBeInTheDocument();
    expect(screen.queryByTestId('noi-dung-route-con')).toBeNull();
    // Khung app vẫn còn — đây là lý do lồng vào MainLayout.
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('không có children: giữ hành vi cũ, render route con qua Outlet', () => {
    renderAt(<MainLayout />);

    expect(screen.getByTestId('noi-dung-route-con')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });
});

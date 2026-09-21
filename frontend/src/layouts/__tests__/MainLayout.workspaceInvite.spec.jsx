/**
 * PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH PR-3 mục 5.1/5.3 — hai mắt xích nối vào khung app:
 *   (1) dải mời chuyển không gian phải có mặt trong MainLayout (spec của chính dải mock hết khung nên
 *       không chứng minh được chuyện này);
 *   (2) hook làm mới hồ sơ khi quay lại tab phải được bật cho người dùng thường, tắt cho admin/chưa đăng nhập.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MainLayout from '../MainLayout';
import { useAuthStore } from '../../stores/authStore';

const mockUseRefreshUserOnFocus = vi.fn();
vi.mock('../../hooks/useRefreshUserOnFocus', () => ({
  useRefreshUserOnFocus: (options) => mockUseRefreshUserOnFocus(options),
}));

vi.mock('../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: {} } }), post: vi.fn() },
  setAuthStore: vi.fn(),
}));
vi.mock('../../components/layout/admin/Sidebar', () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock('../../components/layout/admin/Header', () => ({ default: () => <div data-testid="header" /> }));
vi.mock('../../features/ai/AiChatbot', () => ({ default: () => null }));
vi.mock('../../components/layout/CreditWarningBanner', () => ({ default: () => null }));
vi.mock('../../features/auth/components/TrialWelcomeModal', () => ({ default: () => null }));
vi.mock('../../features/auth/components/PlanExpiryModal', () => ({ default: () => null }));
vi.mock('../../features/auth/hooks/usePostAuthGates', () => ({ usePostAuthGates: () => ({ anyGateOpen: false }) }));
vi.mock('../../hooks/useIsMobile', () => ({ default: () => false }));
vi.mock('../../i18n', async () => (await import('../../test/realI18n.js')).realI18nModule());

const renderLayout = (path = '/app') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/app" element={<MainLayout />}>
        <Route index element={<div data-testid="noi-dung" />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

const seed = ({ user, isAuthenticated = true, activeContext = { type: 'self' } }) => {
  useAuthStore.setState({
    isAuthenticated,
    isLoading: false,
    activeContext,
    user,
    billingStatus: null,
    fetchAiCredits: async () => {},
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('MainLayout — dải mời chuyển không gian', () => {
  it('đang ở self + có membership → dải mời hiện trong khung app', () => {
    seed({
      user: { id: 7, role: 'user', username: 'nv', memberships: [{ ownerId: 10, ownerName: 'Công ty A', isLocked: false }] },
    });
    renderLayout();

    expect(screen.getByTestId('workspace-invite-banner')).toHaveTextContent('Công ty A');
    expect(screen.getByTestId('noi-dung')).toBeInTheDocument();
  });

  it('không có membership → không có dải (chủ tài khoản bình thường không bị làm phiền)', () => {
    seed({ user: { id: 1, role: 'user', username: 'chu', memberships: [] } });
    renderLayout();

    expect(screen.queryByTestId('workspace-invite-banner')).not.toBeInTheDocument();
  });

  it('đã ở không gian công ty → không có dải', () => {
    seed({
      user: { id: 7, role: 'user', username: 'nv', memberships: [{ ownerId: 10, ownerName: 'Công ty A' }] },
      activeContext: { type: 'employee', ownerId: 10, ownerName: 'Công ty A', permissions: { campaigns_view: true } },
    });
    renderLayout();

    expect(screen.queryByTestId('workspace-invite-banner')).not.toBeInTheDocument();
  });
});

describe('MainLayout — làm mới hồ sơ khi quay lại tab', () => {
  it('người dùng thường đã đăng nhập → hook được bật', () => {
    seed({ user: { id: 7, role: 'user', username: 'nv', memberships: [] } });
    renderLayout();

    expect(mockUseRefreshUserOnFocus).toHaveBeenCalledWith({ enabled: true });
  });

  it('admin → hook tắt (admin không có membership để làm mới)', () => {
    seed({ user: { id: 1, role: 'admin', username: 'root', memberships: [] } });
    renderLayout();

    expect(mockUseRefreshUserOnFocus).toHaveBeenCalledWith({ enabled: false });
  });

  it('chưa đăng nhập → hook tắt', () => {
    seed({ isAuthenticated: false, user: null });
    renderLayout();

    expect(mockUseRefreshUserOnFocus).toHaveBeenCalledWith({ enabled: false });
  });
});

/**
 * PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH PR-3 mục 5.2 — màn "Không có quyền truy cập": chỉ khi route đòi một
 * quyền nhân viên (reason="permission") mới nói "{công ty} chưa cấp quyền này cho bạn" + nút kiểm tra lại.
 * Các lý do khác (chỉ chủ tài khoản, tính năng tắt, chỉ admin) giữ câu chung — nói "chưa cấp quyền" ở đó là sai.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../i18n', async () => (await import('../../test/realI18n.js')).realI18nModule());
vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));
vi.mock('../../components/layout/client/Navbar', () => ({ default: () => null }));
vi.mock('../../components/layout/client/Footer', () => ({ default: () => null }));

const { useAuthStore } = await import('../../stores/authStore');
const { default: UnauthorizedScreen } = await import('./UnauthorizedScreen');

const EMPLOYEE = { type: 'employee', ownerId: 10, ownerName: 'Công ty A', permissions: {} };
const RECHECK = 'Tôi đã được cấp quyền — kiểm tra lại';
const GENERIC = 'Tài khoản hoặc vai trò hiện tại của bạn chưa có quyền mở trang này.';

const renderScreen = (props) => render(<MemoryRouter><UnauthorizedScreen {...props} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: { id: 7, username: 'nv', email: 'nv@example.com', role: 'user', memberships: [] },
    isAuthenticated: true,
    activeContext: EMPLOYEE,
  });
});

describe('UnauthorizedScreen', () => {
  it('nhân viên + reason="permission" → "{công ty} chưa cấp quyền này cho bạn" và nút kiểm tra lại', () => {
    renderScreen({ reason: 'permission' });

    expect(screen.getByText('Công ty A chưa cấp quyền này cho bạn.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: RECHECK })).toBeInTheDocument();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it('nhân viên + route chỉ dành cho chủ (không truyền reason) → câu chung, KHÔNG nói "chưa cấp quyền", không nút kiểm tra lại', () => {
    renderScreen();

    expect(screen.getByText(GENERIC)).toBeInTheDocument();
    expect(screen.queryByText(/chưa cấp quyền này cho bạn/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: RECHECK })).not.toBeInTheDocument();
  });

  it('chủ tài khoản (self) dù reason="permission" → câu chung, không nút kiểm tra lại', () => {
    useAuthStore.setState({ activeContext: { type: 'self' } });
    renderScreen({ reason: 'permission' });

    expect(screen.getByText(GENERIC)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: RECHECK })).not.toBeInTheDocument();
  });

  it('thiếu tên công ty trong ngữ cảnh → dùng chữ dự phòng, không hiện "undefined"', () => {
    useAuthStore.setState({ activeContext: { ...EMPLOYEE, ownerName: undefined } });
    renderScreen({ reason: 'permission' });

    expect(screen.getByText('công ty chưa cấp quyền này cho bạn.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/undefined/);
  });

  it('vẫn giữ hai nút cũ: về trang của tôi và đăng xuất', () => {
    renderScreen({ reason: 'permission' });
    expect(screen.getByRole('button', { name: /Về trang của tôi/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đăng xuất/ })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const logoutMock = vi.fn().mockResolvedValue(undefined);
const switchContextMock = vi.fn();
let authState = {
  user: null,
  logout: logoutMock,
  activeContext: { type: 'self' },
  switchContext: switchContextMock,
};
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => authState,
}));

vi.mock('../../features/auth/components/ChangePasswordModal', () => ({
  default: ({ isOpen }) =>
    isOpen ? <div data-testid="cp-modal">CP</div> : null,
}));

import AdminHeader from '../../components/layout/admin/Header';

function renderAdminHeader(props = {}) {
  return render(
    <MemoryRouter>
      <AdminHeader onToggleSidebar={props.onToggleSidebar || vi.fn()} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState = {
    user: { fullName: 'Admin Boss', username: 'boss', email: 'boss@x.com', memberships: [] },
    logout: logoutMock,
    activeContext: { type: 'self' },
    switchContext: switchContextMock,
  };
});

describe('<AdminHeader />', () => {
  it('render logo + Founder AI + hamburger button + avatar initial', () => {
    renderAdminHeader();
    expect(screen.getByText('Founder AI')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mở menu/i })).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('không hiện suffix ngữ cảnh khi activeContext.type=self', () => {
    renderAdminHeader();
    expect(screen.queryByText(/\/ /)).not.toBeInTheDocument();
  });

  it('activeContext.type=employee → hiển thị " / <ownerName>" sau Founder AI', () => {
    authState.activeContext = { type: 'employee', ownerId: 5, ownerName: 'Công ty ABC' };
    renderAdminHeader();
    expect(screen.getByText(/\/ Công ty ABC/)).toBeInTheDocument();
  });

  it('click hamburger → onToggleSidebar gọi', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderAdminHeader({ onToggleSidebar: onToggle });
    await user.click(screen.getByRole('button', { name: /Mở menu/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('click avatar → mở menu hiển thị tên + email + section "Ngữ cảnh hoạt động"', async () => {
    const user = userEvent.setup();
    renderAdminHeader();
    await user.click(screen.getByText('A').closest('button'));
    expect(screen.getByText('Admin Boss')).toBeInTheDocument();
    expect(screen.getByText('boss@x.com')).toBeInTheDocument();
    expect(screen.getByText('Ngữ cảnh hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Cá nhân')).toBeInTheDocument();
  });

  it('memberships → render từng membership trong menu', async () => {
    authState.user.memberships = [
      { ownerId: 5, ownerName: 'Co ABC', ownerUsername: 'abc' },
      { ownerId: 7, ownerName: 'Co XYZ', ownerUsername: 'xyz' },
    ];
    const user = userEvent.setup();
    renderAdminHeader();
    await user.click(screen.getByText('A').closest('button'));
    expect(screen.getByText('Co ABC')).toBeInTheDocument();
    expect(screen.getByText('Co XYZ')).toBeInTheDocument();
  });

  it('click "Cá nhân" → switchContext(null) + đóng menu', async () => {
    authState.activeContext = { type: 'employee', ownerId: 5, ownerName: 'Co ABC' };
    const user = userEvent.setup();
    renderAdminHeader();
    await user.click(screen.getByText('A').closest('button'));
    await user.click(screen.getByText('Cá nhân'));
    expect(switchContextMock).toHaveBeenCalledWith(null);
    expect(screen.queryByText('Ngữ cảnh hoạt động')).not.toBeInTheDocument();
  });

  it('click membership → switchContext(ownerId) + đóng menu', async () => {
    authState.user.memberships = [{ ownerId: 9, ownerName: 'Co XYZ' }];
    const user = userEvent.setup();
    renderAdminHeader();
    await user.click(screen.getByText('A').closest('button'));
    await user.click(screen.getByText('Co XYZ'));
    expect(switchContextMock).toHaveBeenCalledWith(9);
    expect(screen.queryByText('Ngữ cảnh hoạt động')).not.toBeInTheDocument();
  });

  it('click "Đổi mật khẩu" → đóng menu + mở ChangePasswordModal', async () => {
    const user = userEvent.setup();
    renderAdminHeader();
    await user.click(screen.getByText('A').closest('button'));
    await user.click(screen.getByText('Đổi mật khẩu'));
    expect(screen.queryByText('Ngữ cảnh hoạt động')).not.toBeInTheDocument();
    expect(screen.getByTestId('cp-modal')).toBeInTheDocument();
  });

  it('click "Đăng xuất" → logout + navigate /login', async () => {
    const user = userEvent.setup();
    renderAdminHeader();
    await user.click(screen.getByText('A').closest('button'));
    await user.click(screen.getByText('Đăng xuất'));
    expect(logoutMock).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/login'));
  });

  it('click outside → đóng menu', async () => {
    const user = userEvent.setup();
    renderAdminHeader();
    await user.click(screen.getByText('A').closest('button'));
    expect(screen.getByText('Đăng xuất')).toBeInTheDocument();
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(screen.queryByText('Đăng xuất')).not.toBeInTheDocument();
  });

  it('avatar fallback "U" khi không có user', () => {
    authState.user = null;
    renderAdminHeader();
    expect(screen.getByText('U')).toBeInTheDocument();
  });

  it('checkmark cho "Cá nhân" khi đang ở self context', async () => {
    const user = userEvent.setup();
    renderAdminHeader();
    await user.click(screen.getByText('A').closest('button'));
    const caNhanBtn = screen.getByText('Cá nhân').closest('button');
    expect(caNhanBtn.className).toMatch(/bg-primary-50/);
  });

  it('checkmark cho membership đang active', async () => {
    authState.activeContext = { type: 'employee', ownerId: 5, ownerName: 'Co ABC' };
    authState.user.memberships = [{ ownerId: 5, ownerName: 'Co ABC' }];
    const user = userEvent.setup();
    renderAdminHeader();
    await user.click(screen.getByText('A').closest('button'));
    const membershipButtons = screen.getAllByText('Co ABC');
    const activeBtn = membershipButtons.find((el) => el.closest('button')?.className.includes('bg-primary-50'));
    expect(activeBtn).toBeTruthy();
  });
});

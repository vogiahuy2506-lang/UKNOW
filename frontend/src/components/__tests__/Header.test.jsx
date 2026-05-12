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
let currentUser = null;
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ user: currentUser, logout: logoutMock }),
}));

vi.mock('../../features/auth/components/ChangePasswordModal', () => ({
  default: ({ isOpen }) =>
    isOpen ? <div data-testid="change-password-modal-open">CP Modal</div> : null,
}));

import Header from '../../components/layout/Header';

function renderHeader(props = {}) {
  return render(
    <MemoryRouter>
      <Header onToggleSidebar={props.onToggleSidebar || vi.fn()} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { fullName: 'Nguyễn An', email: 'an@x.com', username: 'an' };
});

describe('<Header /> (mobile)', () => {
  it('render logo + tên app + hamburger button + avatar initial', () => {
    renderHeader();
    expect(screen.getByText('Founder AI')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mở menu/i })).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('avatar fallback "U" khi không có user', () => {
    currentUser = null;
    renderHeader();
    expect(screen.getByText('U')).toBeInTheDocument();
  });

  it('click hamburger → onToggleSidebar được gọi', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderHeader({ onToggleSidebar: onToggle });
    await user.click(screen.getByRole('button', { name: /Mở menu/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('click avatar → mở user menu hiển thị tên + email', async () => {
    const user = userEvent.setup();
    renderHeader();
    expect(screen.queryByText('an@x.com')).not.toBeInTheDocument();
    const avatarButton = screen.getByText('N').closest('button');
    await user.click(avatarButton);
    expect(screen.getByText('Nguyễn An')).toBeInTheDocument();
    expect(screen.getByText('an@x.com')).toBeInTheDocument();
    expect(screen.getByText('Đổi mật khẩu')).toBeInTheDocument();
    expect(screen.getByText('Đăng xuất')).toBeInTheDocument();
  });

  it('click outside → đóng user menu', async () => {
    const user = userEvent.setup();
    renderHeader();
    const avatarButton = screen.getByText('N').closest('button');
    await user.click(avatarButton);
    expect(screen.getByText('Đăng xuất')).toBeInTheDocument();
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(screen.queryByText('Đăng xuất')).not.toBeInTheDocument();
  });

  it('click "Đổi mật khẩu" → đóng menu + mở ChangePasswordModal', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByText('N').closest('button'));
    await user.click(screen.getByText('Đổi mật khẩu'));
    expect(screen.queryByText('Đăng xuất')).not.toBeInTheDocument();
    expect(screen.getByTestId('change-password-modal-open')).toBeInTheDocument();
  });

  it('click "Đăng xuất" → logout() + navigate("/login")', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByText('N').closest('button'));
    await user.click(screen.getByText('Đăng xuất'));
    expect(logoutMock).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/login'));
  });

  it('initial dùng username khi không có fullName (Header không uppercase)', () => {
    currentUser = { username: 'bob', email: 'bob@x' };
    renderHeader();
    expect(screen.getByText('b')).toBeInTheDocument();
  });

  it('hiển thị username trong menu khi fullName trống', async () => {
    const user = userEvent.setup();
    currentUser = { username: 'bob', email: 'bob@x' };
    renderHeader();
    await user.click(screen.getByText('b').closest('button'));
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('bob@x')).toBeInTheDocument();
  });
});

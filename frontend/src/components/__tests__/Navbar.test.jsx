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
let authState = { user: null, isAuthenticated: false, logout: logoutMock };
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => authState,
}));

import Navbar from '../../components/layout/client/Navbar';

function renderNavbar({ pathname = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Navbar />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState = { user: null, isAuthenticated: false, logout: logoutMock };
});

describe('<Navbar /> — chưa đăng nhập', () => {
  it('render logo Founder + AI + 3 link nav (Trang chủ / Bảng giá / Liên hệ)', () => {
    renderNavbar();
    expect(screen.getByText('Founder')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Trang chủ/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Bảng giá/i })).toHaveAttribute('href', '/pricing');
    expect(screen.getByRole('link', { name: /Liên hệ/i })).toHaveAttribute('href', '/contact');
  });

  it('hiện "Đăng nhập" + "Đăng ký" buttons khi isAuthenticated=false', () => {
    renderNavbar();
    expect(screen.getByRole('link', { name: /Đăng nhập/i })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /Đăng ký/i })).toHaveAttribute('href', '/register');
  });

  it('không render UserMenu khi chưa đăng nhập', () => {
    renderNavbar();
    expect(screen.queryByRole('button', { name: /U|Đăng xuất/i })).not.toBeInTheDocument();
  });

  it('active link "/pricing" → text-orange-600', () => {
    renderNavbar({ pathname: '/pricing' });
    const pricingLink = screen.getByRole('link', { name: /Bảng giá/i });
    expect(pricingLink.className).toMatch(/text-orange-600/);
    expect(pricingLink.className).not.toMatch(/text-slate-600/);
  });

  it('active link "/about" cũng match "Trang chủ" (matchPaths)', () => {
    renderNavbar({ pathname: '/about' });
    const trangChuLink = screen.getByRole('link', { name: /Trang chủ/i });
    expect(trangChuLink.className).toMatch(/text-orange-600/);
  });
});

describe('<Navbar /> — đã đăng nhập (UserMenu)', () => {
  it('user.role="user" → avatar gradient orange + initial từ fullName', () => {
    authState = {
      user: { fullName: 'Anh Bee', username: 'bee', email: 'b@x', role: 'user' },
      isAuthenticated: true,
      logout: logoutMock,
    };
    renderNavbar();
    expect(screen.getByText('Anh Bee')).toBeInTheDocument();
    const initial = screen.getByText('A');
    expect(initial).toBeInTheDocument();
    const avatar = initial.parentElement;
    expect(avatar.className).toMatch(/from-orange-500/);
  });

  it('user.role="admin" → avatar gradient purple', () => {
    authState = {
      user: { fullName: 'Boss', email: 'a@x', role: 'admin' },
      isAuthenticated: true,
      logout: logoutMock,
    };
    renderNavbar();
    const initial = screen.getByText('B');
    expect(initial.parentElement.className).toMatch(/from-purple-500/);
  });

  it('mở UserMenu → hiển thị email + link "Trang quản trị" theo role', async () => {
    const user = userEvent.setup();
    authState = {
      user: { fullName: 'Boss', email: 'a@x', role: 'admin' },
      isAuthenticated: true,
      logout: logoutMock,
    };
    renderNavbar();
    await user.click(screen.getByText('Boss'));
    expect(screen.getByText('a@x')).toBeInTheDocument();
    const trangQuanTri = screen.getByRole('link', { name: /Trang quản trị/i });
    expect(trangQuanTri).toHaveAttribute('href', '/admin');
  });

  it('user.role !== "admin" → link dashboard "/app"', async () => {
    const user = userEvent.setup();
    authState = {
      user: { fullName: 'U1', email: 'u@x', role: 'user' },
      isAuthenticated: true,
      logout: logoutMock,
    };
    renderNavbar();
    await user.click(screen.getByText('U1'));
    expect(screen.getByRole('link', { name: /Trang quản trị/i })).toHaveAttribute('href', '/app');
  });

  it('click outside → đóng UserMenu', async () => {
    const user = userEvent.setup();
    authState = {
      user: { fullName: 'U1', email: 'u@x', role: 'user' },
      isAuthenticated: true,
      logout: logoutMock,
    };
    renderNavbar();
    await user.click(screen.getByText('U1'));
    expect(screen.getByText('u@x')).toBeInTheDocument();
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(screen.queryByText('u@x')).not.toBeInTheDocument();
  });

  it('click "Đăng xuất" → logout + navigate /login', async () => {
    const user = userEvent.setup();
    authState = {
      user: { fullName: 'U1', email: 'u@x', role: 'user' },
      isAuthenticated: true,
      logout: logoutMock,
    };
    renderNavbar();
    await user.click(screen.getByText('U1'));
    await user.click(screen.getByText('Đăng xuất'));
    expect(logoutMock).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/login'));
  });

  it('fallback initial "U" + displayName "Tài khoản" khi user thiếu thông tin', () => {
    authState = {
      user: { email: 'x@y' },
      isAuthenticated: true,
      logout: logoutMock,
    };
    renderNavbar();
    expect(screen.getByText('U')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản')).toBeInTheDocument();
  });
});

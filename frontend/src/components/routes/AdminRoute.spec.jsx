/**
 * Cổng /admin/*. Hành vi cũ giữ nguyên (đang tải → màn chờ; chưa đăng nhập → /login; không phải admin → màn
 * không có quyền; admin → vào) và MỘT nhánh mới của PLAN_429_PHIEN_VA_CHUOI_SAN_PHAM_2026-10-11 việc 1: phiên chưa
 * kiểm tra được vì lỗi tạm thời (429/5xx/mất mạng) mà máy còn token → RENDER màn "Thử lại", KHÔNG `Navigate`
 * ra /login.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../i18n', async () => (await import('../../test/realI18n.js')).realI18nModule());
vi.mock('../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: {} } }), post: vi.fn() },
  setAuthStore: vi.fn(),
}));
vi.mock('../../pages/auth/UnauthorizedScreen', () => ({
  default: () => <div data-testid="khong-co-quyen" />,
}));

const { default: AdminRoute } = await import('./AdminRoute');
const { useAuthStore } = await import('../../stores/authStore');

const retrySessionCheckGoc = useAuthStore.getState().retrySessionCheck;

const ViTri = () => <span data-testid="vi-tri">{useLocation().pathname}</span>;

const moTrangAdmin = () => render(
  <MemoryRouter initialEntries={['/admin']}>
    <ViTri />
    <Routes>
      <Route path="/login" element={<div data-testid="trang-dang-nhap" />} />
      <Route path="/admin" element={<AdminRoute><div data-testid="noi-dung-admin" /></AdminRoute>} />
    </Routes>
  </MemoryRouter>
);

const seed = (patch) => useAuthStore.setState({
  isAuthenticated: false,
  isLoading: false,
  user: null,
  sessionCheckFailed: false,
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  useAuthStore.setState({ retrySessionCheck: retrySessionCheckGoc });
});

describe('AdminRoute — hành vi sẵn có', () => {
  it('đang tải → màn chờ, chưa vào nội dung cũng chưa đá đi', () => {
    seed({ isLoading: true });
    moTrangAdmin();

    expect(screen.queryByTestId('noi-dung-admin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trang-dang-nhap')).not.toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('chưa đăng nhập (không token) → /login', () => {
    seed({});
    moTrangAdmin();

    expect(screen.getByTestId('trang-dang-nhap')).toBeInTheDocument();
  });

  it('đã đăng nhập nhưng không phải admin → màn không có quyền', () => {
    seed({ isAuthenticated: true, user: { id: 2, role: 'user' } });
    moTrangAdmin();

    expect(screen.getByTestId('khong-co-quyen')).toBeInTheDocument();
    expect(screen.queryByTestId('noi-dung-admin')).not.toBeInTheDocument();
  });

  it('admin → vào nội dung', () => {
    seed({ isAuthenticated: true, user: { id: 1, role: 'admin' } });
    moTrangAdmin();

    expect(screen.getByTestId('noi-dung-admin')).toBeInTheDocument();
  });
});

describe('AdminRoute — phiên chưa kiểm tra được (429/5xx/mất mạng)', () => {
  it('còn token + sessionCheckFailed → hiện màn Thử lại, KHÔNG điều hướng ra /login', () => {
    localStorage.setItem('accessToken', 'fake-access-token');
    seed({ sessionCheckFailed: true });
    moTrangAdmin();

    expect(screen.getByText('Không kiểm tra được phiên đăng nhập')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByTestId('trang-dang-nhap')).not.toBeInTheDocument();
    expect(screen.getByTestId('vi-tri')).toHaveTextContent('/admin');
  });

  it('KHÔNG còn token → /login như cũ', () => {
    seed({ sessionCheckFailed: true });
    moTrangAdmin();

    expect(screen.getByTestId('trang-dang-nhap')).toBeInTheDocument();
    expect(screen.queryByText('Không kiểm tra được phiên đăng nhập')).not.toBeInTheDocument();
  });

  it('còn token nhưng không có cờ sessionCheckFailed → /login', () => {
    localStorage.setItem('accessToken', 'fake-access-token');
    seed({ sessionCheckFailed: false });
    moTrangAdmin();

    expect(screen.getByTestId('trang-dang-nhap')).toBeInTheDocument();
  });

  it('bấm Thử lại → gọi retrySessionCheck đúng một lần', async () => {
    const retrySessionCheck = vi.fn().mockResolvedValue(undefined);
    localStorage.setItem('accessToken', 'fake-access-token');
    seed({ sessionCheckFailed: true });
    useAuthStore.setState({ retrySessionCheck });
    moTrangAdmin();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Thử lại' })); });

    expect(retrySessionCheck).toHaveBeenCalledTimes(1);
  });
});

/**
 * Màn "Không kiểm tra được phiên đăng nhập" (PLAN_429_PHIEN_VA_CHUOI_SAN_PHAM_2026-10-11 việc 1).
 * Ghim: chữ người dùng thấy, nút Thử lại hiện trạng thái "đang thử" THẬT (màn không bị gỡ khỏi cây trong lúc
 * thử), "Đăng nhập lại" = đăng xuất rồi tới /login, và lớp tối dùng token dk-*.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../i18n', async () => (await import('../../test/realI18n.js')).realI18nModule());
vi.mock('../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: {} } }), post: vi.fn() },
  setAuthStore: vi.fn(),
}));

const { default: SessionCheckFailedScreen } = await import('./SessionCheckFailedScreen');
const { useAuthStore } = await import('../../stores/authStore');

const actionsGoc = {
  retrySessionCheck: useAuthStore.getState().retrySessionCheck,
  logout: useAuthStore.getState().logout,
};

const ViTri = () => <span data-testid="vi-tri">{useLocation().pathname}</span>;

const moManHinh = () => render(
  <MemoryRouter initialEntries={['/app']}>
    <ViTri />
    <Routes>
      <Route path="/app" element={<SessionCheckFailedScreen />} />
      <Route path="/login" element={<div data-testid="trang-dang-nhap" />} />
    </Routes>
  </MemoryRouter>
);

// Promise điều khiển tay: giữ nút ở trạng thái "đang thử" cho tới khi test cho phép.
const treoCho = () => {
  let xong;
  const promise = new Promise((resolve) => { xong = resolve; });
  return { promise, xong };
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ ...actionsGoc });
});

describe('SessionCheckFailedScreen', () => {
  it('hiện đúng chữ: tiêu đề, mô tả "vẫn đang đăng nhập", nút Thử lại, liên kết Đăng nhập lại', () => {
    moManHinh();

    expect(screen.getByRole('heading', { name: 'Không kiểm tra được phiên đăng nhập' })).toBeInTheDocument();
    expect(screen.getByText(
      'Máy chủ đang bận hoặc mạng chập chờn. Bạn vẫn đang đăng nhập — bấm Thử lại sau vài giây.'
    )).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Đăng nhập lại' })).toBeEnabled();
  });

  it('bấm Thử lại → gọi retrySessionCheck; trong lúc thử nút đổi chữ "Đang thử lại..." và khoá cả hai nút', async () => {
    const { promise, xong } = treoCho();
    const retrySessionCheck = vi.fn(() => promise);
    useAuthStore.setState({ retrySessionCheck });
    moManHinh();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(retrySessionCheck).toHaveBeenCalledTimes(1);
    const dangThu = screen.getByRole('button', { name: 'Đang thử lại...' });
    expect(dangThu).toBeDisabled();
    expect(dangThu).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Đăng nhập lại' })).toBeDisabled();

    // Bấm đúp khi đang thử không bắn thêm lượt kiểm tra phiên.
    fireEvent.click(dangThu);
    expect(retrySessionCheck).toHaveBeenCalledTimes(1);

    await act(async () => { xong(); });

    // Vẫn lỗi (store không đổi, màn còn đó) → nút trở lại bình thường để bấm tiếp.
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Đăng nhập lại' })).toBeEnabled();
  });

  it('bấm Đăng nhập lại → đăng xuất (logout) rồi tới /login', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ logout });
    moManHinh();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập lại' })); });

    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('trang-dang-nhap')).toBeInTheDocument();
  });

  it('Đăng nhập lại: chưa tới /login khi logout chưa xong', async () => {
    const { promise, xong } = treoCho();
    const logout = vi.fn(() => promise);
    useAuthStore.setState({ logout });
    moManHinh();

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập lại' }));
    expect(screen.queryByTestId('trang-dang-nhap')).not.toBeInTheDocument();
    expect(screen.getByTestId('vi-tri')).toHaveTextContent('/app');

    await act(async () => { xong(); });
    expect(screen.getByTestId('trang-dang-nhap')).toBeInTheDocument();
  });

  it('có lớp tối bằng token dk-* (màn hiện trong /app và /admin, không phải bề mặt công khai luôn sáng)', () => {
    const { container } = moManHinh();

    expect(container.innerHTML).toContain('dark:bg-dk-bg');
    expect(container.innerHTML).toContain('dark:bg-dk-surface');
    expect(container.innerHTML).toContain('dark:text-dk-text');
  });
});

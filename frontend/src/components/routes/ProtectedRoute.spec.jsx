/**
 * Cổng /app/*. Ca quan trọng nhất ở đây là nhánh "đang ở không gian cá nhân mà chưa có gói".
 *
 * Sự cố production 23/09/2026: nhánh đó trả `<Navigate to="/" />`. Nút "Tài khoản của tôi" gọi
 * `switchContext(null)` rồi `navigate('/app')`; hai cú điều hướng ngược chiều giẫm chân nhau và React
 * dựng ra cây rỗng — TRANG TRẮNG, không một lỗi JS nào, đo trên production thì `#root` chỉ còn thẻ toast.
 *
 * Nên bài này ghim đúng hai điều, chứ không ghim "có chặn hay không":
 *   1. nhánh đó **RENDER** một màn hình — KHÔNG điều hướng đi đâu cả (đổi lại thành Navigate là đỏ);
 *   2. màn hình ấy nói được cho người ta biết chuyện gì đang xảy ra và có lối đi tiếp.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../i18n', async () => (await import('../../test/realI18n.js')).realI18nModule());
vi.mock('../../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: {} } }), post: vi.fn() },
  setAuthStore: vi.fn(),
}));

const { default: ProtectedRoute } = await import('./ProtectedRoute');
const { useAuthStore } = await import('../../stores/authStore');

const membership = { ownerId: 10, ownerName: 'Công ty A', permissions: { campaigns_view: true }, isLocked: false };

const seed = ({ hasPlan, memberships = [], activeContext = { type: 'self' }, isAuthenticated = true }) => {
  useAuthStore.setState({
    isAuthenticated,
    isLoading: false,
    user: isAuthenticated
      ? { id: 7, username: 'nv', fullName: 'Nguyễn Văn Thu', role: 'user', active_plan_id: hasPlan ? 3 : null, memberships }
      : null,
    activeContext,
  });
};

// Đầu dò vị trí: điều hướng lén lút thì chỗ này đổi, khẳng định "không điều hướng" mới có răng.
const ViTri = () => <span data-testid="vi-tri">{useLocation().pathname}</span>;

const moTrangApp = () => render(
  <MemoryRouter initialEntries={['/app']}>
    <ViTri />
    <Routes>
      <Route path="/" element={<div data-testid="trang-ban-hang" />} />
      <Route path="/login" element={<div data-testid="trang-dang-nhap" />} />
      <Route path="/app" element={<ProtectedRoute><div data-testid="noi-dung-app" /></ProtectedRoute>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => { vi.clearAllMocks(); });

describe('ProtectedRoute — không gian cá nhân khi chưa có gói', () => {
  it('KHÔNG đá ra trang bán hàng công khai, và vẫn đứng nguyên ở /app', () => {
    seed({ hasPlan: false, memberships: [membership] });
    moTrangApp();

    expect(screen.queryByTestId('trang-ban-hang')).not.toBeInTheDocument();
    expect(screen.getByTestId('vi-tri')).toHaveTextContent('/app');
  });

  it('hiện màn "chưa có gói" với lối xem bảng giá — không phải màn hình trắng', () => {
    seed({ hasPlan: false, memberships: [membership] });
    moTrangApp();

    expect(screen.queryByTestId('noi-dung-app')).not.toBeInTheDocument();
    expect(screen.getByText('Bạn chưa có gói dịch vụ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xem các gói dịch vụ/i })).toBeInTheDocument();
  });

  it('nhân viên thấy lối quay vào công ty mình đang làm', () => {
    seed({ hasPlan: false, memberships: [membership] });
    moTrangApp();

    expect(screen.getByRole('button', { name: /Công ty A/ })).toBeInTheDocument();
  });

  it('người CÓ gói riêng → vào thẳng nội dung như cũ', () => {
    seed({ hasPlan: true, memberships: [] });
    moTrangApp();

    expect(screen.getByTestId('noi-dung-app')).toBeInTheDocument();
  });

  it('đang ở không gian CÔNG TY thì gói riêng không liên quan — gói của chủ mới quyết, máy chủ đã gác', () => {
    seed({ hasPlan: false, memberships: [membership], activeContext: { type: 'employee', ownerId: 10, permissions: {} } });
    moTrangApp();

    expect(screen.getByTestId('noi-dung-app')).toBeInTheDocument();
  });

  it('chưa đăng nhập → vẫn chuyển sang /login kèm đường quay lại', () => {
    seed({ hasPlan: false, isAuthenticated: false });
    moTrangApp();

    expect(screen.getByTestId('trang-dang-nhap')).toBeInTheDocument();
  });
});

/**
 * Sự cố production 23/09/2026: một nhân viên KHÔNG có gói riêng bấm "Tài khoản của tôi" trong menu
 * ảnh đại diện và mất trắng màn hình.
 *
 * Chuỗi gây lỗi: nút gọi `switchContext(null)` rồi `navigate('/app')`; `ProtectedRoute` thấy ngữ cảnh
 * `self` mà `user.active_plan_id` rỗng nên trả `<Navigate to="/" replace />`, còn `navigate('/app')`
 * chạy sau lại đá ngược về `/app`. Hai bên giẫm chân nhau, React dựng ra cây rỗng — đo trên production:
 * `#root` chỉ còn thẻ toast, 0 ký tự đọc được, KHÔNG có lỗi JS nào.
 *
 * Bản vá ĐẦU TIÊN cùng ngày là giấu dòng menu đi. Bản vá THẬT, ngay sau đó, là chữa ở đích đến:
 * `ProtectedRoute` render thẳng `NoPlanScreen` thay vì điều hướng, nên không còn cuộc đua nào để thua
 * (ca ghim ở `components/routes/ProtectedRoute.spec.jsx`). Đích đến đã tử tế thì không có lý do gì
 * giấu lối vào nữa — trang đó nói rõ "chưa có gói", mời xem bảng giá và liệt kê công ty để quay lại.
 *
 * Nên bài này ghim chiều NGƯỢC với bản vá đầu: dòng menu phải hiện với MỌI người. Ai giấu nó lại thì
 * đỏ, kèm lời nhắc đọc chú thích ở ProtectedRoute.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../../i18n', async () => (await import('../../../../test/realI18n.js')).realI18nModule());
vi.mock('../../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() }, setAuthStore: vi.fn() }));
// Header dùng context Marketplace ở tầng App; bài này chỉ quan tâm menu đổi không gian.
vi.mock('../../../../contexts/useMarketplaceModal', () => ({ useMarketplaceModal: () => ({ showMarketplace: vi.fn() }) }));

const { useAuthStore } = await import('../../../../stores/authStore');
const { default: Header } = await import('../Header');

const membership = { ownerId: 10, ownerName: 'Công ty A', ownerAvatarUrl: null, permissions: { campaigns_view: true }, isLocked: false };

const seed = ({ hasPlan }) => {
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      id: 7, username: 'nv', fullName: 'Nguyễn Văn Thu', email: 'nv@test.local', role: 'user',
      active_plan_id: hasPlan ? 3 : null,
      memberships: [membership],
    },
    activeContext: { type: 'employee', ownerId: 10, ownerName: 'Công ty A', permissions: { campaigns_view: true } },
  });
};

const openMenu = async () => {
  const user = userEvent.setup();
  const avatarButton = screen.getAllByRole('button').find((b) => b.textContent?.includes('Nguyễn Văn Thu'));
  await user.click(avatarButton);
};

beforeEach(() => { vi.clearAllMocks(); });

describe('Header — lối về "Tài khoản của tôi"', () => {
  it('nhân viên KHÔNG có gói riêng → VẪN thấy lối về, vì đích đến giờ là trang "chưa có gói" tử tế', async () => {
    seed({ hasPlan: false });
    render(<MemoryRouter><Header /></MemoryRouter>);
    await openMenu();

    expect(screen.getByRole('button', { name: /Tài khoản của tôi/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Công ty A/ })).toBeInTheDocument();
  });

  it('người CÓ gói riêng → vẫn đổi về không gian cá nhân được như cũ', async () => {
    seed({ hasPlan: true });
    render(<MemoryRouter><Header /></MemoryRouter>);
    await openMenu();

    expect(screen.getByRole('button', { name: /Tài khoản của tôi/ })).toBeInTheDocument();
  });
});

/**
 * PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH PR-3 mục 5.4 — menu avatar: nhãn "Không gian làm việc" / "Tài khoản
 * của tôi" / "Nhân viên của {công ty}", mở menu thì làm mới danh sách, đổi không gian xong thì vào /app
 * (trước đây đứng nguyên trang cũ, dễ rơi vào màn "không có quyền").
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Header from './Header';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}));

const store = {
  user: null,
  activeContext: { type: 'self' },
  logout: vi.fn(),
  switchContext: vi.fn(),
  refreshCurrentUser: vi.fn(),
};
vi.mock('../../../stores/authStore', () => ({ useAuthStore: () => store }));

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());
vi.mock('../../../contexts/useMarketplaceModal', () => ({
  useMarketplaceModal: () => ({ showMarketplace: vi.fn() }),
}));
vi.mock('../../../features/auth/components/AccountProfileModal', () => ({ default: () => null }));
vi.mock('../../../features/auth/components/ChangePasswordModal', () => ({ default: () => null }));

const renderHeader = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header />
    </MemoryRouter>
  );

// Nút avatar đứng trước tiêu đề dropdown trong DOM; khi menu đang mở tên hiện hai lần → lấy phần tử đầu.
const openMenu = () => fireEvent.click(screen.getAllByText('Nhân Viên Một')[0]);

beforeEach(() => {
  vi.clearAllMocks();
  store.user = {
    id: 7,
    role: 'user',
    fullName: 'Nhân Viên Một',
    email: 'nv@example.com',
    memberships: [{ ownerId: 10, ownerName: 'Công ty A' }],
  };
  store.activeContext = { type: 'self' };
  store.switchContext.mockResolvedValue(undefined);
  store.refreshCurrentUser.mockResolvedValue({ success: true });
});

describe('menu avatar — không gian làm việc', () => {
  it('đổi tên nhãn: "Không gian làm việc" / "Tài khoản của tôi" / "Nhân viên của …" — không còn "Ngữ cảnh hoạt động"', () => {
    renderHeader();
    openMenu();

    expect(screen.getByText('Không gian làm việc')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản của tôi')).toBeInTheDocument();
    expect(screen.getByText('Nhân viên của Công ty A')).toBeInTheDocument();
    expect(screen.queryByText('Ngữ cảnh hoạt động')).not.toBeInTheDocument();
    expect(screen.queryByText('Cá nhân')).not.toBeInTheDocument();
  });

  it('mở menu → làm mới hồ sơ đúng một lần; đóng menu không làm mới thêm', () => {
    renderHeader();

    openMenu();
    expect(store.refreshCurrentUser).toHaveBeenCalledTimes(1);

    openMenu(); // bấm lần hai = đóng
    expect(store.refreshCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('chọn công ty → switchContext(ownerId) rồi mới navigate("/app")', async () => {
    let finishSwitch;
    store.switchContext.mockReturnValue(new Promise((resolve) => { finishSwitch = resolve; }));
    renderHeader();
    openMenu();

    fireEvent.click(screen.getByText('Nhân viên của Công ty A'));

    expect(store.switchContext).toHaveBeenCalledWith(10);
    expect(mockNavigate).not.toHaveBeenCalled(); // chưa đổi xong thì chưa đi
    finishSwitch();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/app'));
  });

  it('về "Tài khoản của tôi" → switchContext(null) rồi navigate("/app")', async () => {
    store.activeContext = { type: 'employee', ownerId: 10, ownerName: 'Công ty A', permissions: {} };
    renderHeader();
    openMenu();

    fireEvent.click(screen.getByText('Tài khoản của tôi'));

    expect(store.switchContext).toHaveBeenCalledWith(null);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/app'));
  });
});

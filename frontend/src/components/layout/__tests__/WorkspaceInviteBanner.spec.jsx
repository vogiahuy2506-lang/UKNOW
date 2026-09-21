/**
 * PLAN_NHAN_VIEN_KHONG_THAY_CHIEN_DICH PR-3 mục 5.1 — dải mời chuyển sang không gian công ty.
 * Hiện đúng 3 điều kiện: đang ở `self`, có membership dùng được, chưa đóng. Store thật, chỉ mock API.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());
vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAuthStore: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}));

const { useAuthStore } = await import('../../../stores/authStore');
const { default: WorkspaceInviteBanner } = await import('../WorkspaceInviteBanner');

const switchContext = vi.fn();
const setState = ({ activeContext = { type: 'self' }, memberships }) => {
  useAuthStore.setState({
    user: { id: 7, username: 'nv', role: 'user', memberships },
    isAuthenticated: true,
    activeContext,
    switchContext,
  });
};
const owner = (id, name, extra = {}) => ({ ownerId: id, ownerName: name, permissions: {}, isLocked: false, ...extra });
const renderBanner = () => render(<MemoryRouter><WorkspaceInviteBanner /></MemoryRouter>);
const banner = () => screen.queryByTestId('workspace-invite-banner');

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  switchContext.mockResolvedValue(undefined);
});

describe('điều kiện hiện dải', () => {
  it('đang ở self + có membership → hiện lời mời với tên công ty và nút vào không gian', () => {
    setState({ memberships: [owner(10, 'Công ty A')] });
    renderBanner();

    expect(banner()).toHaveTextContent('Bạn là nhân viên của Công ty A.');
    expect(screen.getByRole('button', { name: 'Vào không gian của Công ty A' })).toBeInTheDocument();
  });

  it('đang ở không gian công ty (employee) → KHÔNG hiện', () => {
    setState({
      activeContext: { type: 'employee', ownerId: 10, ownerName: 'Công ty A', permissions: {} },
      memberships: [owner(10, 'Công ty A')],
    });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('không có membership nào → KHÔNG hiện', () => {
    setState({ memberships: [] });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('membership bị khoá (isLocked) không vào được → không mời', () => {
    setState({ memberships: [owner(10, 'Công ty A', { isLocked: true })] });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('chưa đăng nhập (không có user) → không hiện', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, activeContext: { type: 'self' } });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });
});

describe('vào không gian công ty', () => {
  it('bấm nút → switchContext(ownerId) rồi navigate("/app")', async () => {
    setState({ memberships: [owner(10, 'Công ty A')] });
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Vào không gian của Công ty A' }));

    expect(switchContext).toHaveBeenCalledWith(10);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/app'));
  });

  it('nhiều công ty → liệt kê nút của từng công ty, tối đa 3', () => {
    setState({ memberships: [owner(10, 'A'), owner(11, 'B'), owner(12, 'C'), owner(13, 'D')] });
    renderBanner();

    expect(banner()).toHaveTextContent('nhiều công ty');
    const enterButtons = screen.getAllByRole('button', { name: /^Vào / });
    expect(enterButtons.map((b) => b.textContent)).toEqual(['Vào A', 'Vào B', 'Vào C']);
    expect(screen.queryByRole('button', { name: 'Vào D' })).not.toBeInTheDocument();
  });

  it('bấm vào công ty thứ hai → đúng ownerId của công ty đó', async () => {
    setState({ memberships: [owner(10, 'A'), owner(11, 'B')] });
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Vào B' }));

    expect(switchContext).toHaveBeenCalledWith(11);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/app'));
  });
});

describe('đóng dải', () => {
  it('đóng → ẩn ngay và nhớ theo khoá fa_ws_invite_dismissed_<userId>_<ownerId>', () => {
    setState({ memberships: [owner(10, 'Công ty A')] });
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }));

    expect(banner()).not.toBeInTheDocument();
    expect(window.localStorage.getItem('fa_ws_invite_dismissed_7_10')).toBe('1');
  });

  it('đã đóng từ trước → lần sau vào lại không hiện nữa', () => {
    window.localStorage.setItem('fa_ws_invite_dismissed_7_10', '1');
    setState({ memberships: [owner(10, 'Công ty A')] });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('đóng công ty A không giấu lời mời của công ty B (mới được thêm sau này)', () => {
    window.localStorage.setItem('fa_ws_invite_dismissed_7_10', '1');
    setState({ memberships: [owner(10, 'Công ty A'), owner(11, 'Công ty B')] });
    renderBanner();

    expect(banner()).toHaveTextContent('Công ty B');
    expect(banner()).not.toHaveTextContent('Công ty A');
  });

  it('nhớ theo TỪNG tài khoản: máy dùng chung, người khác đã đóng không giấu lời mời của mình', () => {
    window.localStorage.setItem('fa_ws_invite_dismissed_999_10', '1'); // user khác
    setState({ memberships: [owner(10, 'Công ty A')] });
    renderBanner();
    expect(banner()).toBeInTheDocument();
  });

  it('localStorage bị chặn (ném lỗi) → dải vẫn hiện và đóng không làm sập', () => {
    setState({ memberships: [owner(10, 'Công ty A')] });
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      renderBanner();
      expect(banner()).toBeInTheDocument();
      expect(() => fireEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }))).not.toThrow();
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});

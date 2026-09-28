/**
 * PLAN_VA_NHAN_VIEN_PHAN_QUYEN_2026-09-28 PR-2 — dải mời CHẤP NHẬN vào nhóm. Khác
 * WorkspaceInviteBanner (mời vào không gian ĐÃ chấp nhận từ trước): dải này cho membership
 * `acceptedAt` còn NULL, có nút Chấp nhận/Từ chối gọi API rồi làm mới hồ sơ. Store thật, chỉ mock API.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());

const mockAccept = vi.fn();
const mockDecline = vi.fn();
vi.mock('../../../features/auth/services/authApi.service', () => ({
  acceptWorkspaceInvite: (...args) => mockAccept(...args),
  declineWorkspaceInvite: (...args) => mockDecline(...args),
}));

const { useAuthStore } = await import('../../../stores/authStore');
const { default: WorkspaceInviteAcceptBanner } = await import('../WorkspaceInviteAcceptBanner');

const refreshCurrentUser = vi.fn();
const setState = ({ activeContext = { type: 'self' }, memberships }) => {
  useAuthStore.setState({
    user: { id: 7, username: 'nv', role: 'user', memberships },
    isAuthenticated: true,
    activeContext,
    refreshCurrentUser,
  });
};
const membership = (id, name, extra = {}) => ({ ownerId: id, ownerName: name, acceptedAt: null, ...extra });
const renderBanner = () => render(<WorkspaceInviteAcceptBanner />);
const banner = () => screen.queryByTestId('workspace-invite-accept-banner');

beforeEach(() => {
  vi.clearAllMocks();
  refreshCurrentUser.mockResolvedValue(undefined);
});

describe('điều kiện hiện dải', () => {
  it('có membership acceptedAt null → hiện dải kèm tên chủ + hai nút', () => {
    setState({ memberships: [membership(10, 'Công ty A')] });
    renderBanner();

    expect(banner()).toHaveTextContent('Công ty A');
    expect(screen.getByRole('button', { name: 'Chấp nhận' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument();
  });

  it('membership đã acceptedAt → KHÔNG hiện', () => {
    setState({ memberships: [membership(10, 'Công ty A', { acceptedAt: '2026-01-01T00:00:00Z' })] });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('đang ở không gian công ty (employee context) → KHÔNG hiện', () => {
    setState({
      activeContext: { type: 'employee', ownerId: 10, ownerName: 'Công ty A' },
      memberships: [membership(10, 'Công ty A')],
    });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('không có membership nào → KHÔNG hiện', () => {
    setState({ memberships: [] });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('chưa đăng nhập → không hiện', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, activeContext: { type: 'self' } });
    renderBanner();
    expect(banner()).not.toBeInTheDocument();
  });

  it('nhiều lời mời chưa chấp nhận → mỗi công ty một dòng riêng', () => {
    setState({ memberships: [membership(10, 'Công ty A'), membership(11, 'Công ty B')] });
    renderBanner();

    expect(banner()).toHaveTextContent('Công ty A');
    expect(banner()).toHaveTextContent('Công ty B');
    expect(screen.getAllByRole('button', { name: 'Chấp nhận' })).toHaveLength(2);
  });
});

describe('bấm Chấp nhận', () => {
  it('gọi acceptWorkspaceInvite(ownerId) rồi làm mới hồ sơ', async () => {
    setState({ memberships: [membership(10, 'Công ty A')] });
    mockAccept.mockResolvedValue({ success: true });
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận' }));

    expect(mockAccept).toHaveBeenCalledWith(10);
    await waitFor(() => expect(refreshCurrentUser).toHaveBeenCalledTimes(1));
  });

  it('API lỗi → hiện câu báo lỗi, không làm sập', async () => {
    setState({ memberships: [membership(10, 'Công ty A')] });
    mockAccept.mockRejectedValue(new Error('network'));
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Chấp nhận' }));

    await waitFor(() => expect(screen.getByText('Không thực hiện được, vui lòng thử lại.')).toBeInTheDocument());
    expect(refreshCurrentUser).not.toHaveBeenCalled();
  });
});

describe('bấm Từ chối', () => {
  it('gọi declineWorkspaceInvite(ownerId) rồi làm mới hồ sơ', async () => {
    setState({ memberships: [membership(10, 'Công ty A')] });
    mockDecline.mockResolvedValue({ success: true });
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));

    expect(mockDecline).toHaveBeenCalledWith(10);
    await waitFor(() => expect(refreshCurrentUser).toHaveBeenCalledTimes(1));
  });
});

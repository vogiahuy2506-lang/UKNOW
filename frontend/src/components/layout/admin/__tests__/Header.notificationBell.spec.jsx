/**
 * PR-2 thông báo (10/10/2026): Header dùng chung `/app` và `/admin` phải mang chuông NGAY TRƯỚC khối profile,
 * badge lấy từ API, và menu người dùng có mục "Thông báo". Ba spec Header cũ mock NotificationBell (cần
 * QueryClientProvider) nên bài này là chỗ duy nhất ghim Header + chuông thật chạy chung.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  createQueryClient,
  installFakeServer,
  makeNotification,
  withQueryClient,
} from '../../../../test/notificationTestKit';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}));

vi.mock('../../../../i18n', async () => (await import('../../../../test/realI18n.js')).realI18nModule());
vi.mock('../../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() }, setAuthStore: vi.fn() }));
vi.mock('../../../../contexts/useMarketplaceModal', () => ({ useMarketplaceModal: () => ({ showMarketplace: vi.fn() }) }));
vi.mock('../../../../features/auth/components/AccountProfileModal', () => ({ default: () => null }));
vi.mock('../../../../features/auth/components/ChangePasswordModal', () => ({ default: () => null }));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  getPreferences: vi.fn(),
  updatePreference: vi.fn(),
}));
vi.mock('../../../../features/notifications/services/notificationApi.service', () => ({ default: api }));

const { useAuthStore } = await import('../../../../stores/authStore');
const { default: Header } = await import('../Header');

const seed = (role = 'user') =>
  useAuthStore.setState({
    isAuthenticated: true,
    user: { id: 7, username: 'a', fullName: 'Nguyễn Văn A', email: 'a@test.local', role, active_plan_id: 3, memberships: [] },
    activeContext: { type: 'self' },
    refreshCurrentUser: vi.fn().mockResolvedValue({ success: true }),
  });

const renderHeader = () => {
  const Wrapper = withQueryClient(createQueryClient());
  return render(
    <Wrapper>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </Wrapper>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  seed();
});

describe('Header — chuông thông báo', () => {
  it('render chuông + badge từ API, đứng ngay trước nút profile trong DOM', async () => {
    installFakeServer(api, [makeNotification(1), makeNotification(2), makeNotification(3)]);
    renderHeader();

    const badge = await screen.findByTestId('notification-badge');
    expect(badge).toHaveTextContent('3');

    const bell = screen.getByTestId('notification-bell');
    const profile = screen.getByText('Nguyễn Văn A').closest('button');
    expect(bell.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('super admin cũng thấy chuông (Header dùng chung với /admin)', async () => {
    seed('admin');
    installFakeServer(api, [makeNotification(1)]);
    renderHeader();

    expect(await screen.findByTestId('notification-badge')).toHaveTextContent('1');
  });

  it('menu người dùng có mục "Thông báo" → /app/notifications', async () => {
    installFakeServer(api, []);
    const user = userEvent.setup();
    renderHeader();
    await waitFor(() => expect(api.list).toHaveBeenCalled());

    await user.click(screen.getByText('Nguyễn Văn A'));
    await user.click(screen.getByText('Thông báo'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/app/notifications');
  });

  it('admin: mục "Thông báo" trong menu trỏ /admin/notifications', async () => {
    seed('admin');
    installFakeServer(api, []);
    const user = userEvent.setup();
    renderHeader();
    await waitFor(() => expect(api.list).toHaveBeenCalled());

    await user.click(screen.getByText('Nguyễn Văn A'));
    await user.click(screen.getByText('Thông báo'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/admin/notifications');
  });
});

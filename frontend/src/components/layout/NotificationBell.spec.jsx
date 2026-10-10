/**
 * Chuông thông báo (PR-2 thông báo, 10/10/2026). Máy chủ giả có trạng thái (xem test/notificationTestKit.jsx):
 * markRead / markAllRead đổi dữ liệu thật nên refetch sau khi bấm vẫn khớp với cache đã patch.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  createQueryClient,
  installFakeServer,
  makeNotification,
  withQueryClient,
} from '../../test/notificationTestKit';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}));

const i18nState = vi.hoisted(() => ({ locale: 'vi' }));
vi.mock('../../i18n', async () => {
  const { makeT } = await import('../../test/realI18n.js');
  return { useI18n: () => ({ t: makeT(null, i18nState.locale), locale: i18nState.locale }) };
});

const api = vi.hoisted(() => ({
  list: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  getPreferences: vi.fn(),
  updatePreference: vi.fn(),
}));
vi.mock('../../features/notifications/services/notificationApi.service', () => ({ default: api }));
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() }, setAuthStore: vi.fn() }));

const { useAuthStore } = await import('../../stores/authStore');
const { default: NotificationBell } = await import('./NotificationBell');

const renderBell = (queryClient = createQueryClient()) => {
  const Wrapper = withQueryClient(queryClient);
  const view = render(
    <Wrapper>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </Wrapper>
  );
  return { ...view, queryClient };
};

/** Render rồi chờ truy vấn đầu tiên xong — cập nhật state của react-query nằm trong act, không rò sang bước sau. */
const renderBellReady = async () => {
  const view = renderBell();
  await waitFor(() => {
    expect(api.list).toHaveBeenCalled();
    expect(view.queryClient.isFetching()).toBe(0);
  });
  // react-query báo observer qua setTimeout(0): xả nó TRONG act để lần render lại không rơi ra ngoài.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
};

const unreadItems = (n, startId = 1) =>
  Array.from({ length: n }, (_, index) => makeNotification(startId + index));

const seedUser = (over = {}) =>
  useAuthStore.setState({ isAuthenticated: true, user: { id: 7, role: 'user', ...over } });

beforeEach(() => {
  vi.clearAllMocks();
  i18nState.locale = 'vi';
  seedUser();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationBell — badge', () => {
  it('hiện số chưa đọc từ API trên nút chuông', async () => {
    installFakeServer(api, unreadItems(3));
    renderBell();

    expect(await screen.findByTestId('notification-badge')).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: 'Thông báo (3 chưa đọc)' })).toBeInTheDocument();
  });

  it('unreadCount = 0 → KHÔNG có badge (kể cả khi vẫn có thông báo đã đọc)', async () => {
    installFakeServer(api, [makeNotification(1, { read: true }), makeNotification(2, { read: true })]);
    const user = userEvent.setup();
    await renderBellReady();

    await user.click(screen.getByTestId('notification-bell'));
    expect(await screen.findAllByTestId('notification-item')).toHaveLength(2); // dữ liệu đã về
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });

  it('chưa đọc nhiều hơn 99 → hiện "99+"; đúng 99 thì hiện nguyên số', async () => {
    api.list.mockResolvedValue({ items: [makeNotification(1)], unreadCount: 150, pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } });
    const first = renderBell();
    expect(await screen.findByTestId('notification-badge')).toHaveTextContent('99+');
    first.unmount();

    api.list.mockResolvedValue({ items: [makeNotification(1)], unreadCount: 99, pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } });
    renderBell();
    expect(await screen.findByTestId('notification-badge')).toHaveTextContent(/^99$/);
  });

  it('chưa đăng nhập → không gọi API, không badge', async () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    installFakeServer(api, unreadItems(2));
    renderBell();

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(api.list).not.toHaveBeenCalled();
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });

  it('hỏi đúng 10 dòng mới nhất, cập nhật mỗi 60 giây và khi quay lại tab', async () => {
    installFakeServer(api, unreadItems(2));
    const { queryClient } = renderBell();

    await screen.findByTestId('notification-badge');
    expect(api.list).toHaveBeenCalledWith({ page: 1, limit: 10, unreadOnly: false });
    const options = queryClient.getQueryCache().getAll()[0].options;
    expect(options.refetchInterval).toBe(60_000);
    expect(options.refetchOnWindowFocus).toBe(true);
  });
});

describe('NotificationBell — dropdown', () => {
  it('mở dropdown: hiện tối đa 10 dòng, tiêu đề + nội dung + chấm chưa đọc', async () => {
    installFakeServer(api, unreadItems(12));
    const user = userEvent.setup();
    await renderBellReady();

    await user.click(screen.getByTestId('notification-bell'));
    const dropdown = screen.getByTestId('notification-dropdown');
    const rows = within(dropdown).getAllByTestId('notification-item');
    expect(rows).toHaveLength(10);
    expect(within(rows[0]).getByText('Tiêu đề 1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Nội dung 1')).toBeInTheDocument();
    expect(within(rows[0]).getByTestId('notification-unread-dot')).toBeInTheDocument();
  });

  it('bấm dòng CHƯA ĐỌC → gọi markRead(id) và điều hướng tới link; badge giảm ngay', async () => {
    installFakeServer(api, [
      makeNotification(11, { link: '/app/delivery-monitor' }),
      makeNotification(12, { link: '/app/campaigns' }),
    ]);
    const user = userEvent.setup();
    await renderBellReady();

    await user.click(screen.getByTestId('notification-bell'));
    await user.click(screen.getByText('Tiêu đề 11'));

    expect(api.markRead).toHaveBeenCalledTimes(1);
    expect(api.markRead).toHaveBeenCalledWith(11);
    expect(mockNavigate).toHaveBeenCalledWith('/app/delivery-monitor');
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('notification-badge')).toHaveTextContent('1'));
  });

  it('bấm dòng ĐÃ ĐỌC → chỉ điều hướng, KHÔNG gọi markRead', async () => {
    installFakeServer(api, [makeNotification(21, { read: true, link: '/app/billing' }), makeNotification(22)]);
    const user = userEvent.setup();
    await renderBellReady();

    await user.click(screen.getByTestId('notification-bell'));
    await user.click(screen.getByText('Tiêu đề 21'));

    expect(api.markRead).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/app/billing');
  });

  it('link độc hại / không có link → không điều hướng, không mở tab (vẫn đánh dấu đã đọc)', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    installFakeServer(api, [
      makeNotification(31, { link: 'javascript:alert(1)' }),
      makeNotification(32, { link: '//evil.example/phish' }),
      makeNotification(33, { link: null }),
    ]);
    const user = userEvent.setup();
    await renderBellReady();

    for (const title of ['Tiêu đề 31', 'Tiêu đề 32', 'Tiêu đề 33']) {
      await user.click(screen.getByTestId('notification-bell'));
      await user.click(screen.getByText(title));
    }

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(api.markRead).toHaveBeenCalledTimes(3);
  });

  it('"Đánh dấu đã đọc hết" → gọi read-all, badge biến mất; hết chưa đọc thì nút bị khoá', async () => {
    installFakeServer(api, unreadItems(3));
    const user = userEvent.setup();
    await renderBellReady();

    await user.click(screen.getByTestId('notification-bell'));
    const markAll = screen.getByRole('button', { name: 'Đánh dấu đã đọc hết' });
    expect(markAll).toBeEnabled();
    await user.click(markAll);

    expect(api.markAllRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Đánh dấu đã đọc hết' })).toBeDisabled();
  });

  it('"Xem tất cả" → /app/notifications; bánh răng → /app/settings/notifications', async () => {
    installFakeServer(api, unreadItems(1));
    const user = userEvent.setup();
    await renderBellReady();

    await user.click(screen.getByTestId('notification-bell'));
    await user.click(screen.getByTestId('notification-view-all'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/app/notifications');

    await user.click(screen.getByTestId('notification-bell'));
    await user.click(screen.getByTestId('notification-settings-link'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/app/settings/notifications');
  });

  it('super admin: /app/* bị đá sang /admin nên link trỏ vào cặp trang /admin/*', async () => {
    seedUser({ role: 'admin' });
    installFakeServer(api, unreadItems(1));
    const user = userEvent.setup();
    await renderBellReady();

    await user.click(screen.getByTestId('notification-bell'));
    await user.click(screen.getByTestId('notification-view-all'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/admin/notifications');

    await user.click(screen.getByTestId('notification-bell'));
    await user.click(screen.getByTestId('notification-settings-link'));
    expect(mockNavigate).toHaveBeenLastCalledWith('/admin/settings/notifications');
  });

  it('danh sách rỗng → câu "chưa có thông báo"; bấm ra ngoài hoặc Escape → đóng', async () => {
    installFakeServer(api, []);
    const user = userEvent.setup();
    await renderBellReady();

    await user.click(screen.getByTestId('notification-bell'));
    expect(await screen.findByText('Bạn chưa có thông báo nào')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('notification-bell'));
    expect(screen.getByTestId('notification-dropdown')).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();
  });

  it('locale en: hiện titleEn/messageEn khi có, rơi về bản gốc khi không có', async () => {
    i18nState.locale = 'en';
    installFakeServer(api, [
      makeNotification(41, { title: 'Chiến dịch lỗi', titleEn: 'Campaign failed', message: 'Có lỗi', messageEn: 'Something went wrong' }),
      makeNotification(42, { title: 'Chỉ có tiếng Việt', titleEn: null, message: 'Nội dung gốc', messageEn: null }),
    ]);
    const user = userEvent.setup();
    await renderBellReady();

    await user.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText('Campaign failed')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('Chiến dịch lỗi')).not.toBeInTheDocument();
    expect(screen.getByText('Chỉ có tiếng Việt')).toBeInTheDocument();
    expect(screen.getByText('Nội dung gốc')).toBeInTheDocument();
  });

  it('locale vi: dù có titleEn vẫn hiện tiếng Việt', async () => {
    installFakeServer(api, [makeNotification(51, { title: 'Chiến dịch lỗi', titleEn: 'Campaign failed' })]);
    const user = userEvent.setup();
    await renderBellReady();

    await user.click(screen.getByTestId('notification-bell'));
    expect(screen.getByText('Chiến dịch lỗi')).toBeInTheDocument();
    expect(screen.queryByText('Campaign failed')).not.toBeInTheDocument();
  });
});

/**
 * Trang Thông báo (PR-2 thông báo, 10/10/2026): danh sách phân trang + lọc chưa đọc, bấm dòng → markRead + điều hướng.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../i18n', async () => (await import('../../test/realI18n.js')).realI18nModule());

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
const { default: NotificationsPage } = await import('./NotificationsPage');

const renderPage = () => {
  const Wrapper = withQueryClient(createQueryClient());
  return render(
    <Wrapper>
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    </Wrapper>
  );
};

const many = (n) => Array.from({ length: n }, (_, index) => makeNotification(index + 1));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: true, user: { id: 7, role: 'user' } });
});

describe('NotificationsPage', () => {
  it('hiện danh sách trang 1 (20 dòng/trang) và phân trang khi nhiều hơn 20', async () => {
    installFakeServer(api, many(45));
    renderPage();

    expect(await screen.findAllByTestId('notification-item')).toHaveLength(20);
    expect(api.list).toHaveBeenCalledWith({ page: 1, limit: 20, unreadOnly: false });
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
  });

  it('chuyển trang → hỏi API đúng trang', async () => {
    installFakeServer(api, many(45));
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByTestId('notification-item');

    await user.click(screen.getByRole('button', { name: 'Trang sau' }));

    await waitFor(() => expect(api.list).toHaveBeenCalledWith({ page: 2, limit: 20, unreadOnly: false }));
    expect(await screen.findByText('Trang 2 / 3')).toBeInTheDocument();
  });

  it('lọc "Chưa đọc" → hỏi API unreadOnly=true và về trang 1; chỉ còn dòng chưa đọc', async () => {
    installFakeServer(api, [makeNotification(1, { read: true }), makeNotification(2), makeNotification(3, { read: true })]);
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findAllByTestId('notification-item')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: /^Chưa đọc/ }));

    await waitFor(() => expect(api.list).toHaveBeenCalledWith({ page: 1, limit: 20, unreadOnly: true }));
    await waitFor(() => expect(screen.getAllByTestId('notification-item')).toHaveLength(1));
    expect(screen.getByText('Tiêu đề 2')).toBeInTheDocument();
  });

  it('lọc "Chưa đọc" mà không còn gì → câu "Không còn thông báo chưa đọc"', async () => {
    installFakeServer(api, [makeNotification(1, { read: true })]);
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByTestId('notification-item');

    await user.click(screen.getByRole('button', { name: /^Chưa đọc/ }));

    expect(await screen.findByText('Không còn thông báo chưa đọc')).toBeInTheDocument();
  });

  it('bấm dòng chưa đọc → markRead(id) + điều hướng tới link', async () => {
    installFakeServer(api, [makeNotification(9, { link: '/app/billing' })]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Tiêu đề 9'));

    expect(api.markRead).toHaveBeenCalledWith(9);
    expect(mockNavigate).toHaveBeenCalledWith('/app/billing');
  });

  describe('chuông mang không gian làm việc (PLAN_CHUONG_DOI_KHONG_GIAN)', () => {
    const FORM_LINK = '/app/forms/41/submissions';
    const realSwitchContext = useAuthStore.getState().switchContext;
    const formBell = (id, workspaceOwnerId = '10') =>
      makeNotification(id, { eventType: 'form_submission_received', link: FORM_LINK, metadata: { formId: '41', workspaceOwnerId } });
    const seedWorkspace = (switchContext, memberships = [{ ownerId: 10, ownerName: 'Công ty A', acceptedAt: '2026-01-01T00:00:00Z' }]) =>
      useAuthStore.setState({
        isAuthenticated: true,
        user: { id: 7, role: 'user', memberships },
        activeContext: { type: 'self' },
        switchContext,
      });

    afterEach(() => {
      useAuthStore.setState({ switchContext: realSwitchContext, activeContext: { type: 'self' } });
    });

    it('THỨ TỰ: switchContext(chủ) xong rồi mới navigate tới link', async () => {
      let finishSwitch;
      const switchContext = vi.fn(() => new Promise((resolve) => { finishSwitch = resolve; }));
      seedWorkspace(switchContext);
      installFakeServer(api, [formBell(71)]);
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByText('Tiêu đề 71'));
      await waitFor(() => expect(switchContext).toHaveBeenCalledWith('10'));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(mockNavigate).not.toHaveBeenCalled();

      await act(async () => { finishSwitch(); });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(FORM_LINK));
      expect(switchContext.mock.invocationCallOrder[0]).toBeLessThan(mockNavigate.mock.invocationCallOrder[0]);
      expect(api.markRead).toHaveBeenCalledWith(71);
    });

    it('membership bị khoá → không đổi không gian, vẫn điều hướng; chuông thường không đụng switchContext', async () => {
      const switchContext = vi.fn().mockResolvedValue(undefined);
      seedWorkspace(switchContext, [{ ownerId: 10, isLocked: true, acceptedAt: '2026-01-01T00:00:00Z' }]);
      installFakeServer(api, [formBell(72), makeNotification(73, { link: '/app/billing' })]);
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByText('Tiêu đề 72'));
      await waitFor(() => expect(mockNavigate).toHaveBeenLastCalledWith(FORM_LINK));
      await user.click(screen.getByText('Tiêu đề 73'));
      await waitFor(() => expect(mockNavigate).toHaveBeenLastCalledWith('/app/billing'));
      expect(switchContext).not.toHaveBeenCalled();
    });
  });

  it('"Đánh dấu đã đọc hết" → gọi read-all; nút khoá khi không còn chưa đọc', async () => {
    installFakeServer(api, [makeNotification(1), makeNotification(2)]);
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByTestId('notification-item');

    await user.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc hết' }));

    expect(api.markAllRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đánh dấu đã đọc hết' })).toBeDisabled());
  });

  it('chuyển sang tab "Tuỳ chọn thông báo" → hiển thị bảng cài đặt tuỳ chọn', async () => {
    installFakeServer(api, []);
    api.getPreferences.mockResolvedValue([
      {
        eventType: 'campaign_run_failed',
        label: 'Chiến dịch chạy lỗi',
        labelEn: 'Campaign run failed',
        inAppEnabled: true,
        emailEnabled: true,
        userCanDisableEmail: true,
        systemEmailEnabled: true,
      },
    ]);
    const user = userEvent.setup();
    renderPage();

    const tab = await screen.findByRole('tab', { name: /Tuỳ chọn thông báo/ });
    await user.click(tab);

    expect(await screen.findByTestId('preference-row-campaign_run_failed')).toBeInTheDocument();
    expect(api.getPreferences).toHaveBeenCalledTimes(1);
  });

  it('khi URL có ?tab=preferences → mở sẵn tab tuỳ chọn thông báo', async () => {
    installFakeServer(api, []);
    api.getPreferences.mockResolvedValue([]);
    const Wrapper = withQueryClient(createQueryClient());
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/app/notifications?tab=preferences']}>
          <NotificationsPage />
        </MemoryRouter>
      </Wrapper>
    );

    expect(await screen.findByRole('tab', { name: /Tuỳ chọn thông báo/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

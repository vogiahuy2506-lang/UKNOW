/**
 * Trang Tuỳ chọn thông báo (PR-2 thông báo, 10/10/2026). Hợp đồng API từ backend PR-1:
 * GET /notifications/preferences → [{ eventType, label, labelEn, description, inAppEnabled,
 * emailEnabled (HIỆU LỰC), userCanDisableEmail, systemEmailEnabled }]; PUT { eventType, emailEnabled }.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { createQueryClient, withQueryClient } from '../../test/notificationTestKit';

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

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastMock }));

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
const { default: NotificationPreferencesPage } = await import('./NotificationPreferencesPage');

const row = (over = {}) => ({
  eventType: 'campaign_run_failed',
  label: 'Chiến dịch chạy lỗi',
  labelEn: 'Campaign run failed',
  description: 'Khi một lượt chạy chiến dịch bị lỗi',
  inAppEnabled: true,
  emailEnabled: true,
  userCanDisableEmail: true,
  systemEmailEnabled: true,
  ...over,
});

const PREFS = [
  row(),
  row({
    eventType: 'campaign_approval_required',
    label: 'Chiến dịch chờ duyệt',
    labelEn: 'Campaign awaiting approval',
    userCanDisableEmail: false,
  }),
  row({
    eventType: 'campaign_run_completed',
    label: 'Chiến dịch chạy xong',
    labelEn: 'Campaign run completed',
    emailEnabled: false,
    systemEmailEnabled: false,
  }),
];

const renderPage = async () => {
  const Wrapper = withQueryClient(createQueryClient());
  const view = render(
    <Wrapper>
      <MemoryRouter>
        <NotificationPreferencesPage />
      </MemoryRouter>
    </Wrapper>
  );
  await screen.findByTestId('preference-row-campaign_run_failed');
  return view;
};

const switchOf = (eventType) => within(screen.getByTestId(`preference-row-${eventType}`)).getByRole('switch');

beforeEach(() => {
  vi.clearAllMocks();
  i18nState.locale = 'vi';
  useAuthStore.setState({ isAuthenticated: true, user: { id: 7, role: 'user' } });
  api.getPreferences.mockResolvedValue(PREFS.map((item) => ({ ...item })));
});

describe('NotificationPreferencesPage', () => {
  it('liệt kê sự kiện theo catalog; cột chuông ghi "Luôn bật"', async () => {
    await renderPage();

    expect(screen.getByText('Chiến dịch chạy lỗi')).toBeInTheDocument();
    expect(screen.getByText('Chiến dịch chờ duyệt')).toBeInTheDocument();
    expect(screen.getAllByText('Luôn bật')).toHaveLength(3);
  });

  it('công tắc THƯỜNG: bật, bấm → PUT đúng body { eventType, emailEnabled: false } và công tắc tắt theo', async () => {
    api.updatePreference.mockImplementation(async (eventType, emailEnabled) => row({ eventType, emailEnabled }));
    const user = userEvent.setup();
    await renderPage();

    const toggle = switchOf('campaign_run_failed');
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    expect(api.updatePreference).toHaveBeenCalledTimes(1);
    expect(api.updatePreference).toHaveBeenCalledWith('campaign_run_failed', false);
    await waitFor(() => expect(switchOf('campaign_run_failed')).toHaveAttribute('aria-checked', 'false'));

    await user.click(switchOf('campaign_run_failed'));
    expect(api.updatePreference).toHaveBeenLastCalledWith('campaign_run_failed', true);
  });

  it('loại KHÔNG cho tắt (userCanDisableEmail=false): công tắc disabled + chú thích, bấm không gọi PUT', async () => {
    const user = userEvent.setup();
    await renderPage();

    const toggle = switchOf('campaign_approval_required');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(
      within(screen.getByTestId('preference-row-campaign_approval_required')).getByText(/luôn được gửi qua email/)
    ).toBeInTheDocument();

    await user.click(toggle);
    expect(api.updatePreference).not.toHaveBeenCalled();
  });

  it('hệ thống đã tắt email loại này (systemEmailEnabled=false): công tắc disabled + chú thích quản trị đã tắt', async () => {
    await renderPage();

    const toggle = switchOf('campaign_run_completed');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(
      within(screen.getByTestId('preference-row-campaign_run_completed')).getByText('Quản trị viên đã tắt email cho loại thông báo này.')
    ).toBeInTheDocument();
  });

  it('PUT bị từ chối 400 NOTIFICATION_EMAIL_LOCKED → toast đúng câu, công tắc giữ nguyên, tải lại tuỳ chọn', async () => {
    api.updatePreference.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 400, data: { code: 'NOTIFICATION_EMAIL_LOCKED' } } })
    );
    const user = userEvent.setup();
    await renderPage();

    await user.click(switchOf('campaign_run_failed'));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.error.mock.calls[0][0]).toMatch(/luôn được gửi qua email/);
    expect(switchOf('campaign_run_failed')).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(api.getPreferences.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('mã lỗi lạ / mất mạng → toast câu chung "Không lưu được tuỳ chọn"', async () => {
    api.updatePreference.mockRejectedValue(new Error('Network Error'));
    const user = userEvent.setup();
    await renderPage();

    await user.click(switchOf('campaign_run_failed'));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Không lưu được tuỳ chọn. Vui lòng thử lại.'));
  });

  it('locale en: nhãn sự kiện lấy labelEn', async () => {
    i18nState.locale = 'en';
    await renderPage();

    expect(screen.getByText('Campaign run failed')).toBeInTheDocument();
    expect(screen.queryByText('Chiến dịch chạy lỗi')).not.toBeInTheDocument();
    expect(screen.getAllByText('Always on')).toHaveLength(3);
  });

  it('chuông bị admin tắt (inAppEnabled=false) → KHÔNG ghi "Luôn bật" (không nói dối)', async () => {
    api.getPreferences.mockResolvedValue([row({ inAppEnabled: false })]);
    await renderPage();

    expect(screen.queryByText('Luôn bật')).not.toBeInTheDocument();
    expect(screen.getByText('Đã tắt bởi quản trị')).toBeInTheDocument();
  });
});

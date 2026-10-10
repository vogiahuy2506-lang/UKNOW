import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { I18nProvider } from '../../i18n';
import NotificationCenter from './NotificationCenter';

const {
  mockGetNotifications,
  mockListTemplates,
  mockGetEvents,
  mockSendDirect,
  mockCreate,
  mockSchedule,
} = vi.hoisted(() => ({
  mockGetNotifications: vi.fn(),
  mockListTemplates: vi.fn(),
  mockGetEvents: vi.fn(),
  mockSendDirect: vi.fn(),
  mockCreate: vi.fn(),
  mockSchedule: vi.fn(),
}));

vi.mock('../../features/admin/services/adminNotificationApi.service', () => ({
  default: {
    getNotifications: mockGetNotifications,
    listTemplates: mockListTemplates,
    getNotificationEvents: mockGetEvents,
    sendDirect: mockSendDirect,
    createNotification: mockCreate,
    scheduleNotification: mockSchedule,
    updateNotificationEvent: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

// Ô chọn đối tượng / lịch / modal là phần của thành phần khác: thay bằng bản giả tối thiểu để tập trung vào kênh gửi.
vi.mock('../../features/admin/components', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    TargetingPanel: ({ onChange }) => (
      <button type="button" onClick={() => onChange({ user_ids: [39] })}>stub-chon-nguoi-nhan</button>
    ),
    ScheduleSelector: ({ onChange }) => (
      <button
        type="button"
        onClick={() => onChange({ schedule_type: 'scheduled', scheduled_at: new Date(Date.now() + 3600_000).toISOString() })}
      >
        stub-hen-gio
      </button>
    ),
    EmailPreviewModal: () => null,
    EmailLogsModal: () => null,
    SaveAsTemplateModal: () => null,
  };
});

const eventsResponse = (settings) => ({
  data: { success: true, data: [{ key: 'admin_broadcast', settings: { inAppEnabled: true, emailEnabled: true, userCanDisableEmail: true, ...settings } }] },
});

function renderPage() {
  return render(
    <I18nProvider defaultLocale="vi">
      <NotificationCenter />
    </I18nProvider>,
  );
}

async function openSendTab() {
  renderPage();
  fireEvent.click(await screen.findByRole('tab', { name: /Chiến dịch mới/ }));
  await screen.findByText('stub-chon-nguoi-nhan');
}

const emailBox = () => screen.getByRole('checkbox', { name: /^Email/ });
const bellBox = () => screen.getByRole('checkbox', { name: /Chuông thông báo/ });

describe('NotificationCenter - chọn kênh gửi (PR-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNotifications.mockResolvedValue({ data: { success: true, data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } } });
    mockListTemplates.mockResolvedValue({ data: { success: true, data: [] } });
    mockGetEvents.mockResolvedValue(eventsResponse({}));
    mockSendDirect.mockResolvedValue({ data: { success: true, message: 'ok' } });
    mockCreate.mockResolvedValue({ data: { success: true, data: { id: 5 } } });
    mockSchedule.mockResolvedValue({ data: { success: true } });
  });

  it('mặc định cả Email và Chuông; gửi ngay → payload có channels [email, in_app]', async () => {
    await openSendTab();
    await waitFor(() => expect(mockGetEvents).toHaveBeenCalled());
    expect(emailBox()).toBeChecked();
    expect(bellBox()).toBeChecked();

    fireEvent.click(screen.getByText('stub-chon-nguoi-nhan'));
    fireEvent.click(screen.getByRole('button', { name: /Gửi ngay/ }));

    await waitFor(() => expect(mockSendDirect).toHaveBeenCalledTimes(1));
    expect(mockSendDirect.mock.calls[0][0]).toMatchObject({ channels: ['email', 'in_app'], target_user_ids: [39] });
    expect(mockSendDirect.mock.calls[0][0].metadata).toBeUndefined();
  });

  it('bỏ Email, chỉ Chuông + liên kết → channels [in_app] và metadata.link', async () => {
    await openSendTab();
    fireEvent.click(emailBox());
    fireEvent.change(screen.getByLabelText(/Liên kết khi bấm/), { target: { value: ' /app/plans ' } });
    fireEvent.click(screen.getByText('stub-chon-nguoi-nhan'));
    fireEvent.click(screen.getByRole('button', { name: /Gửi ngay/ }));

    await waitFor(() => expect(mockSendDirect).toHaveBeenCalledTimes(1));
    expect(mockSendDirect.mock.calls[0][0]).toMatchObject({ channels: ['in_app'], metadata: { link: '/app/plans' } });
  });

  it('chỉ Email → không có metadata dù đã gõ liên kết trước đó', async () => {
    await openSendTab();
    fireEvent.change(screen.getByLabelText(/Liên kết khi bấm/), { target: { value: '/app/plans' } });
    fireEvent.click(bellBox());
    fireEvent.click(screen.getByText('stub-chon-nguoi-nhan'));
    fireEvent.click(screen.getByRole('button', { name: /Gửi ngay/ }));

    await waitFor(() => expect(mockSendDirect).toHaveBeenCalledTimes(1));
    const payload = mockSendDirect.mock.calls[0][0];
    expect(payload.channels).toEqual(['email']);
    expect(payload.metadata).toBeUndefined();
  });

  it('bỏ cả hai kênh → báo lỗi, không gọi API', async () => {
    await openSendTab();
    fireEvent.click(emailBox());
    fireEvent.click(bellBox());
    fireEvent.click(screen.getByText('stub-chon-nguoi-nhan'));
    fireEvent.click(screen.getByRole('button', { name: /Gửi ngay/ }));

    expect(toast.error).toHaveBeenCalledWith('Vui lòng chọn ít nhất một kênh gửi (email hoặc chuông).');
    expect(mockSendDirect).not.toHaveBeenCalled();
  });

  it('liên kết kiểu javascript: bị chặn ở giao diện, không gọi API', async () => {
    await openSendTab();
    fireEvent.change(screen.getByLabelText(/Liên kết khi bấm/), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByText('stub-chon-nguoi-nhan'));
    fireEvent.click(screen.getByRole('button', { name: /Gửi ngay/ }));

    expect(toast.error).toHaveBeenCalledWith('Liên kết phải bắt đầu bằng / hoặc http(s)://');
    expect(mockSendDirect).not.toHaveBeenCalled();
  });

  it('Chuông đang tắt trong Cấu hình kênh → checkbox disabled, bỏ tick mặc định, payload chỉ email', async () => {
    mockGetEvents.mockResolvedValue(eventsResponse({ inAppEnabled: false }));
    await openSendTab();

    await waitFor(() => expect(bellBox()).toBeDisabled());
    expect(bellBox()).not.toBeChecked();
    expect(emailBox()).toBeChecked();
    expect(screen.getByText(/Đang tắt trong tab "Cấu hình kênh"/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('stub-chon-nguoi-nhan'));
    fireEvent.click(screen.getByRole('button', { name: /Gửi ngay/ }));
    await waitFor(() => expect(mockSendDirect).toHaveBeenCalledTimes(1));
    expect(mockSendDirect.mock.calls[0][0].channels).toEqual(['email']);
  });

  it('Email đang tắt → checkbox Email disabled và không được chọn mặc định', async () => {
    mockGetEvents.mockResolvedValue(eventsResponse({ emailEnabled: false }));
    await openSendTab();

    await waitFor(() => expect(emailBox()).toBeDisabled());
    expect(emailBox()).not.toBeChecked();
    expect(bellBox()).toBeChecked();
  });

  it('hẹn giờ: createNotification nhận channels trước khi hẹn', async () => {
    await openSendTab();
    fireEvent.click(emailBox());
    fireEvent.click(screen.getByText('stub-chon-nguoi-nhan'));
    fireEvent.click(screen.getByText('stub-hen-gio'));
    fireEvent.click(screen.getByRole('button', { name: /Hẹn giờ/ }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ channels: ['in_app'], schedule_type: 'scheduled' });
    await waitFor(() => expect(mockSchedule).toHaveBeenCalled());
  });
});

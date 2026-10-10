import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import { I18nProvider } from '../../../../i18n';
import NotificationEventSettingsPanel from '../NotificationEventSettingsPanel';

const { mockGet, mockPut } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPut: vi.fn() }));

vi.mock('../../services/adminNotificationApi.service', () => ({
  default: { getNotificationEvents: mockGet, updateNotificationEvent: mockPut },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const entry = (key, over = {}) => ({
  key,
  label: `Nhãn ${key}`,
  labelEn: `Label ${key}`,
  description: `Mô tả ${key}`,
  audience: 'user',
  defaults: { inApp: true, email: true },
  catalogUserCanDisableEmail: true,
  settings: { inAppEnabled: true, emailEnabled: true, userCanDisableEmail: true, isDefault: true },
  ...over,
});

const ENTRIES = [
  entry('admin_broadcast'),
  entry('campaign_approval_required', { catalogUserCanDisableEmail: false, settings: { inAppEnabled: true, emailEnabled: true, userCanDisableEmail: false, isDefault: true } }),
  entry('support_ticket_created', { audience: 'admin', catalogUserCanDisableEmail: false, settings: { inAppEnabled: true, emailEnabled: true, userCanDisableEmail: false, isDefault: true } }),
];

function renderPanel(props = {}) {
  return render(
    <I18nProvider defaultLocale="vi">
      <NotificationEventSettingsPanel {...props} />
    </I18nProvider>,
  );
}

describe('NotificationEventSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { success: true, data: ENTRIES } });
  });

  it('hiện mỗi sự kiện một dòng với 3 công tắc; nút Lưu tắt khi chưa đổi gì', async () => {
    renderPanel();
    const row = await screen.findByTestId('event-row-admin_broadcast');
    expect(within(row).getAllByRole('switch')).toHaveLength(3);
    expect(within(row).getByRole('button', { name: /Lưu/ })).toBeDisabled();
  });

  it('đổi công tắc rồi Lưu → PUT đúng sự kiện với đủ 3 trường boolean; gọi onEntrySaved với mục trả về', async () => {
    const updated = entry('admin_broadcast', { settings: { inAppEnabled: false, emailEnabled: true, userCanDisableEmail: true, isDefault: false } });
    mockPut.mockResolvedValue({ data: { success: true, data: updated } });
    const onEntrySaved = vi.fn();
    renderPanel({ onEntrySaved });

    const row = await screen.findByTestId('event-row-admin_broadcast');
    fireEvent.click(within(row).getByRole('switch', { name: /Chuông/ }));
    const save = within(row).getByRole('button', { name: /Lưu/ });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut).toHaveBeenCalledWith('admin_broadcast', { inAppEnabled: false, emailEnabled: true, userCanDisableEmail: true });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(onEntrySaved).toHaveBeenCalledWith(updated);
    expect(within(row).getByRole('button', { name: /Lưu/ })).toBeDisabled();
  });

  it('công tắc "người dùng được tắt email" bị khoá với loại cố định và với sự kiện của admin', async () => {
    renderPanel();
    const locked = await screen.findByTestId('event-row-campaign_approval_required');
    expect(within(locked).getByRole('switch', { name: /Người dùng được tắt email/ })).toBeDisabled();
    const adminRow = screen.getByTestId('event-row-support_ticket_created');
    expect(within(adminRow).getByRole('switch', { name: /Người dùng được tắt email/ })).toBeDisabled();
    const free = screen.getByTestId('event-row-admin_broadcast');
    expect(within(free).getByRole('switch', { name: /Người dùng được tắt email/ })).toBeEnabled();
  });

  it('lưu lỗi → toast lỗi, dòng vẫn còn thay đổi chưa lưu', async () => {
    mockPut.mockRejectedValue({ response: { data: { message: 'Lỗi từ máy chủ' } } });
    renderPanel();
    const row = await screen.findByTestId('event-row-admin_broadcast');
    fireEvent.click(within(row).getByRole('switch', { name: /Email$/ }));
    fireEvent.click(within(row).getByRole('button', { name: /Lưu/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Lỗi từ máy chủ'));
    expect(within(row).getByRole('button', { name: /Lưu/ })).toBeEnabled();
  });

  it('tải lỗi → báo lỗi và có nút Thử lại', async () => {
    mockGet.mockRejectedValueOnce(new Error('x'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được cấu hình sự kiện');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByTestId('event-row-admin_broadcast')).toBeInTheDocument();
  });
});

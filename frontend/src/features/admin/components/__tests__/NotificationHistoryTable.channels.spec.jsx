import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import NotificationHistoryTable from '../NotificationHistoryTable';
import {
  channelsOfNotification,
  defaultChannelsFromSettings,
  disabledChannelsFromSettings,
} from '../../utils/notificationChannels.util';

const row = (id, over = {}) => ({
  id,
  type: 'announcement',
  title: `Bản tin ${id}`,
  status: 'sent',
  recipient_count: 4,
  sent_count: 3,
  in_app_count: 0,
  created_at: '2026-10-10T03:00:00.000Z',
  ...over,
});

function renderTable(notifications) {
  return render(
    <I18nProvider defaultLocale="vi">
      <NotificationHistoryTable notifications={notifications} loading={false} pagination={{ page: 1, totalPages: 1, total: notifications.length }} />
    </I18nProvider>,
  );
}

describe('NotificationHistoryTable - chip kênh và thống kê chuông', () => {
  it('email-only: chip Email, KHÔNG có chip Chuông và không có dòng "Chuông: N"', () => {
    renderTable([row(1, { channels: ['email'] })]);
    const chips = screen.getByTestId('channel-chips-1');
    expect(within(chips).getByText('Email')).toBeInTheDocument();
    expect(within(chips).queryByText('Chuông')).not.toBeInTheDocument();
    expect(screen.queryByText(/Chuông: /)).not.toBeInTheDocument();
  });

  it('cả hai kênh: hai chip và "Chuông: 4"', () => {
    renderTable([row(2, { channels: ['email', 'in_app'], in_app_count: 4 })]);
    const chips = screen.getByTestId('channel-chips-2');
    expect(within(chips).getByText('Email')).toBeInTheDocument();
    expect(within(chips).getByText('Chuông')).toBeInTheDocument();
    expect(screen.getByText('Chuông: 4')).toBeInTheDocument();
  });

  it('chỉ chuông: chỉ chip Chuông; bản tin cũ thiếu cột channels → coi như Email', () => {
    renderTable([row(3, { channels: ['in_app'], in_app_count: 2 }), row(4, { channels: undefined })]);
    const only = screen.getByTestId('channel-chips-3');
    expect(within(only).queryByText('Email')).not.toBeInTheDocument();
    expect(within(only).getByText('Chuông')).toBeInTheDocument();
    expect(within(screen.getByTestId('channel-chips-4')).getByText('Email')).toBeInTheDocument();
  });
});

describe('notificationChannels.util (FE)', () => {
  it('channelsOfNotification giữ thứ tự chuẩn và rơi về [email]', () => {
    expect(channelsOfNotification({ channels: ['in_app', 'email'] })).toEqual(['email', 'in_app']);
    expect(channelsOfNotification({ channels: [] })).toEqual(['email']);
    expect(channelsOfNotification(null)).toEqual(['email']);
  });

  it('kênh mặc định và kênh bị khoá theo cấu hình admin_broadcast', () => {
    expect(defaultChannelsFromSettings(null)).toEqual(['email', 'in_app']);
    expect(defaultChannelsFromSettings({ inAppEnabled: false, emailEnabled: true })).toEqual(['email']);
    expect(disabledChannelsFromSettings({ inAppEnabled: false, emailEnabled: true })).toEqual(['in_app']);
    expect(defaultChannelsFromSettings({ inAppEnabled: false, emailEnabled: false })).toEqual([]);
  });
});

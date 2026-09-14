import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContactAlertsPanel from '../ContactAlertsPanel';
import chatbotApi from '../../chatbot/services/chatbotApi.service';

vi.mock('../../../i18n', () => ({
  useI18n: () => ({
    t: (key, params) => {
      if (params && params.value) return `${key}: ${params.value}`;
      return key;
    },
  }),
}));

vi.mock('../../chatbot/services/chatbotApi.service', () => ({
  default: {
    getContactAlerts: vi.fn(),
    getContactAlertSettings: vi.fn(),
    markContactAlertHandled: vi.fn(),
    unmarkContactAlertHandled: vi.fn(),
    updateContactAlertSettings: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ContactAlertsPanel Component', () => {
  const mockAlerts = [
    {
      id: '1',
      last_conversation_id: 41,
      last_source: 'web',
      visitor_name: 'Nguyễn Văn A',
      contact_value: '0844790999',
      last_seen_at: '2026-09-14T10:00:00.000Z',
      seen_count: 2,
      pending_notify: false,
      suppressed_reason: null,
      last_notified_at: '2026-09-14T10:05:00.000Z',
      handled_at: null,
      handled_by: null,
    },
    {
      id: '2',
      last_conversation_id: 42,
      last_source: 'zalo_personal',
      display_name: 'Zalo Sale 1',
      visitor_name: 'Trần Thị B',
      contact_value: 'khach@gmail.com',
      last_seen_at: '2026-09-14T11:00:00.000Z',
      seen_count: 1,
      pending_notify: false,
      suppressed_reason: 'owner_opted_out',
      last_notified_at: null,
      handled_at: '2026-09-14T12:00:00.000Z',
      handled_by: '1',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    chatbotApi.getContactAlerts.mockResolvedValue({
      data: {
        success: true,
        data: {
          items: mockAlerts,
          total: 2,
          openCount: 1,
        },
      },
    });
    chatbotApi.getContactAlertSettings.mockResolvedValue({
      data: {
        success: true,
        data: {
          emailEnabled: true,
        },
      },
    });
    chatbotApi.markContactAlertHandled.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: '1',
          handled_at: '2026-09-14T12:30:00.000Z',
        },
      },
    });
    chatbotApi.unmarkContactAlertHandled.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: '2',
          handled_at: null,
        },
      },
    });
    chatbotApi.updateContactAlertSettings.mockResolvedValue({
      data: {
        success: true,
        data: {
          emailEnabled: false,
        },
      },
    });
  });

  it('renders list of contact alerts and notifies openCount', async () => {
    const onOpenCountChange = vi.fn();
    render(
      <ContactAlertsPanel
        onOpenCountChange={onOpenCountChange}
        isEmployeeContext={false}
      />
    );

    await waitFor(() => {
      expect(chatbotApi.getContactAlerts).toHaveBeenCalledWith({
        status: 'open',
        limit: 100,
        offset: 0,
      });
    });

    expect(await screen.findByText('0844790999')).toBeInTheDocument();
    expect(screen.getByText('khach@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.getByText('Trần Thị B')).toBeInTheDocument();
    expect(onOpenCountChange).toHaveBeenCalledWith(1);
  });

  it('calls markHandled API when clicking "Đã liên hệ" on open alert', async () => {
    render(<ContactAlertsPanel isEmployeeContext={false} />);

    await waitFor(() => {
      expect(screen.getByText('0844790999')).toBeInTheDocument();
    });

    const markBtn = screen.getByText('inbox.contactAlerts.markHandled');
    fireEvent.click(markBtn);

    await waitFor(() => {
      expect(chatbotApi.markContactAlertHandled).toHaveBeenCalledWith('1');
    });
  });

  it('calls unmarkHandled API when clicking "Bỏ đánh dấu" on handled alert', async () => {
    render(<ContactAlertsPanel isEmployeeContext={false} />);

    await waitFor(() => {
      expect(screen.getByText('khach@gmail.com')).toBeInTheDocument();
    });

    const unmarkBtn = screen.getByText('inbox.contactAlerts.unmarkHandled');
    fireEvent.click(unmarkBtn);

    await waitFor(() => {
      expect(chatbotApi.unmarkContactAlertHandled).toHaveBeenCalledWith('2');
    });
  });

  it('hides email notification toggle when in employee context', async () => {
    render(<ContactAlertsPanel isEmployeeContext={true} />);

    await waitFor(() => {
      expect(chatbotApi.getContactAlerts).toHaveBeenCalled();
    });

    // Should NOT fetch settings
    expect(chatbotApi.getContactAlertSettings).not.toHaveBeenCalled();

    // Toggle button should not exist
    expect(
      screen.queryByText('inbox.contactAlerts.emailNotification')
    ).not.toBeInTheDocument();
  });

  it('shows email notification toggle for owner and calls updateContactAlertSettings', async () => {
    render(<ContactAlertsPanel isEmployeeContext={false} />);

    await waitFor(() => {
      expect(chatbotApi.getContactAlertSettings).toHaveBeenCalled();
    });

    const toggleLabel = screen.getByText('inbox.contactAlerts.emailNotification');
    expect(toggleLabel).toBeInTheDocument();

    const toggleBtn = screen.getByRole('switch');
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(chatbotApi.updateContactAlertSettings).toHaveBeenCalledWith({
        emailEnabled: false,
      });
    });
  });

  it('calls onSelectConversation with mapped type and id when clicking "Mở hội thoại"', async () => {
    const onSelectConversation = vi.fn();
    render(
      <ContactAlertsPanel
        onSelectConversation={onSelectConversation}
        isEmployeeContext={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('0844790999')).toBeInTheDocument();
    });

    const openBtns = screen.getAllByText('inbox.contactAlerts.openConversation');
    // First alert is web -> mapped to webchat
    fireEvent.click(openBtns[0]);

    expect(onSelectConversation).toHaveBeenCalledWith({
      id: 41,
      type: 'webchat',
      visitorName: 'Nguyễn Văn A',
    });

    // Second alert is zalo_personal -> mapped to zalo_personal
    fireEvent.click(openBtns[1]);

    expect(onSelectConversation).toHaveBeenCalledWith({
      id: 42,
      type: 'zalo_personal',
      visitorName: 'Trần Thị B',
    });
  });
});

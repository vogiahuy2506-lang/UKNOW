import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuickSend from '../QuickSend';
import emailTemplateApiService from '../../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../features/templates/services/zaloTemplateApi.service';
import emailSettingsApiService from '../../../features/settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';

const mockNavigate = vi.fn();
let mockLocationState = null;

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/app/quick-send', state: mockLocationState }),
  useNavigate: () => mockNavigate,
}));

const mockT = (key) => key;
vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: mockT, locale: 'vi' }),
}));

vi.mock('../../../features/templates/services/emailTemplateApi.service', () => ({
  default: {
    getTemplates: vi.fn(),
    getTemplateById: vi.fn(),
  },
}));

vi.mock('../../../features/templates/services/zaloTemplateApi.service', () => ({
  default: {
    getTemplates: vi.fn(),
    getTemplateById: vi.fn(),
  },
}));

vi.mock('../../../features/settings/services/emailSettingsApi.service', () => ({
  default: {
    listEmailSettings: vi.fn(),
    sendEmail: vi.fn(),
  },
}));

vi.mock('../../../features/settings/services/zaloSettingsApi.service', () => ({
  default: {
    listAccounts: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

vi.mock('../../../features/campaigns/services/campaignApi.service', () => ({
  default: {
    getQuickSendEstimate: vi.fn(),
    testSendQuickCampaign: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('QuickSend Component Boundary (Idempotency Key Retention & Rotation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationState = {
      quickSendDraft: {
        channel: 'email',
        recipients: ['client@example.com'],
        subject: 'Tiêu đề kiểm thử',
        body: 'Nội dung kiểm thử',
        accountId: 1,
        attachments: [],
        startStep: 'preview',
      },
    };

    emailTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
    emailTemplateApiService.getTemplateById.mockResolvedValue({ data: { data: null } });
    zaloTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
    zaloTemplateApiService.getTemplateById.mockResolvedValue({ data: { data: null } });

    emailSettingsApiService.listEmailSettings.mockResolvedValue({
      data: {
        data: {
          items: [{ id: 1, name: 'Sender Email', email: 'sender@uknow.vn', isDefault: true }],
        },
      },
    });

    zaloSettingsApiService.listAccounts.mockResolvedValue({
      data: { data: { items: [] } },
    });

    campaignApiService.getQuickSendEstimate.mockResolvedValue({
      data: { data: { unit: 'immediate', value: 0 } },
    });
  });

  it('retains the same idempotency key when retrying after a failed test send without modifying payload', async () => {
    campaignApiService.testSendQuickCampaign.mockRejectedValue(new Error('Network failure'));

    render(<QuickSend />);

    const recipientInput = await screen.findByPlaceholderText('quickSend.testRecipientEmailPlaceholder');
    fireEvent.change(recipientInput, { target: { value: 'test_recipient@example.com' } });

    const testSendBtn = screen.getByRole('button', { name: /quickSend\.testSendButton/i });

    // Attempt 1: fails
    fireEvent.click(testSendBtn);

    await waitFor(() => {
      expect(campaignApiService.testSendQuickCampaign).toHaveBeenCalledTimes(1);
    });

    const [payload1, options1] = campaignApiService.testSendQuickCampaign.mock.calls[0];
    expect(payload1.recipient).toBe('test_recipient@example.com');
    const key1 = options1.idempotencyKey;
    expect(key1).toBeTruthy();

    // Attempt 2 (Retry): same payload, clicks test send again
    fireEvent.click(testSendBtn);

    await waitFor(() => {
      expect(campaignApiService.testSendQuickCampaign).toHaveBeenCalledTimes(2);
    });

    const [payload2, options2] = campaignApiService.testSendQuickCampaign.mock.calls[1];
    expect(payload2.recipient).toBe('test_recipient@example.com');
    // Must RETAIN the identical idempotency key on retry
    expect(options2.idempotencyKey).toBe(key1);
  });

  it('does not start a second test send on a rapid duplicate click during async key preparation', async () => {
    campaignApiService.testSendQuickCampaign.mockResolvedValue({
      data: { success: true, message: 'Sent' },
    });

    render(<QuickSend />);

    const recipientInput = await screen.findByPlaceholderText('quickSend.testRecipientEmailPlaceholder');
    fireEvent.change(recipientInput, { target: { value: 'double_click@example.com' } });
    const testSendBtn = screen.getByRole('button', { name: /quickSend\.testSendButton/i });

    fireEvent.click(testSendBtn);
    fireEvent.click(testSendBtn);

    await waitFor(() => {
      expect(campaignApiService.testSendQuickCampaign).toHaveBeenCalledTimes(1);
    });
  });

  it('rotates to a new idempotency key when user edits test recipient after failure', async () => {
    campaignApiService.testSendQuickCampaign.mockRejectedValue(new Error('Address error'));

    render(<QuickSend />);

    const recipientInput = await screen.findByPlaceholderText('quickSend.testRecipientEmailPlaceholder');
    fireEvent.change(recipientInput, { target: { value: 'initial@example.com' } });

    const testSendBtn = screen.getByRole('button', { name: /quickSend\.testSendButton/i });

    // Attempt 1
    fireEvent.click(testSendBtn);

    await waitFor(() => {
      expect(campaignApiService.testSendQuickCampaign).toHaveBeenCalledTimes(1);
    });
    const key1 = campaignApiService.testSendQuickCampaign.mock.calls[0][1].idempotencyKey;

    // User corrects recipient
    fireEvent.change(recipientInput, { target: { value: 'corrected@example.com' } });
    fireEvent.click(testSendBtn);

    await waitFor(() => {
      expect(campaignApiService.testSendQuickCampaign).toHaveBeenCalledTimes(2);
    });

    const [payload2, options2] = campaignApiService.testSendQuickCampaign.mock.calls[1];
    expect(payload2.recipient).toBe('corrected@example.com');
    // Must ROTATE to a fresh key
    expect(options2.idempotencyKey).not.toBe(key1);
  });

  it('resets idempotency state upon successful test send', async () => {
    campaignApiService.testSendQuickCampaign.mockResolvedValue({
      data: { success: true, message: 'Sent' },
    });

    render(<QuickSend />);

    const recipientInput = await screen.findByPlaceholderText('quickSend.testRecipientEmailPlaceholder');
    fireEvent.change(recipientInput, { target: { value: 'success@example.com' } });

    const testSendBtn = screen.getByRole('button', { name: /quickSend\.testSendButton/i });

    // First successful send
    fireEvent.click(testSendBtn);

    await waitFor(() => {
      expect(campaignApiService.testSendQuickCampaign).toHaveBeenCalledTimes(1);
    });
    const key1 = campaignApiService.testSendQuickCampaign.mock.calls[0][1].idempotencyKey;

    // Subsequent send should produce a fresh key because previous action succeeded and reset
    fireEvent.click(testSendBtn);

    await waitFor(() => {
      expect(campaignApiService.testSendQuickCampaign).toHaveBeenCalledTimes(2);
    });
    const key2 = campaignApiService.testSendQuickCampaign.mock.calls[1][1].idempotencyKey;

    expect(key2).not.toBe(key1);
  });
});

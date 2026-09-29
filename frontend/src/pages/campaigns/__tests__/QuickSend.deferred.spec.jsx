import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import QuickSend from '../QuickSend';
import emailTemplateApiService from '../../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../features/templates/services/zaloTemplateApi.service';
import emailSettingsApiService from '../../../features/settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignBuilderApiService from '../../../features/campaigns/services/campaignBuilderApi.service';

/**
 * PLAN_GUI_NHANH_ZALO_GIAN_CACH_2026-09-28 PR-2 Việc 6 — QuickSend.jsx xử lý item
 * `status:'deferred'` từ backend (cổng tryAcquireOutboundSlot dùng chung nhịp với chiến dịch).
 *
 * - reason='inter_message_delay' + retryAfterMs ngắn (≤5 phút) -> tự chờ rồi gửi lại ĐÚNG người
 *   đó với ĐÚNG khoá idempotency cũ (không sinh khoá mới — mutation "FE gửi lại với khoá mới").
 * - Lý do khác (quiet_hours/rate_limited/phone_lookup_cooldown) -> dừng cả đợt ngay, người đó +
 *   người còn lại vào "chưa gửi", không thử thêm request nào.
 */
const mockNavigate = vi.fn();
let mockLocationState = null;

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/app/quick-send', state: mockLocationState }),
  useNavigate: () => mockNavigate,
}));

const mockT = (key, params = {}) => {
  if (params && Object.keys(params).length > 0) return `${key}:${JSON.stringify(params)}`;
  return key;
};
vi.mock('../../../i18n', () => ({
  useI18n: () => ({ t: mockT, locale: 'vi' }),
}));

vi.mock('../../../features/templates/services/emailTemplateApi.service', () => ({
  default: { getTemplates: vi.fn(), getTemplateById: vi.fn() },
}));
vi.mock('../../../features/templates/services/zaloTemplateApi.service', () => ({
  default: { getTemplates: vi.fn(), getTemplateById: vi.fn() },
}));
vi.mock('../../../features/settings/services/emailSettingsApi.service', () => ({
  default: { listEmailSettings: vi.fn(), sendEmail: vi.fn() },
}));
vi.mock('../../../features/settings/services/zaloSettingsApi.service', () => ({
  default: { listAccounts: vi.fn(), sendMessage: vi.fn(), sendGroupMessage: vi.fn() },
}));
vi.mock('../../../features/campaigns/services/campaignApi.service', () => ({
  default: { getQuickSendEstimate: vi.fn(), testSendQuickCampaign: vi.fn() },
}));
vi.mock('../../../features/campaigns/services/campaignBuilderApi.service', () => ({
  default: { getPreviewZaloGroups: vi.fn(), getDelayConfig: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const zaloPersonalDraft = (recipients) => ({
  channel: 'zalo',
  recipients,
  recipientType: 'phone',
  body: 'Nội dung',
  accountId: 9,
  attachments: [],
  startStep: 'preview',
});

const deferredItem = (overrides = {}) => ({
  status: 'deferred',
  reason: 'inter_message_delay',
  retryAfterMs: 5000,
  resumeAt: Date.now() + 5000,
  ...overrides,
});

describe('QuickSend runSendLoop — Việc 6: xử lý item deferred (PR-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
    emailTemplateApiService.getTemplateById.mockResolvedValue({ data: { data: null } });
    zaloTemplateApiService.getTemplates.mockResolvedValue({ data: { data: { items: [] } } });
    zaloTemplateApiService.getTemplateById.mockResolvedValue({ data: { data: null } });
    emailSettingsApiService.listEmailSettings.mockResolvedValue({ data: { data: { items: [] } } });
    zaloSettingsApiService.listAccounts.mockResolvedValue({
      data: { data: { items: [{ id: 9, displayName: 'TK Zalo 9', isDefault: true }] } },
    });
    campaignApiService.getQuickSendEstimate.mockResolvedValue({ data: { data: { unit: 'immediate', value: 0 } } });
    campaignBuilderApiService.getPreviewZaloGroups.mockResolvedValue({ data: { data: { groups: [] } } });
    campaignBuilderApiService.getDelayConfig.mockResolvedValue({
      data: { success: true, data: { zalo_personal: { minMs: 80000, maxMs: 150000 } } },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reason=inter_message_delay, retryAfterMs ngắn -> tự chờ rồi gửi lại ĐÚNG khoá cũ (không sinh khoá mới)', async () => {
    zaloSettingsApiService.sendMessage
      .mockResolvedValueOnce({ data: { data: { items: [deferredItem()] } } })
      .mockResolvedValueOnce({ data: { data: { items: [{ status: 'success' }] } } });
    mockLocationState = { quickSendDraft: zaloPersonalDraft(['0901111111']) };

    render(<QuickSend />);
    const sendBtn = await screen.findByRole('button', { name: /quickSend\.sendNow/i });
    vi.useFakeTimers();
    fireEvent.click(sendBtn);

    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(2));

    const [firstCallOptions] = [zaloSettingsApiService.sendMessage.mock.calls[0][1]];
    const secondCallOptions = zaloSettingsApiService.sendMessage.mock.calls[1][1];
    expect(secondCallOptions.idempotencyKey).toBe(firstCallOptions.idempotencyKey);

    await vi.waitFor(() => expect(screen.getByText('quickSend.sendSuccessTitle')).toBeInTheDocument());
    expect(screen.getByText(/sendSuccessDesc/)).toHaveTextContent('"count":1');
  });

  it('reason=quiet_hours -> dừng cả đợt ngay, KHÔNG thử lại; người còn lại vào "chưa gửi"', async () => {
    zaloSettingsApiService.sendMessage.mockResolvedValue({
      data: {
        data: {
          items: [deferredItem({ reason: 'quiet_hours', retryAfterMs: 6 * 60 * 60 * 1000 })],
        },
      },
    });
    mockLocationState = { quickSendDraft: zaloPersonalDraft(['0901111111', '0902222222']) };

    render(<QuickSend />);
    fireEvent.click(await screen.findByRole('button', { name: /quickSend\.sendNow/i }));

    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1));
    // Không tự thử thêm — chờ một nhịp rồi vẫn phải dừng ở 1 lần gọi duy nhất.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => expect(screen.getByText('quickSend.sendAllFailedTitle')).toBeInTheDocument());
    expect(screen.getByText(/deferredRecipientCount/)).toHaveTextContent('"count":2');
  });
});

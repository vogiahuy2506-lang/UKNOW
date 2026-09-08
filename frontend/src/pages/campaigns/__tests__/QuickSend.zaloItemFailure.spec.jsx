import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import QuickSend from '../QuickSend';
import emailTemplateApiService from '../../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../../features/templates/services/zaloTemplateApi.service';
import emailSettingsApiService from '../../../features/settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../../features/settings/services/zaloSettingsApi.service';
import campaignApiService from '../../../features/campaigns/services/campaignApi.service';
import campaignBuilderApiService from '../../../features/campaigns/services/campaignBuilderApi.service';

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
  default: { getPreviewZaloGroups: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

/**
 * PLAN_GUI_NHANH_MOI_KENH_2026-09-04.md, Bẫy 7 (PR-2 bước 5): POST /zalo/preview/send-personal
 * và /send-group luôn trả HTTP 200 + { data: { items, meta } } — kể cả khi item đó
 * status:'failed' (nhóm không thuộc tài khoản, quota một nhóm...). runSendLoop trước đây chỉ
 * `await` rồi successCount++ mà không đọc items[].status → giao diện báo "gửi thành công"
 * trong khi tin/nhóm đó chưa nhận được gì.
 */
describe('QuickSend runSendLoop — Bẫy 7: HTTP 200 kèm items[].status failed', () => {
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
  });

  it('Zalo cá nhân: HTTP 200 nhưng items[0].status "failed" -> KHÔNG tính thành công, người nhận vào danh sách gửi lại', async () => {
    zaloSettingsApiService.sendMessage.mockResolvedValue({
      data: {
        success: true,
        data: {
          items: [{ status: 'failed', error: 'Người dùng đã chặn tin nhắn', errorCode: 'BLOCKED' }],
          meta: { attempted: 1, success: 0, failed: 1 },
        },
      },
    });
    mockLocationState = {
      quickSendDraft: {
        channel: 'zalo',
        recipients: ['0901234567'],
        recipientType: 'phone',
        body: 'Nội dung',
        accountId: 9,
        attachments: [],
        startStep: 'preview',
      },
    };

    render(<QuickSend />);
    fireEvent.click(await screen.findByRole('button', { name: /quickSend\.sendNow/i }));

    await waitFor(() => {
      expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1);
    });

    // successCount === 0 -> nhánh "Gửi thất bại!" render, KHÔNG phải "Gửi thành công!".
    expect(await screen.findByText('quickSend.sendAllFailedTitle')).toBeInTheDocument();
    expect(screen.queryByText('quickSend.sendSuccessTitle')).toBeNull();

    // failed chứa ĐÚNG người nhận đã gửi — bấm "Gửi lại" phải gọi lại với cùng số điện thoại.
    const retryBtn = await screen.findByRole('button', { name: /quickSend\.retryFailed/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(2);
    });
    expect(zaloSettingsApiService.sendMessage.mock.calls[1][0].phone).toBe('0901234567');
  });

  it('Zalo nhóm: HTTP 200 nhưng items[0].status "failed" (nhóm không thuộc tài khoản) -> KHÔNG tính thành công', async () => {
    zaloSettingsApiService.sendGroupMessage.mockResolvedValue({
      data: {
        success: true,
        data: {
          items: [{ status: 'failed', error: 'Không tìm thấy nhóm 1234567890123456789 trong tài khoản hiện tại' }],
          meta: { attempted: 1, success: 0, failed: 1 },
        },
      },
    });
    mockLocationState = {
      quickSendDraft: {
        channel: 'zalo_group',
        recipients: ['1234567890123456789'],
        body: 'Thông báo nhóm',
        accountId: 9,
        attachments: [],
        startStep: 'preview',
      },
    };

    render(<QuickSend />);
    fireEvent.click(await screen.findByRole('button', { name: /quickSend\.sendNow/i }));

    await waitFor(() => {
      expect(zaloSettingsApiService.sendGroupMessage).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('quickSend.sendAllFailedTitle')).toBeInTheDocument();
    expect(screen.queryByText('quickSend.sendSuccessTitle')).toBeNull();

    const retryBtn = await screen.findByRole('button', { name: /quickSend\.retryFailed/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(zaloSettingsApiService.sendGroupMessage).toHaveBeenCalledTimes(2);
    });
    expect(zaloSettingsApiService.sendGroupMessage.mock.calls[1][0].groupId).toBe('1234567890123456789');
  });
});

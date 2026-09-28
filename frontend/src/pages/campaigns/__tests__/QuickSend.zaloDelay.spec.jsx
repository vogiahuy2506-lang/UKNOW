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
 * PLAN_GUI_NHANH_ZALO_GIAN_CACH_2026-09-28 PR-1 Việc 1 — Gửi nhanh Zalo (trình duyệt tự lặp,
 * mỗi request 1 người, KHÔNG backend nào chờ giúp) giờ tự giãn cách [minMs,maxMs] lấy từ
 * /campaigns/delay-config TRƯỚC mỗi tin trừ tin đầu của đợt, giống hệt "Chạy thử" của trình dựng.
 * Fake timers theo đúng khuôn CheckoutPage.statusPoll.spec.jsx (dùng `vi.waitFor`, không phải
 * `waitFor` của testing-library — cái đó không tự hợp tác với fake timers).
 */
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
  default: { getPreviewZaloGroups: vi.fn(), getDelayConfig: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const PROD_DELAY_DATA = {
  zalo_personal: { minMs: 80000, maxMs: 150000 },
  zalo_group: { minMs: 80000, maxMs: 150000 },
};

const zaloPersonalDraft = (recipients) => ({
  channel: 'zalo',
  recipients,
  recipientType: 'phone',
  body: 'Nội dung',
  accountId: 9,
  attachments: [],
  startStep: 'preview',
});

const zaloGroupDraft = (recipients) => ({
  channel: 'zalo_group',
  recipients,
  body: 'Thông báo',
  accountId: 9,
  attachments: [],
  startStep: 'preview',
});

describe('QuickSend runSendLoop — Việc 1: giãn cách thật giữa các tin Zalo (PR-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // KHÔNG bật fake timers ở đây — mount ban đầu (findByRole chờ nhiều promise tải dữ liệu
    // settle) dùng testing-library findBy*, thứ không tự hợp tác với fake timers (khác
    // `vi.waitFor`). Mỗi test tự bật fake timers SAU khi đã tìm thấy nút "Gửi ngay".
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
    campaignBuilderApiService.getDelayConfig.mockResolvedValue({ data: { success: true, data: PROD_DELAY_DATA } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Zalo cá nhân 3 người: sendMessage 3 lần, đúng 2 lần chờ, KHÔNG chờ trước người đầu', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // waitMs cố định = floor(0.5*70001)+80000 = 115000
    zaloSettingsApiService.sendMessage.mockResolvedValue({ data: { data: { items: [{ status: 'success' }] } } });
    mockLocationState = { quickSendDraft: zaloPersonalDraft(['0901111111', '0902222222', '0903333333']) };

    render(<QuickSend />);
    const sendBtn = await screen.findByRole('button', { name: /quickSend\.sendNow/i });
    vi.useFakeTimers();
    fireEvent.click(sendBtn);

    // Tin đầu gửi ngay — không có gì để chờ trước nó.
    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1));

    // Chưa đủ 115000ms của lần chờ thứ nhất -> vẫn 1.
    await act(async () => { await vi.advanceTimersByTimeAsync(114000); });
    expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(2));

    // Lần chờ thứ hai — cùng logic.
    await act(async () => { await vi.advanceTimersByTimeAsync(114000); });
    expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(3));

    // "Gọi một lần mỗi đợt" — không phải mỗi tin một lần dò cấu hình.
    expect(campaignBuilderApiService.getDelayConfig).toHaveBeenCalledTimes(1);
  });

  it('Zalo nhóm 3 nhóm: sendGroupMessage 3 lần, đúng 2 lần chờ, KHÔNG chờ trước nhóm đầu', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    zaloSettingsApiService.sendGroupMessage.mockResolvedValue({ data: { data: { items: [{ status: 'success' }] } } });
    mockLocationState = { quickSendDraft: zaloGroupDraft(['1111111111', '2222222222', '3333333333']) };

    render(<QuickSend />);
    const sendBtn = await screen.findByRole('button', { name: /quickSend\.sendNow/i });
    vi.useFakeTimers();
    fireEvent.click(sendBtn);

    await vi.waitFor(() => expect(zaloSettingsApiService.sendGroupMessage).toHaveBeenCalledTimes(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(114000); });
    expect(zaloSettingsApiService.sendGroupMessage).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await vi.waitFor(() => expect(zaloSettingsApiService.sendGroupMessage).toHaveBeenCalledTimes(2));

    await act(async () => { await vi.advanceTimersByTimeAsync(114000); });
    expect(zaloSettingsApiService.sendGroupMessage).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await vi.waitFor(() => expect(zaloSettingsApiService.sendGroupMessage).toHaveBeenCalledTimes(3));
  });

  it('mức chờ tối THIỂU đúng 80000ms khi random() = 0 (biên dưới của [minMs,maxMs])', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    zaloSettingsApiService.sendMessage.mockResolvedValue({ data: { data: { items: [{ status: 'success' }] } } });
    mockLocationState = { quickSendDraft: zaloPersonalDraft(['0901111111', '0902222222']) };

    render(<QuickSend />);
    const sendBtn = await screen.findByRole('button', { name: /quickSend\.sendNow/i });
    vi.useFakeTimers();
    fireEvent.click(sendBtn);
    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(79000); });
    expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(2));
  });

  it('mức chờ tối ĐA đúng 150000ms khi random() ≈ 1 (biên trên của [minMs,maxMs])', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999999999);
    zaloSettingsApiService.sendMessage.mockResolvedValue({ data: { data: { items: [{ status: 'success' }] } } });
    mockLocationState = { quickSendDraft: zaloPersonalDraft(['0901111111', '0902222222']) };

    render(<QuickSend />);
    const sendBtn = await screen.findByRole('button', { name: /quickSend\.sendNow/i });
    vi.useFakeTimers();
    fireEvent.click(sendBtn);
    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(149000); });
    expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(2));
  });

  it('Email 3 người: 0 lần chờ, không gọi getDelayConfig (Email không đổi)', async () => {
    emailSettingsApiService.sendEmail.mockResolvedValue({ data: { success: true } });
    mockLocationState = {
      quickSendDraft: {
        channel: 'email',
        recipients: ['r1@example.com', 'r2@example.com', 'r3@example.com'],
        subject: 'Tiêu đề',
        body: 'Nội dung',
        accountId: 1,
        attachments: [],
        startStep: 'preview',
      },
    };

    render(<QuickSend />);
    fireEvent.click(await screen.findByRole('button', { name: /quickSend\.sendNow/i }));

    await vi.waitFor(() => expect(emailSettingsApiService.sendEmail).toHaveBeenCalledTimes(3));
    expect(campaignBuilderApiService.getDelayConfig).not.toHaveBeenCalled();
  });

  it('delay-config tải lỗi -> vẫn chờ trong mức production 80000-150000ms, KHÔNG rơi về 0', async () => {
    campaignBuilderApiService.getDelayConfig.mockRejectedValue(new Error('Network Error'));
    vi.spyOn(Math, 'random').mockReturnValue(0); // biên dưới -> đúng 80000ms nếu fallback đúng
    zaloSettingsApiService.sendMessage.mockResolvedValue({ data: { data: { items: [{ status: 'success' }] } } });
    mockLocationState = { quickSendDraft: zaloPersonalDraft(['0901111111', '0902222222']) };

    render(<QuickSend />);
    const sendBtn = await screen.findByRole('button', { name: /quickSend\.sendNow/i });
    vi.useFakeTimers();
    fireEvent.click(sendBtn);
    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1));

    // Nếu lỗi tải cấu hình làm delay rơi về 0 (hoặc NaN -> sleepWithAbort coi như <=0), tin thứ 2
    // đã gửi ngay ở đây — test phải bắt được điều đó TRƯỚC khi advance đủ 80000ms.
    await act(async () => { await vi.advanceTimersByTimeAsync(79000); });
    expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(2));
  });

  it('Đang gửi (isSending=true) -> gắn beforeunload; gửi xong -> gỡ ngay', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    zaloSettingsApiService.sendMessage.mockResolvedValue({ data: { data: { items: [{ status: 'success' }] } } });
    mockLocationState = { quickSendDraft: zaloPersonalDraft(['0901111111']) };

    render(<QuickSend />);
    const sendBtn = await screen.findByRole('button', { name: /quickSend\.sendNow/i });
    vi.useFakeTimers();
    fireEvent.click(sendBtn);

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    await vi.waitFor(() => expect(zaloSettingsApiService.sendMessage).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });
});

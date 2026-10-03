/**
 * F2.3 (rà soát C P1-4) — `create_and_run` KHÔNG được chạy thẳng.
 *
 * Trước đây: model trả `create_and_run` → FE gọi `aiApi.createAndRunCampaign` ngay (tạo + kích hoạt + chạy), người dùng không
 * thấy nội dung, người nhận hay bộ lọc. Nay mọi `create_and_run` đi qua THẺ XÁC NHẬN (bản xem trước server dựng) với nút
 * "Tạo và chạy"; chỉ khi bấm nút đó mới gọi API chạy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiChatbot from '../AiChatbot';
import aiApi from '../../../services/aiApi';
import api from '../../../services/api';

vi.mock('../../../services/aiApi');
vi.mock('../../../services/api');
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));
vi.mock('../../../i18n', () => ({
  useI18n: (namespace = null) => {
    const t = (key) => (namespace ? `${namespace}.${key}` : key);
    if (namespace) return t;
    return { t, locale: 'vi' };
  },
}));
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 1, role: 'user' },
    isAuthenticated: true,
    fetchAiCredits: vi.fn().mockResolvedValue(undefined),
    refreshAiCredits: vi.fn().mockResolvedValue(undefined),
    billingStatus: 'active',
    aiCredits: 100,
    addons: null,
    activeContext: null,
  }),
}));
vi.mock('../../storage/useStorageQuota', () => ({
  default: () => ({ usage: null, refreshQuota: vi.fn() }),
}));
vi.mock('../../settings/services/zaloSettingsApi.service', () => ({
  default: { getChannels: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../../services/help.service', () => ({
  getHelpArticle: vi.fn().mockResolvedValue(null),
}));

const SCRIPT = {
  campaignName: 'Email khách quen',
  campaignType: 'email',
  nodes: [{ tempId: 'n_send', nodeType: 'action', nodeSubtype: 'send_email', config: {} }],
  connections: [],
};

const READY_VIEW = {
  version: 1,
  campaign: { name: 'Email khách quen', description: '', type: 'email' },
  totals: { sendSteps: 1 },
  readyToCreate: true,
  blockingIssues: [],
  resourceVersions: [],
  steps: [
    {
      key: 'n_send:0',
      nodeId: 'n_send',
      stepIndex: 0,
      channel: 'email',
      title: 'Gửi email',
      content: { subject: 'Mời bạn', bodyText: 'Xin chào, mời bạn học tiếp.', attachments: [] },
      timing: { anchor: 'start', value: 0, unit: 'days' },
      sender: { label: 'shop@example.vn' },
      recipients: { mode: 'source', type: null, count: null, sourceLabel: 'Lấy dữ liệu khách hàng' },
    },
  ],
};

describe('AiChatbot — create_and_run đi qua thẻ xác nhận, không chạy thẳng', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    aiApi.getSessions.mockResolvedValue({ data: [] });
    aiApi.prepareCampaign.mockResolvedValue({
      success: true,
      data: { confirmationView: READY_VIEW, preparedScript: { ...SCRIPT, prepared: true } },
    });
    aiApi.createAndRunCampaign.mockResolvedValue({
      success: true,
      data: { campaignId: 9, campaignName: 'Email khách quen', runId: 55 },
    });
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
  });

  const sendMessage = async (text) => {
    render(
      <MemoryRouter>
        <AiChatbot isOpen />
      </MemoryRouter>,
    );
    const textarea = await screen.findByPlaceholderText('aiChatbot.inputPlaceholder');
    fireEvent.change(textarea, { target: { value: text } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
  };

  it('model trả create_and_run → hiện thẻ xác nhận + nút "Tạo và chạy", KHÔNG gọi createAndRunCampaign trước khi bấm', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: { type: 'create_and_run', content: 'Mình sẽ tạo và chạy chiến dịch.', data: SCRIPT, sessionId: 's1', sessionTitle: 'Email' },
    });

    await sendMessage('Tạo và chạy ngay chiến dịch email cho khách quen');

    const runButton = await screen.findByRole('button', { name: 'aiChatbot.createAndRunBtn' });
    expect(runButton).toBeEnabled();
    expect(screen.getByRole('button', { name: 'aiChatbot.createCampaignBtn' })).toBeInTheDocument();
    expect(aiApi.prepareCampaign).toHaveBeenCalledTimes(1);
    // Chốt chặn của F2.3: chưa bấm thì KHÔNG có lời gọi tạo + chạy.
    expect(aiApi.createAndRunCampaign).not.toHaveBeenCalled();
  });

  it('bấm "Tạo và chạy" → gọi createAndRunCampaign ĐÚNG MỘT LẦN với bản đã xem trước + autoRun, rồi dọn thẻ', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: { type: 'create_and_run', content: 'Mình sẽ tạo và chạy chiến dịch.', data: SCRIPT, sessionId: 's1', sessionTitle: 'Email' },
    });

    await sendMessage('Tạo và chạy ngay chiến dịch email cho khách quen');
    const runButton = await screen.findByRole('button', { name: 'aiChatbot.createAndRunBtn' });
    fireEvent.click(runButton);
    fireEvent.click(runButton); // bấm đúp không được chạy hai lần

    await waitFor(() => expect(aiApi.createAndRunCampaign).toHaveBeenCalledTimes(1));
    const [sentScript] = aiApi.createAndRunCampaign.mock.calls[0];
    expect(sentScript).toMatchObject({ campaignName: 'Email khách quen', prepared: true, isAiDraft: false, autoRun: true });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'aiChatbot.createAndRunBtn' })).not.toBeInTheDocument());
  });

  it('model trả confirm_create (không phải create_and_run) → KHÔNG có nút "Tạo và chạy"', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: { type: 'confirm_create', content: 'Xem lại chiến dịch.', data: SCRIPT, sessionId: 's2', sessionTitle: 'Email' },
    });

    await sendMessage('Tạo chiến dịch email cho khách quen');

    await screen.findByRole('button', { name: 'aiChatbot.createCampaignBtn' });
    expect(screen.queryByRole('button', { name: 'aiChatbot.createAndRunBtn' })).not.toBeInTheDocument();
    expect(aiApi.createAndRunCampaign).not.toHaveBeenCalled();
  });

  it('bản xem trước có lỗi chặn (readyToCreate=false) → nút "Tạo và chạy" bị khoá, bấm cũng KHÔNG gọi createAndRunCampaign', async () => {
    aiApi.prepareCampaign.mockResolvedValue({
      success: true,
      data: {
        confirmationView: { ...READY_VIEW, readyToCreate: false, blockingIssues: [{ code: 'missing_sender', message: 'Chưa có tài khoản gửi' }] },
        preparedScript: { ...SCRIPT, prepared: true },
      },
    });
    aiApi.chat.mockResolvedValue({
      success: true,
      data: { type: 'create_and_run', content: 'Mình sẽ tạo và chạy chiến dịch.', data: SCRIPT, sessionId: 's1', sessionTitle: 'Email' },
    });

    await sendMessage('Tạo và chạy ngay chiến dịch email cho khách quen');
    const runButton = await screen.findByRole('button', { name: 'aiChatbot.createAndRunBtn' });
    expect(runButton).toBeDisabled();
    fireEvent.click(runButton);
    await new Promise((r) => setTimeout(r, 50));
    expect(aiApi.createAndRunCampaign).not.toHaveBeenCalled();
  });

  it('lỗi từ server khi chạy → thẻ còn nguyên để thử lại (không mất bản xem trước)', async () => {
    aiApi.createAndRunCampaign.mockResolvedValue({ success: false, message: 'Hết hạn mức gửi hôm nay' });
    aiApi.chat.mockResolvedValue({
      success: true,
      data: { type: 'create_and_run', content: 'Mình sẽ tạo và chạy chiến dịch.', data: SCRIPT, sessionId: 's1', sessionTitle: 'Email' },
    });

    await sendMessage('Tạo và chạy ngay chiến dịch email cho khách quen');
    fireEvent.click(await screen.findByRole('button', { name: 'aiChatbot.createAndRunBtn' }));

    await waitFor(() => expect(aiApi.createAndRunCampaign).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'aiChatbot.createAndRunBtn' })).toBeEnabled();
  });
});

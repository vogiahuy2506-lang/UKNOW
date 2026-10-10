/**
 * PR-C2 (C-NO-GOC1) — thẻ xác nhận dùng gates SAU LƯỢT do server trả (`data.wizardState`), không suy lại từ lịch sử.
 * Phản hồi thiếu `wizardState` (BE cũ / đường help) thì rơi về đường suy từ lịch sử như trước.
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

const SCRIPT = () => ({
  campaignName: 'Email khách quen',
  campaignType: 'email',
  nodes: [{ tempId: 'n_send', nodeType: 'action', nodeSubtype: 'send_email', config: {} }],
  connections: [],
});

const READY_VIEW = {
  version: 1,
  campaign: { name: 'Email khách quen', description: '', type: 'email' },
  totals: { sendSteps: 1 },
  readyToCreate: true,
  blockingIssues: [],
  resourceVersions: [],
  steps: [],
};

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

describe('AiChatbot — wizard state từ server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    aiApi.getSessions.mockResolvedValue({ data: [] });
    aiApi.prepareCampaign.mockResolvedValue({ success: true, data: { confirmationView: READY_VIEW, preparedScript: { ...SCRIPT(), prepared: true } } });
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
  });

  it('phản hồi CÓ wizardState: confirm_create vá script bằng gates server (TK gửi 7) dù lịch sử không có marker nào', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: {
        type: 'confirm_create',
        content: 'Xác nhận?',
        data: SCRIPT(),
        sessionId: 's1',
        sessionTitle: 'Email',
        wizardState: { v: 1, gates: { channel: 'email', senderAccountId: 7, senderAccountName: 'Sales', dataSource: 'db' }, plan: {}, meta: { updatedAt: '2026-10-10T10:00:00.000Z' } },
      },
    });

    await sendMessage('Tạo chiến dịch email cho khách quen');

    await waitFor(() => expect(aiApi.prepareCampaign).toHaveBeenCalledTimes(1));
    const [rawScript] = aiApi.prepareCampaign.mock.calls[0];
    expect(rawScript.nodes[0].config.fromEmailId).toBe(7);
    expect(rawScript.wizardContext).toMatchObject({ channel: 'email', senderAccountId: 7, dataSource: 'db' });
  });

  it('phản hồi KHÔNG có wizardState (BE cũ): rơi về suy từ lịch sử — marker senderAccount 9 trong lịch sử vẫn vá được script', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: { type: 'confirm_create', content: 'Xác nhận?', data: SCRIPT(), sessionId: 's1', sessionTitle: 'Email' },
    });

    await sendMessage('[wizard]{"gate":"senderAccount","channel":"email","accountId":9,"accountName":"Cũ"}\nCũ');

    await waitFor(() => expect(aiApi.prepareCampaign).toHaveBeenCalledTimes(1));
    const [rawScript] = aiApi.prepareCampaign.mock.calls[0];
    expect(rawScript.nodes[0].config.fromEmailId).toBe(9);
    expect(rawScript.wizardContext.senderAccountId).toBe(9);
  });

  it('phản hồi có wizardState v khác 1 → bị bỏ qua, rơi về lịch sử', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: {
        type: 'confirm_create', content: 'Xác nhận?', data: SCRIPT(), sessionId: 's1', sessionTitle: 'Email',
        wizardState: { v: 2, gates: { senderAccountId: 7 } },
      },
    });

    await sendMessage('[wizard]{"gate":"senderAccount","channel":"email","accountId":9,"accountName":"Cũ"}\nCũ');

    await waitFor(() => expect(aiApi.prepareCampaign).toHaveBeenCalledTimes(1));
    expect(aiApi.prepareCampaign.mock.calls[0][0].nodes[0].config.fromEmailId).toBe(9);
  });
});

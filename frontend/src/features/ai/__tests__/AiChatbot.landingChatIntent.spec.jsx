/**
 * PR-9 (C P2-5 / B-5) — lượt chat KHÔNG tự sinh landing nữa: backend trả Ý ĐỊNH `landing_page` (prompt đã chuẩn bị + tệp của lượt),
 * frontend tự gọi route sinh (luồng NDJSON) kèm sessionId + tệp, để đi qua cùng đường có tự kiểm hiển thị.
 * Mock: bộ đo hiển thị, aiApi, api. Từ điển i18n THẬT để kiểm câu người dùng thấy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiChatbot from '../AiChatbot';
import aiApi from '../../../services/aiApi';
import api from '../../../services/api';
import { runLayoutAudit } from '../utils/layoutAudit.js';

const mockToast = vi.hoisted(() => {
  const toast = vi.fn();
  toast.error = vi.fn();
  toast.success = vi.fn();
  toast.loading = vi.fn();
  toast.dismiss = vi.fn();
  return toast;
});
vi.mock('react-hot-toast', () => ({ toast: mockToast, default: mockToast, Toaster: () => null }));
vi.mock('../../../services/aiApi');
vi.mock('../../../services/api');
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));
vi.mock('../../../i18n', async () => (await import('../../../test/realI18n.js')).realI18nModule());
vi.mock('../utils/layoutAudit.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runLayoutAudit: vi.fn(),
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

const CLEAN = { findings: [], timedOut: false, errors: [] };

const INTENT_RESPONSE = {
  success: true,
  data: {
    type: 'landing_page',
    content: 'Mình sẽ tạo trang giới thiệu khoá học cho bạn.',
    data: {
      title: 'Khoá Học AI Pro',
      prompt: 'Trang landing giới thiệu khoá học AI chuyên sâu',
      contentLocale: 'vi',
      needsGeneration: true,
      files: [{ storageKey: 'uploads/1/chat/logo.png', originalName: 'logo.png', contentType: 'image/png', size: 2048 }],
    },
    sessionId: 'sess_new',
    sessionTitle: 'Tạo landing',
  },
};

describe('AiChatbot — chat trả ý định sinh landing, frontend tự gọi route sinh (PR-9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runLayoutAudit.mockReset();
    runLayoutAudit.mockResolvedValue(CLEAN);
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/preview');
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    aiApi.getSessions.mockResolvedValue({ data: [] });
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
    aiApi.chat.mockResolvedValue(INTENT_RESPONSE);
    aiApi.generateLandingPage.mockResolvedValue({
      success: true,
      data: { title: 'Khoá Học AI Pro', html: '<div>v0</div>', css: '', messageId: 9001 },
    });
  });

  const sendPrompt = async (promptText) => {
    const textarea = await screen.findByRole('textbox');
    fireEvent.change(textarea, { target: { value: promptText } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
  };
  const renderChat = () => render(
    <MemoryRouter>
      <AiChatbot isOpen />
    </MemoryRouter>,
  );

  it('gọi route sinh với prompt đã chuẩn bị, sessionId của phiên vừa tạo, TỆP của lượt, ngôn ngữ và skipUserMessage; hiện thẻ trang mang id tin', async () => {
    renderChat();
    await sendPrompt('Tạo trang giới thiệu khoá học AI');

    await waitFor(() => expect(aiApi.generateLandingPage).toHaveBeenCalledTimes(1));
    const [prompt, templateId, files, sessionId, userSummary, brief, options] = aiApi.generateLandingPage.mock.calls[0];
    expect(prompt).toBe('Trang landing giới thiệu khoá học AI chuyên sâu');
    expect(templateId).toBeNull();
    // B-5: logo khách vừa gửi (đã promote, server trả kèm ý định) tới được bộ sinh
    expect(files).toEqual([{ storageKey: 'uploads/1/chat/logo.png', originalName: 'logo.png', contentType: 'image/png', size: 2048 }]);
    expect(sessionId).toBe('sess_new');
    expect(userSummary).toBeNull();
    expect(brief).toBeNull();
    expect(options).toMatchObject({ locale: 'vi', skipUserMessage: true });
    expect(typeof options.onStage).toBe('function');

    // Câu dẫn của trợ lý + thẻ trang (không có thẻ rỗng từ chính tin ý định)
    expect(await screen.findByText('Mình sẽ tạo trang giới thiệu khoá học cho bạn.')).toBeInTheDocument();
    expect(await screen.findByText('Khoá Học AI Pro')).toBeInTheDocument();
  });

  it('thẻ vừa sinh đi qua CÙNG vòng tự kiểm hiển thị (đo bằng runLayoutAudit trên html mới sinh)', async () => {
    renderChat();
    await sendPrompt('Tạo trang giới thiệu khoá học AI');
    await waitFor(() => expect(runLayoutAudit).toHaveBeenCalledTimes(1));
    expect(runLayoutAudit.mock.calls[0][0]).toContain('<div>v0</div>');
    expect(await screen.findByText('Đã kiểm tra hiển thị ✓')).toBeInTheDocument();
  });

  it('chưa lưu được vào phiên (saved:false) → cảnh báo (B-18) và KHÔNG tự sửa', async () => {
    aiApi.generateLandingPage.mockResolvedValue({
      success: true,
      data: { title: 'Khoá Học AI Pro', html: '<div>v0</div>', css: '', saved: false },
    });
    renderChat();
    await sendPrompt('Tạo trang giới thiệu khoá học AI');
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(mockToast.mock.calls[0][0]).toMatch(/chưa lưu được vào phiên chat/);
    expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
  });

  it('route sinh lỗi → câu lỗi tiếng Việt trong chat, KHÔNG thẻ trang, ô nhập mở lại', async () => {
    aiApi.generateLandingPage.mockRejectedValue(
      Object.assign(new Error('x'), { response: { status: 422, data: { message: 'AI bịa URL ảnh ngoài hệ thống.' } } }),
    );
    renderChat();
    await sendPrompt('Tạo trang giới thiệu khoá học AI');
    expect(await screen.findByText(/Có lỗi khi tạo landing page: AI bịa URL ảnh ngoài hệ thống\./)).toBeInTheDocument();
    expect(screen.queryByText('Khoá Học AI Pro')).toBeNull();
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
  });

  it('backend CŨ vẫn trả trang đã sinh sẵn (có html) → hiện thẻ như trước, KHÔNG gọi route sinh lần nữa', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: {
        type: 'landing_page',
        content: 'Tôi đã tạo mẫu landing page cho bạn:',
        data: { title: 'Trang cũ', html: '<div>sinh sẵn</div>' },
        messageId: 4242,
        sessionId: 'sess_old',
      },
    });
    renderChat();
    await sendPrompt('Tạo trang');
    expect(await screen.findByText('Trang cũ')).toBeInTheDocument();
    expect(aiApi.generateLandingPage).not.toHaveBeenCalled();
  });
});

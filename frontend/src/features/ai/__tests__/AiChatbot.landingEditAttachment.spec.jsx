import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiChatbot from '../AiChatbot';
import aiApi from '../../../services/aiApi';
import api from '../../../services/api';

vi.mock('../../../services/aiApi');
vi.mock('../../../services/api');
vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));
// Sửa landing có tệp đính kèm → AiChatbot đo hiển thị TRƯỚC khi gửi (plan landing tự kiểm, PR-3).
// jsdom không có layout nên iframe đo không bao giờ trả lời (phải đợi hết trần thời gian) — mock bộ đo.
vi.mock('../utils/layoutAudit.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runLayoutAudit: vi.fn().mockResolvedValue({ findings: [], timedOut: false, errors: [] }),
}));
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

describe('AiChatbot — đính kèm tệp khi sửa landing page (PR-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/preview');
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
  });

  it('handleSend có file + ngữ cảnh landing → gọi editLandingHtml với files', async () => {
    aiApi.getSessions.mockResolvedValue({
      data: [{ id: 'sess_1', title: 'Phiên landing' }],
    });
    aiApi.getSessionMessages.mockResolvedValue({
      data: [
        { role: 'user', content: 'Tạo landing page' },
        {
          role: 'assistant',
          type: 'landing_page',
          data: { title: 'Trang landing test', html: '<div>Trang landing</div>' },
        },
      ],
    });
    aiApi.editLandingHtml.mockResolvedValue({
      success: true,
      data: { title: 'Trang landing test', html: '<div>Trang landing mới</div>' },
    });
    api.get.mockResolvedValue({ data: {} });
    api.post.mockImplementation((url) => {
      if (url === '/uploads/temp') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              tempId: 'temp_logo_123',
              originalName: 'logo.png',
              contentType: 'image/png',
              size: 500,
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(
      <MemoryRouter>
        <AiChatbot isOpen={true} />
      </MemoryRouter>
    );

    // Chờ session load và click vào tab session 'Phiên landing'
    const sessionTab = await screen.findByText('Phiên landing');
    fireEvent.mouseUp(sessionTab);

    // Đảm bảo tin nhắn landing page đã xuất hiện trong chat
    await waitFor(() => {
      expect(screen.getByText('Trang landing test')).toBeInTheDocument();
    });

    // Upload file
    const file = new File(['fake image content'], 'logo.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Đợi chip preview xuất hiện trong input box
    await waitFor(() => {
      expect(screen.getByText('logo.png')).toBeInTheDocument();
    });

    // Nhập nội dung chỉnh sửa (không phải lệnh tạo mới)
    const textarea = screen.getByPlaceholderText('aiChatbot.inputPlaceholder');
    fireEvent.change(textarea, { target: { value: 'Đổi màu nền header sang màu cam' } });

    // Bấm phím Enter trên textarea để gửi
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    // Khẳng định editLandingHtml được gọi với files
    await waitFor(() => {
      expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1);
    });

    const callArgs = aiApi.editLandingHtml.mock.calls[0][0];
    expect(callArgs.instruction).toBe('Đổi màu nền header sang màu cam');
    expect(callArgs.currentHtml).toBe('<div>Trang landing</div>');
    expect(callArgs.files).toHaveLength(1);
    expect(callArgs.files[0]).toMatchObject({
      tempId: 'temp_logo_123',
      originalName: 'logo.png',
      contentType: 'image/png',
    });
  });

  it('AskLandingDetailsCard hiện landingAttachHint khi isActive = true và ẩn khi false', async () => {
    const { AskLandingDetailsCard } = await import('../components/AiChatbotCards');
    const data = {
      questions: [
        { id: 'q1', label: 'Q1', options: [{ value: 'v1', label: 'Opt 1' }] },
      ],
    };
    const t = (k) => k;
    const { rerender } = render(<AskLandingDetailsCard data={data} onSubmit={vi.fn()} isActive={true} t={t} />);
    expect(screen.getByText(/aiChatbot\.landingAttachHint/)).toBeInTheDocument();

    rerender(<AskLandingDetailsCard data={data} onSubmit={vi.fn()} isActive={false} t={t} />);
    expect(screen.queryByText(/aiChatbot\.landingAttachHint/)).not.toBeInTheDocument();
  });
});

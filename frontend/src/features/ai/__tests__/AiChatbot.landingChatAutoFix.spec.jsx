/**
 * LỆNH GIAO 25/09 — Kiểm hiển thị và tự sửa cho trang landing sinh từ lượt chat thẳng.
 * Ca 4: Chat trả landing page → kích hoạt kiểm hiển thị với allowAutoFix: true
 * Ca 5: Chat từ ô mới (chưa có session) → sessionId được truyền đúng vào vòng tự kiểm
 * Ca 6: Chat trả landing page có lỗi hiển thị → tự sửa miễn phí thành công
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

const finding = (over = {}) => ({
  kind: 'text_covered',
  width: 1280,
  text: '03/02/2026',
  selector: 'span.block.text-lg.font-extrabold:nth-of-type(1)',
  coveredBy: { text: '1', selector: 'div.absolute.-left-11.w-8:nth-of-type(1)' },
  overlapPx: 12,
  side: 'right',
  sectionTitle: 'Dòng thời gian',
  ...over,
});

const CLEAN = { findings: [], timedOut: false, errors: [] };
const BROKEN = { findings: [finding()], timedOut: false, errors: [] };
const SUMMARY = 'Đã nới cột ngày ở phần Dòng thời gian';

describe('AiChatbot — sinh landing page từ chat thẳng tự kiểm + tự sửa (lệnh giao 25/09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runLayoutAudit.mockReset();
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/preview');
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    aiApi.getSessions.mockResolvedValue({ data: [] });
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
  });

  const sendPrompt = async (promptText) => {
    const textarea = await screen.findByRole('textbox');
    fireEvent.change(textarea, { target: { value: promptText } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
  };

  it('4. Chat trả landing page → kích hoạt kiểm hiển thị với allowAutoFix: true', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: {
        type: 'landing_page',
        content: 'Tôi đã tạo mẫu landing page cho bạn:',
        data: { title: 'Trang khoá học', html: '<div>v0</div>' },
        messageId: 4242,
        sessionId: 'sess_existing',
      },
    });
    runLayoutAudit.mockResolvedValueOnce(BROKEN).mockResolvedValue(CLEAN);
    aiApi.editLandingHtml.mockResolvedValue({
      success: true,
      data: { title: 'Trang khoá học', html: '<div>v1</div>', changeSummary: SUMMARY, canRevert: true },
    });

    render(
      <MemoryRouter>
        <AiChatbot isOpen />
      </MemoryRouter>,
    );

    await sendPrompt('Tạo landing page khoá học');

    // Tự sửa kích hoạt: editLandingHtml được gọi với autoLayoutFix: true mà không cần bấm gì
    await waitFor(() => expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1));
    const call = aiApi.editLandingHtml.mock.calls[0][0];
    expect(call).toMatchObject({
      autoLayoutFix: true,
      messageId: 4242,
      currentHtml: '<div>v0</div>',
      layoutFindings: BROKEN.findings,
    });
    expect(call.instruction).toBeUndefined(); // server tự viết lệnh
  });

  it('5. Chat từ ô mới (chưa có session) → sessionId được truyền đúng vào vòng tự kiểm', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: {
        type: 'landing_page',
        content: 'Tôi đã tạo mẫu landing page cho bạn:',
        data: { title: 'Trang bán hàng mới', html: '<div>v0</div>' },
        messageId: 5555,
        sessionId: 'new-sess-123',
      },
    });
    runLayoutAudit.mockResolvedValueOnce(BROKEN).mockResolvedValue(CLEAN);
    aiApi.editLandingHtml.mockResolvedValue({
      success: true,
      data: { title: 'Trang bán hàng mới', html: '<div>v1</div>', changeSummary: SUMMARY, canRevert: true },
    });

    render(
      <MemoryRouter>
        <AiChatbot isOpen />
      </MemoryRouter>,
    );

    await sendPrompt('Tạo landing page bán sản phẩm mới');

    // Vòng tự sửa nhận được sessionId 'new-sess-123' từ response thay vì null
    await waitFor(() => expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1));
    const call = aiApi.editLandingHtml.mock.calls[0][0];
    expect(call.sessionId).toBe('new-sess-123');
    expect(call.messageId).toBe(5555);
  });

  it('6. Chat trả landing page có lỗi hiển thị → tự sửa miễn phí thành công', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: {
        type: 'landing_page',
        content: 'Tôi đã tạo mẫu landing page cho bạn:',
        data: { title: 'Trang khoá học', html: '<div>v0</div>' },
        messageId: 4242,
        sessionId: 'sess_1',
      },
    });
    runLayoutAudit.mockResolvedValueOnce(BROKEN).mockResolvedValue(CLEAN);
    aiApi.editLandingHtml.mockResolvedValue({
      success: true,
      data: { title: 'Trang khoá học', html: '<div>v1</div>', changeSummary: SUMMARY, canRevert: true },
    });

    render(
      <MemoryRouter>
        <AiChatbot isOpen />
      </MemoryRouter>,
    );

    await sendPrompt('Tạo trang khoá học');

    // Thấy câu xác nhận tiếng người của AI và badge đã kiểm tra ✓
    expect(await screen.findByText(`Đã chỉnh hiển thị: ${SUMMARY}`)).toBeInTheDocument();
    expect(await screen.findByText('Đã kiểm tra hiển thị ✓')).toBeInTheDocument();
    expect(screen.getByText('Hoàn tác')).toBeInTheDocument();
  });
});

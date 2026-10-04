/**
 * PR-9 (B-4) — chữ tiến độ "Đang viết trang… / Đang sửa lại trang…" dưới dấu chấm "đang gõ" của trợ lý, theo `stage` server báo
 * trên luồng sinh / sửa landing. Mock: bộ đo hiển thị, aiApi, api. Từ điển i18n THẬT để kiểm câu người dùng thấy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

const generatedPage = { title: 'Trang khoá học', html: '<div>v0</div>', css: '', messageId: 4242 };

async function openSession(dbMessages) {
  aiApi.getSessions.mockResolvedValue({ data: [{ id: 'sess_1', title: 'Phiên landing' }] });
  aiApi.getSessionMessages.mockResolvedValue({ data: dbMessages });
  render(
    <MemoryRouter>
      <AiChatbot isOpen />
    </MemoryRouter>,
  );
  fireEvent.mouseUp(await screen.findByText('Phiên landing'));
}

const askDetails = [
  { id: 1, role: 'user', content: 'Tạo landing page cho khoá học' },
  {
    id: 2,
    role: 'assistant',
    type: 'ask_landing_details',
    content: 'Bạn muốn phong cách nào?',
    data: { questions: [{ id: 'style', label: 'Phong cách:', options: [{ value: 'modern', label: 'Hiện đại' }] }] },
  },
];

describe('AiChatbot — chữ tiến độ lượt sinh landing (PR-9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runLayoutAudit.mockReset();
    runLayoutAudit.mockResolvedValue({ findings: [], timedOut: false, errors: [] });
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/preview');
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    api.get.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });
  });

  it('server báo stage → hiện "Đang viết trang…" rồi "Đang sửa lại trang…"; xong thì chữ biến mất', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let onStage = null;
    aiApi.generateLandingPage.mockImplementation(async (...args) => {
      onStage = args[6]?.onStage; // tham số thứ 7 = { onStage, ... }
      onStage('generating');
      await gate;
      return { success: true, data: generatedPage };
    });

    await openSession(askDetails);
    fireEvent.click(await screen.findByText('Hiện đại'));
    fireEvent.click(await screen.findByText(/Tạo Landing Page theo lựa chọn này/));

    expect((await screen.findByTestId('landing-stage')).textContent).toBe('Đang viết trang…');

    act(() => { onStage('fixing'); });
    await waitFor(() => expect(screen.getByTestId('landing-stage').textContent).toBe('Đang sửa lại trang…'));

    // stage lạ (server thêm stage mới) → không hiện khoá i18n trần
    act(() => { onStage('whatever'); });
    await waitFor(() => expect(screen.queryByTestId('landing-stage')).toBeNull());

    await act(async () => { release(); });
    await screen.findByText('Trang khoá học');
    expect(screen.queryByTestId('landing-stage')).toBeNull();
  });

  it('lượt sinh lỗi → chữ tiến độ cũng tắt (không kẹt "Đang viết trang…")', async () => {
    aiApi.generateLandingPage.mockImplementation(async (...args) => {
      args[6]?.onStage?.('generating');
      throw Object.assign(new Error('AI phản hồi quá lâu'), { response: { status: 503, data: { message: 'AI phản hồi quá lâu' } } });
    });

    await openSession(askDetails);
    fireEvent.click(await screen.findByText('Hiện đại'));
    fireEvent.click(await screen.findByText(/Tạo Landing Page theo lựa chọn này/));

    await screen.findByText(/Có lỗi khi tạo landing page: AI phản hồi quá lâu/);
    expect(screen.queryByTestId('landing-stage')).toBeNull();
  });
});

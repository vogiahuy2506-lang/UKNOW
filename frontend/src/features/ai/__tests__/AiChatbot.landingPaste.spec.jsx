import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiChatbot from '../AiChatbot';
import aiApi from '../../../services/aiApi';
import api from '../../../services/api';

// PLAN_TRO_LY_CHINH_LANDING_TRON_GOI_2026-09-13.md, Việc 2.1/2.4 — dán HTML có sẵn vào ô chat
// đi thẳng aiApi.landingFromHtml, KHÔNG qua aiApi.chat (mẫu mock: AiChatbot.landingEditAttachment.spec.jsx).
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
// jsdom không có layout — mock bộ đo để kết quả kiểm hiển thị xác định được.
vi.mock('../utils/layoutAudit.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runLayoutAudit: vi.fn(),
}));
import { runLayoutAudit } from '../utils/layoutAudit.js';

const CLEAN_AUDIT = { findings: [], timedOut: false, errors: [] };
const BROKEN_AUDIT = {
  findings: [{
    kind: 'text_covered', width: 1280, text: '03/02/2026', selector: 'span.block:nth-of-type(1)',
    coveredBy: { text: '1', selector: 'div.absolute:nth-of-type(1)' }, overlapPx: 12, sectionTitle: 'Dòng thời gian',
  }],
  timedOut: false,
  errors: [],
};

const PASTED_HTML = '<!doctype html><html><head><title>Trang khách dán</title></head><body><h1>Chào</h1><p>Nội dung</p></body></html>';

describe('AiChatbot — dán HTML có sẵn vào ô chat (PR-2, Việc 2.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/preview');
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    aiApi.getBusinessProfile = vi.fn().mockResolvedValue({ data: null });
    aiApi.getSessions.mockResolvedValue({ data: [] });
    api.get.mockResolvedValue({ data: {} });
    runLayoutAudit.mockReset();
    runLayoutAudit.mockResolvedValue(CLEAN_AUDIT);
  });

  const pasteResponse = (sessionId) => ({
    success: true,
    data: {
      sessionId,
      sessionTitle: 'Trang khách dán',
      message: {
        content: 'Đã nhận trang HTML "Trang khách dán".',
        type: 'landing_page',
        data: { title: 'Trang khách dán', html: PASTED_HTML, source: 'pasted' },
      },
    },
  });

  const pasteIntoChat = async (text) => {
    render(
      <MemoryRouter>
        <AiChatbot isOpen={true} />
      </MemoryRouter>
    );
    const textarea = await screen.findByPlaceholderText('aiChatbot.inputPlaceholder');
    fireEvent.change(textarea, { target: { value: text } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
  };

  // Nghiệm thu production 25/09 (plan landing tự kiểm §13 N7): đường dán không chạy kiểm hiển thị,
  // thẻ dán trang lỗi không hiện gì. Kiểm cả hai nhánh + chốt "chỉ đo, không tự sửa".
  it('dán trang CÓ lỗi hiển thị → đo trang dán, thẻ hiện nút "Trình bày lại", KHÔNG gọi lượt tự sửa', async () => {
    aiApi.landingFromHtml.mockResolvedValue(pasteResponse(601));
    runLayoutAudit.mockResolvedValue(BROKEN_AUDIT);

    await pasteIntoChat(PASTED_HTML);

    expect(await screen.findByText('landingPageCard.relayoutSection')).toBeInTheDocument();
    expect(runLayoutAudit).toHaveBeenCalledTimes(1);
    expect(runLayoutAudit.mock.calls[0][0]).toContain('<h1>Chào</h1>');
    // Tin dán không có lượt tự sửa miễn phí — không được bắn edit tự động (server sẽ trả 429).
    expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
  });

  it('dán vào PHIÊN MỚI → thẻ hiện "Đang kiểm tra hiển thị…" ngay trong lúc đo (id phiên đồng bộ kịp)', async () => {
    aiApi.landingFromHtml.mockResolvedValue(pasteResponse(603));
    let finishAudit;
    runLayoutAudit.mockImplementation(() => new Promise((resolve) => { finishAudit = resolve; }));

    await pasteIntoChat(PASTED_HTML);

    expect(await screen.findByText('landingPageCard.layoutChecking')).toBeInTheDocument();
    await waitFor(() => expect(finishAudit).toBeTypeOf('function'));
    finishAudit(CLEAN_AUDIT);
    expect(await screen.findByText('landingPageCard.layoutOk')).toBeInTheDocument();
  });

  it('dán trang sạch → thẻ hiện ✓ "Đã kiểm tra hiển thị", không có nút "Trình bày lại"', async () => {
    aiApi.landingFromHtml.mockResolvedValue(pasteResponse(602));
    runLayoutAudit.mockResolvedValue(CLEAN_AUDIT);

    await pasteIntoChat(PASTED_HTML);

    expect(await screen.findByText('landingPageCard.layoutOk')).toBeInTheDocument();
    expect(screen.queryByText('landingPageCard.relayoutSection')).not.toBeInTheDocument();
    expect(aiApi.editLandingHtml).not.toHaveBeenCalled();
  });

  it('gõ nguyên trang HTML → gọi landingFromHtml, KHÔNG gọi chat, thẻ landing hiện ra', async () => {
    aiApi.landingFromHtml.mockResolvedValue({
      success: true,
      data: {
        sessionId: 501,
        sessionTitle: 'Trang khách dán',
        message: {
          content: 'Đã nhận trang HTML "Trang khách dán".',
          type: 'landing_page',
          data: { title: 'Trang khách dán', html: PASTED_HTML, source: 'pasted' },
        },
      },
    });

    render(
      <MemoryRouter>
        <AiChatbot isOpen={true} />
      </MemoryRouter>
    );

    const textarea = await screen.findByPlaceholderText('aiChatbot.inputPlaceholder');
    fireEvent.change(textarea, { target: { value: PASTED_HTML } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(aiApi.landingFromHtml).toHaveBeenCalledTimes(1);
    });
    expect(aiApi.chat).not.toHaveBeenCalled();
    expect(aiApi.landingFromHtml).toHaveBeenCalledWith({ sessionId: null, html: PASTED_HTML });

    // Thẻ landing_page hiện ra với đúng tiêu đề backend trả về (tiêu đề còn lặp lại ở tab phiên
    // mới tạo — setSessions cùng lượt — nên có thể khớp nhiều chỗ, không chỉ ở thẻ).
    await waitFor(() => {
      expect(screen.getAllByText('Trang khách dán').length).toBeGreaterThan(0);
    });

    // Tin user trong lịch sử hiển thị là marker, KHÔNG chứa HTML thật (Bẫy 1 áp cho cả client).
    expect(screen.getByText(/Dán HTML có sẵn/)).toBeInTheDocument();
    expect(screen.queryByText(/<h1>/)).not.toBeInTheDocument();
  });

  it('HTML + câu lệnh thêm → sau khi thẻ hiện, gọi editLandingHtml với đúng câu lệnh', async () => {
    aiApi.landingFromHtml.mockResolvedValue({
      success: true,
      data: {
        sessionId: 502,
        sessionTitle: 'Trang khách dán',
        message: {
          content: 'Đã nhận trang HTML "Trang khách dán".',
          type: 'landing_page',
          data: { title: 'Trang khách dán', html: PASTED_HTML, source: 'pasted' },
        },
      },
    });
    aiApi.editLandingHtml.mockResolvedValue({
      success: true,
      data: { title: 'Trang khách dán', html: '<div>Trang đã đổi màu</div>' },
    });

    render(
      <MemoryRouter>
        <AiChatbot isOpen={true} />
      </MemoryRouter>
    );

    const textarea = await screen.findByPlaceholderText('aiChatbot.inputPlaceholder');
    const instruction = 'dùng trang này, đổi màu nút sang xanh';
    fireEvent.change(textarea, { target: { value: `${PASTED_HTML}\n${instruction}` } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(aiApi.landingFromHtml).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(aiApi.editLandingHtml).toHaveBeenCalledTimes(1);
    });

    const callArgs = aiApi.editLandingHtml.mock.calls[0][0];
    expect(callArgs.instruction).toBe(instruction);
    expect(callArgs.currentHtml).toBe(PASTED_HTML);
    // Phiên vừa tạo trong CÙNG lượt này (sessionId 502) — không phải null/currentSessionId cũ.
    expect(callArgs.sessionId).toBe(502);
  });

  it('có file đính kèm → KHÔNG bắt như dán HTML, vẫn đi qua chat như trước giờ', async () => {
    aiApi.chat.mockResolvedValue({
      success: true,
      data: { content: 'Đã nhận file', type: null, data: null, sessionId: 999, sessionTitle: 'Chat' },
    });
    api.post.mockImplementation((url) => {
      if (url === '/uploads/temp') {
        return Promise.resolve({
          data: { success: true, data: { tempId: 'temp_1', originalName: 'a.png', contentType: 'image/png', size: 10 } },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(
      <MemoryRouter>
        <AiChatbot isOpen={true} />
      </MemoryRouter>
    );

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText('a.png')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText('aiChatbot.inputPlaceholder');
    fireEvent.change(textarea, { target: { value: PASTED_HTML } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(aiApi.chat).toHaveBeenCalledTimes(1);
    });
    expect(aiApi.landingFromHtml).not.toHaveBeenCalled();
  });
});
